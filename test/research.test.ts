import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './fixtures.js';
import { remember } from '../src/core.js';
import { researchIndex, exportLegacyResearch } from '../src/research.js';

test('research discovery accepts freeform nested documents and observes changes without storing a second copy', () => {
  const f = fixture();
  try {
    assert.equal(researchIndex(f.store).total, 0);
    mkdirSync(join(f.root, 'research/ideas'), { recursive: true });
    writeFileSync(join(f.root, 'research/ideas/anything.md'), 'No mandatory headings or schema.');
    const first = researchIndex(f.store); assert.equal(first.total, 1);
    const hash = first.files[0]!.sha256;
    writeFileSync(join(f.root, 'research/ideas/anything.md'), 'A revised hypothesis, in my own format.');
    assert.notEqual(researchIndex(f.store).files[0]!.sha256, hash);
    symlinkSync('/etc', join(f.root, 'research/outside'));
    assert.equal(researchIndex(f.store).total, 1);
  } finally { f.cleanup(); }
});

test('legacy export retains corrections/originals, is restartable and preserves user edits', () => {
  const f = fixture();
  try {
    const old = remember(f.store, 'hypothesis', 'First hypothesis');
    const current = remember(f.store, 'correction', 'The first hypothesis is unresolved', [], 'No run evidence yet', 'user', old.id);
    const exported = exportLegacyResearch(f.store);
    assert.equal(exported.legacy_records, 2); assert.equal(exported.exported.length, 4);
    assert.equal(f.store.memory(old.id).superseded_by, current.id);
    const path = exported.exported.find(file => file.includes(old.id))!;
    assert.match(readFileSync(join(f.root, path), 'utf8'), new RegExp(current.id));
    assert.equal(exportLegacyResearch(f.store).exported.length, 0);
    writeFileSync(join(f.root, path), 'User reorganized this into ordinary research notes.');
    assert.ok(exportLegacyResearch(f.store).preserved_edits.includes(path));
    assert.equal(readFileSync(join(f.root, path), 'utf8'), 'User reorganized this into ordinary research notes.');
    assert.equal(f.store.list('memories').length, 2);
  } finally { f.cleanup(); }
});

test('legacy export rejects redirected research directories', () => {
  const f = fixture();
  try { symlinkSync('/tmp', join(f.root, 'research')); assert.throws(() => exportLegacyResearch(f.store)); }
  finally { f.cleanup(); }
});
