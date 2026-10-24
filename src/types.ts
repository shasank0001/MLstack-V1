export interface EvidenceRef { run_id: string; kind: 'metrics' | 'execution' | 'logs' | 'source'; artifact: string; sha256: string; captured_at: string; }
export interface Project { id: string; name: string; root_at_creation: string; created_at: string; }
export type RunStatus = 'proposed' | 'approved' | 'active' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export type JobStatus = 'queued' | 'starting' | 'running' | 'exited' | 'failed' | 'terminated' | 'unreconciled';
export type IngestionStatus = 'pending' | 'complete' | 'error' | 'not_available';
export interface Protocol { dataset: string | null; split: string | null; evaluation: string | null; }
export interface RunSpec {
  name: string; command: string[]; metric: string; direction: 'maximize' | 'minimize';
  protocol: Protocol; seed?: number; baseline_run_id?: string; metrics_file?: string;
  source_files?: string[]; artifacts?: string[]; timeout_seconds: number;
}
export interface Provenance {
  source_digest: string; files: string[]; git_commit: string | null; git_dirty: boolean | null;
  platform: string; captured_at: string;
}
export interface Study { id: string; title: string; hypothesis: string; created_at: string; }
export interface Run {
  id: string; study_id: string; kind: 'managed' | 'imported'; spec: RunSpec; provenance: Provenance | null;
  status: RunStatus; ingestion: IngestionStatus; ingestion_error: string | null;
  approval_digest: string | null; approved_at: string | null; created_at: string;
  metrics_evidence?: EvidenceRef;
  capture?: ArtifactCapture;
  capture_error?: string | null;
  import_source?: { uri: string; run_id: string; captured_at: string; previous_snapshot_id?: string; artifact_uri?: string };
  mlflow: { uri: string; run_id: string } | null; mlflow_error: string | null;
}
export interface ProcessIdentity { pid: number; start: string; boot: string; }
export interface Job {
  id: string; run_id: string; status: JobStatus; worker: ProcessIdentity | null; child: ProcessIdentity | null;
  created_at: string; started_at: string | null; finished_at: string | null; heartbeat_at: string | null;
  exit_code: number | null; signal: string | null; reason: string | null; cancel_requested: boolean;
}
export interface MetricPoint { name: string; value: number; step: number; timestamp?: number; }
export interface MetricsDocument { schema_version: 1; metrics: MetricPoint[]; }
export type MemoryKind = 'context' | 'observation' | 'hypothesis' | 'finding' | 'decision' | 'correction' | 'question';
export interface Memory {
  id: string; kind: MemoryKind; claim: string; run_ids: string[]; limitations: string; author: string;
  evidence?: EvidenceRef[];
  status: 'current' | 'tentative' | 'superseded'; superseded_by: string | null; created_at: string;
}

export interface CapturedFile { path: string; role: 'specification' | 'log' | 'source' | 'output' | 'metrics' | 'environment'; size_bytes: number; sha256: string; captured_path: string; }
export interface ArtifactCapture { manifest: string; sha256: string; captured_at: string; status: 'complete' | 'error'; errors: string[]; }
export interface CaptureManifest { schema_version: 1; run_id: string; captured_at: string; content_digest: string; command: string[]; protocol: Protocol; source: Provenance | null; environment: Record<string, unknown>; files: CapturedFile[]; errors: string[]; }
