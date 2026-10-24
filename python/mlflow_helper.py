"""JSON-in/JSON-out MLflow adapter. No training execution takes place here."""
import json
import sys
import time
import hashlib
import fcntl
import tempfile
from pathlib import Path


def main(request):
    from mlflow.tracking import MlflowClient
    from mlflow.entities import Metric, Param, RunTag
    client = MlflowClient(tracking_uri=request['uri'])
    if request['operation'] == 'import':
        run = client.get_run(request['run_id'])
        metrics = []
        for key in run.data.metrics:
            for point in client.get_metric_history(run.info.run_id, key):
                metrics.append({'name': point.key, 'value': point.value, 'step': point.step, 'timestamp': point.timestamp})
        # MLflow allows repeated values at a step. Preserve the last timestamp for the V1 snapshot.
        latest = {}
        for point in sorted(metrics, key=lambda p: p['timestamp']):
            latest[(point['name'], point['step'])] = point
        return {'run_id': run.info.run_id, 'status': run.info.status, 'artifact_uri': run.info.artifact_uri,
                'params': run.data.params, 'tags': run.data.tags, 'inputs': run.inputs.to_dictionary() if run.inputs else None,
                'document': {'schema_version': 1, 'metrics': list(latest.values())}}
    if request['operation'] != 'sync':
        raise ValueError('Unknown adapter operation')
    local_id = request['local_id']
    experiment = client.get_experiment_by_name('MLStack')
    if experiment is None:
        try:
            experiment_id = client.create_experiment('MLStack', artifact_location=Path(request['artifact_root']).as_uri())
        except Exception:
            experiment = client.get_experiment_by_name('MLStack')
            if experiment is None:
                raise
            experiment_id = experiment.experiment_id
    else:
        experiment_id = experiment.experiment_id
    document = request['document']
    metrics_digest = hashlib.sha256(json.dumps(document, sort_keys=True).encode()).hexdigest()
    digest = hashlib.sha256(json.dumps({'document': document, 'capture_sha256': request['capture']['sha256']}, sort_keys=True).encode()).hexdigest()
    manifest = request['manifest']
    root = Path(request['project_root']).resolve()
    # Validate every local byte before creating or changing an external publication.
    for artifact in manifest['files']:
        source = (root / artifact['captured_path']).resolve()
        if not source.is_relative_to(root / '.mlstack' / 'runs' / local_id / 'captures' / 'blobs'):
            raise ValueError('Capture artifact escaped run storage')
        content = source.read_bytes()
        if len(content) != artifact['size_bytes'] or hashlib.sha256(content).hexdigest() != artifact['sha256']:
            raise ValueError('Artifact integrity check failed: ' + artifact['path'])
    matches = client.search_runs([experiment_id], filter_string=f"tags.`mlstack.run_id` = '{local_id}'")
    # Each captured metrics document has an immutable external revision. A retry
    # claims the same revision even if an earlier sync stopped before logging all points.
    target = next((run for run in matches if run.data.tags.get('mlstack.revision_digest',
                       run.data.tags.get('mlstack.metrics_digest')) == digest), None)
    if target is None:
        tags = {'mlstack.run_id': local_id, 'mlstack.revision_digest': digest}
        if request.get('previous_run_id'):
            tags['mlstack.previous_revision'] = request['previous_run_id']
        target = client.create_run(experiment_id, tags=tags)
    run_id = target.info.run_id
    spec = request['spec']
    params = {'name': spec['name'], 'metric': spec['metric'], 'direction': spec['direction'],
              'command': json.dumps(spec['command']), 'timeout_seconds': str(spec['timeout_seconds'])}
    if 'seed' in spec:
        params['seed'] = str(spec['seed'])
    client.log_batch(run_id, params=[Param(k, v) for k, v in params.items() if k not in target.data.params],
                     tags=[RunTag('mlstack.protocol', json.dumps(spec['protocol'])),
                           RunTag('mlstack.source_digest', request['source_digest']),
                           RunTag('mlstack.study_id', request['study_id'])])
    client.update_run(run_id, status='RUNNING')
    client.set_tag(run_id, 'mlstack.publication_status', 'pending')
    if target.data.tags.get('mlstack.metrics_digest') != metrics_digest:
        # Check existing points so retrying a partially completed sync does not duplicate metric entries.
        existing = {}
        for name in {point['name'] for point in document['metrics']}:
            existing[name] = {(p.step, p.value) for p in client.get_metric_history(run_id, name)}
        points = [Metric(p['name'], p['value'], p.get('timestamp', int(time.time() * 1000)), p['step'])
                  for p in document['metrics'] if (p['step'], p['value']) not in existing[p['name']]]
        for start in range(0, len(points), 1000):
            client.log_batch(run_id, metrics=points[start:start + 1000])
        client.set_tag(run_id, 'mlstack.metrics_digest', metrics_digest)
    # Publish only frozen bytes, verify a downloaded roundtrip, then announce completion.
    try:
        with tempfile.TemporaryDirectory(prefix='mlstack-mlflow-') as directory:
            stage = Path(directory)
            for artifact in manifest['files']:
                source = root / artifact['captured_path']
                destination = stage / artifact['path']
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(source.read_bytes())
                parent = str(Path(artifact['path']).parent)
                client.log_artifact(run_id, str(destination), artifact_path=None if parent == '.' else parent)
                with tempfile.TemporaryDirectory(prefix='mlstack-verify-') as downloaded:
                    published = Path(client.download_artifacts(run_id, artifact['path'], downloaded))
                    if hashlib.sha256(published.read_bytes()).hexdigest() != artifact['sha256']:
                        raise ValueError('Published artifact integrity check failed: ' + artifact['path'])
            capture_manifest = stage / 'capture.manifest.json'
            capture_manifest.write_bytes((root / request['capture']['manifest']).read_bytes())
            if hashlib.sha256(capture_manifest.read_bytes()).hexdigest() != request['capture']['sha256']:
                raise ValueError('Capture manifest integrity check failed')
            client.log_artifact(run_id, str(capture_manifest))
            with tempfile.TemporaryDirectory(prefix='mlstack-manifest-verify-') as downloaded:
                published_manifest = Path(client.download_artifacts(run_id, 'capture.manifest.json', downloaded))
                if hashlib.sha256(published_manifest.read_bytes()).hexdigest() != request['capture']['sha256']:
                    raise ValueError('Published capture manifest integrity check failed')
        client.set_tag(run_id, 'mlstack.capture_sha256', request['capture']['sha256'])
        client.set_tag(run_id, 'mlstack.publication_status', 'complete')
        client.set_terminated(run_id, status=request['status'])
    except Exception:
        client.set_tag(run_id, 'mlstack.publication_status', 'error')
        raise
    return {'run_id': run_id, 'uri': request['uri'], 'revision_digest': digest}


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        with open(request['lock_path'], 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            result = main(request)
        print(json.dumps(result, allow_nan=False))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
