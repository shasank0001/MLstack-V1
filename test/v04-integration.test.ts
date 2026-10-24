import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { agentTools, workbenchContext } from '../src/agent.js';
import { ContextMemory } from '../src/memory.js';
import { Store } from '../src/store.js';

function memoryTool(store: Store, memory: ContextMemory, mode: 'discuss' | 'act' = 'act') {
  return agentTools(store, async () => false, { mode }, memory).find(tool => tool.name === 'memory')!;
}

test('agent memory writes flow into fresh scoped host context without crossing project namespaces', async () => {
  const base = mkdtempSync(join(tmpdir(), 'mlstack-v04-integration-'));
  const firstRoot = join(base, 'project-a'), secondRoot = join(base, 'project-b');
  mkdirSync(firstRoot); mkdirSync(secondRoot);
  const firstStore = new Store(firstRoot), secondStore = new Store(secondRoot);
  const home = join(base, 'memory-home');
  try {
    const firstMemory = new ContextMemory(firstStore, { home });
    const tool = memoryTool(firstStore, firstMemory);
    await tool.execute('user-style-write', { action: 'record', scope: 'user', key: 'style', text: 'Prefer concise answers' }, undefined, undefined, {} as never);
    await tool.execute('project-style-write', { action: 'record', scope: 'project', key: 'style', text: 'Show derivations for this project' }, undefined, undefined, {} as never);

    const firstContext = await workbenchContext(firstStore, firstMemory);
    assert.match(firstContext, /Show derivations for this project/);
    assert.doesNotMatch(firstContext, /Prefer concise answers/, 'project value overrides the same user preference key');

    const secondMemory = new ContextMemory(secondStore, { home });
    const secondContext = await workbenchContext(secondStore, secondMemory);
    assert.match(secondContext, /Prefer concise answers/, 'user preference is shared between projects');
    assert.doesNotMatch(secondContext, /Show derivations for this project/, 'project context stays isolated');

    const readTool = memoryTool(firstStore, firstMemory, 'discuss');
    const read = await readTool.execute('read', { action: 'list', scope: 'all' }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(read), /Show derivations for this project/);
    const userOnly = await readTool.execute('user-only', { action: 'search', query: '', scope: 'user' }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(userOnly), /Prefer concise answers/);
    assert.doesNotMatch(JSON.stringify(userOnly), /Show derivations for this project/);
    const projectOnly = await readTool.execute('project-only', { action: 'search', query: '', scope: 'project' }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(projectOnly), /Show derivations for this project/);
    assert.doesNotMatch(JSON.stringify(projectOnly), /Prefer concise answers/);
    await assert.rejects(readTool.execute('blocked-write', { action: 'record', scope: 'project', key: 'unsafe', text: 'must not be saved' }, undefined, undefined, {} as never), /act mode/);
    assert.equal((await firstMemory.search('must not be saved', 'all')).length, 0);
  } finally {
    firstStore.close(); secondStore.close(); rmSync(base, { recursive: true, force: true });
  }
});


test('CLI returns failure when a memory write or forget receives a failed SQLite acknowledgement', () => {
  const base = mkdtempSync(join(tmpdir(), 'mlstack-v04-cli-memory-'));
  const project = join(base, 'project'), home = join(base, 'home'), memoryDir = join(home, 'memory');
  mkdirSync(project); mkdirSync(memoryDir, { recursive: true });
  writeFileSync(join(memoryDir, 'context.sqlite'), 'corrupt sqlite file');
  const env = { ...process.env, MLSTACK_HOME: home };
  const cli = join(process.cwd(), 'dist', 'cli.js');
  try {
    const record = spawnSync(process.execPath, [cli, '--project', project, 'memory', 'record', '--key', 'style', '--text', 'Prefer concise answers'], { env, encoding: 'utf8' });
    assert.equal(record.status, 1, `failed record must not exit 0: ${record.stdout} ${record.stderr}`);
    assert.match(record.stdout, /"ok": false/);

    const forget = spawnSync(process.execPath, [cli, '--project', project, 'memory', 'forget', 'missing-id', '--scope', 'project'], { env, encoding: 'utf8' });
    assert.equal(forget.status, 1, `failed forget must not exit 0: ${forget.stdout} ${forget.stderr}`);
    assert.match(forget.stdout, /"ok": false/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
