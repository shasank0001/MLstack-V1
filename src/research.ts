import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { Store } from './store.js';
import { projectPath } from './provenance.js';
import type { Memory } from './types.js';

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Discovery only: research documents remain ordinary, user-editable Markdown. */
export function researchIndex(store: Store, limit = 30) {
  const files: { path: string; title: string; sha256: string; modified_at: string }[] = [];
  const queue = ['research']; let visited = 0; let bounded = false;
  try {
    while (queue.length && visited < 2000) {
      const next = queue.shift()!;
      const path = projectPath(store.root, next);
      if (!existsSync(path) || lstatSync(join(store.root, next)).isSymbolicLink()) continue;
      for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (++visited > 2000) { bounded = true; break; }
        if (entry.isSymbolicLink()) continue;
        const item = join(next, entry.name);
        if (entry.isDirectory()) { if (item.split('/').length < 8) queue.push(item); else bounded = true; continue; }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const info = statSync(projectPath(store.root, item));
        // Oversized documents remain discoverable without loading their contents.
        const text = info.size <= 1024 * 1024 ? readFileSync(projectPath(store.root, item), 'utf8') : '';
        files.push({ path: item, title: text.match(/^#\s+(.+)$/m)?.[1]?.slice(0, 120) ?? basename(item),
          sha256: info.size <= 1024 * 1024 ? digest(text) : 'not-hashed:size-limit', modified_at: info.mtime.toISOString() });
      }
    }
    files.sort((a, b) => b.modified_at.localeCompare(a.modified_at) || a.path.localeCompare(b.path));
    const shown = Math.max(1, Math.min(60, limit));
    return { files: files.slice(0, shown), total: files.length, omitted: Math.max(0, files.length - shown), bounded: bounded || queue.length > 0 };
  } catch (error) {
    return { files: [], total: null, omitted: null, bounded, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Explicit, restartable export; never overwrites a document a user has edited. */
export function exportLegacyResearch(store: Store) {
  const folder = projectPath(store.root, 'research/legacy');
  // Research paths may not redirect exports through a symlink/alias.
  for (const part of ['research', 'research/legacy']) {
    const file = join(store.root, part);
    if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error('Research export needs real project-local directories');
  }
  mkdirSync(folder, { recursive: true });
  const manifestPath = join(store.state, 'research-export.json');
  type Entry = { path: string; source_sha256: string; exported_sha256: string };
  const manifest: Record<string, Entry> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const exported: string[] = [], unchanged: string[] = [], preserved_edits: string[] = [];
  function publish(key: string, source: string, content: string, filename: string) {
    const sourceHash = digest(source); const previous = manifest[key];
    if (previous?.source_sha256 === sourceHash && existsSync(projectPath(store.root, previous.path))) {
      const target = projectPath(store.root, previous.path);
      if (lstatSync(join(store.root, previous.path)).isSymbolicLink()) throw new Error('Export document cannot be a symlink');
      if (digest(readFileSync(target)) !== previous.exported_sha256) preserved_edits.push(previous.path);
      else unchanged.push(previous.path);
      return;
    }
    // A later legacy revision receives a distinct file, preserving earlier citations.
    const output = join('research/legacy', `${filename}-${sourceHash.slice(0, 12)}.md`);
    const target = projectPath(store.root, output);
    if (existsSync(target)) {
      if (lstatSync(join(store.root, output)).isSymbolicLink() || digest(readFileSync(target)) !== digest(content)) {
        preserved_edits.push(output); return;
      }
      unchanged.push(output);
    } else { writeFileSync(target, content, { flag: 'wx', mode: 0o600 }); exported.push(output); }
    manifest[key] = { path: output, source_sha256: sourceHash, exported_sha256: digest(content) };
  }
  const memories = store.list<Memory>('memories');
  for (const memory of memories) {
    const identity = /^[a-zA-Z0-9_-]+$/.test(memory.id) ? memory.id : digest(memory.id).slice(0, 24);
    const links = (memory.evidence ?? []).map(ref => `- [${ref.kind}: ${ref.run_id}](${relative(folder, join(store.root, ref.artifact))}) — SHA-256 ${ref.sha256}`);
    const text = `# Imported research record ${memory.id}\n\n${memory.claim}\n\nKind: ${memory.kind}. Status: ${memory.status}. Author: ${memory.author}. Created: ${memory.created_at}.\n\n${memory.limitations ? `Limitations: ${memory.limitations}\n\n` : ''}${memory.superseded_by ? `Corrected by: ${memory.superseded_by}\n\n` : ''}Runs: ${memory.run_ids.join(', ') || 'none'}\n\n${links.join('\n')}\n\nOriginal record (retained in MLStack's legacy archive):\n\n\`\`\`json\n${JSON.stringify(memory, null, 2)}\n\`\`\`\n`;
    publish(memory.id, JSON.stringify(memory), text, identity);
  }
  for (const name of ['project.md', 'research.md']) {
    const path = projectPath(store.root, `.mlstack/${name}`);
    if (!existsSync(path)) continue;
    const source = readFileSync(path, 'utf8');
    publish(`notes:${name}`, source, source, `legacy-${name.slice(0, -3)}`);
  }
  const temporary = join(store.state, `.research-export-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(manifest, null, 2), { mode: 0o600 }); renameSync(temporary, manifestPath);
  return { legacy_records: memories.length, exported, unchanged, preserved_edits, originals_retained: true, directory: 'research/legacy' };
}
