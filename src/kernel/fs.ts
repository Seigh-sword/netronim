import { db } from './db';
import { osStore } from './store';
import { basename, dirname, extension, normalizePath, uniquePath } from './utils';
import type { FileRecord, VNode, FileKind } from './types';
import type { EventBus } from './bus';

const MIME: Record<string, [FileKind, string]> = {
  '.nif': ['image', 'image/webp'], '.vid': ['video', 'video/webm'], '.aud': ['audio', 'audio/webm'],
  '.png': ['image','image/png'], '.jpg': ['image','image/jpeg'], '.jpeg': ['image','image/jpeg'], '.webp': ['image','image/webp'], '.svg': ['image','image/svg+xml'],
  '.webm': ['video','video/webm'], '.mp4': ['video','video/mp4'], '.mp3': ['audio','audio/mpeg'], '.wav': ['audio','audio/wav'],
  '.html': ['text','text/html'], '.json': ['text','application/json'], '.md': ['text','text/markdown'], '.txt': ['text','text/plain'],
};
export function fileMeta(path: string, size = 0, type: 'file' | 'directory' = 'file'): VNode {
  const [kind, mime] = MIME[extension(path)] || ['text', 'text/plain'];
  return { path, name: basename(path), parent: dirname(path), type, kind: type === 'directory' ? 'directory' : kind, size, mime: type === 'directory' ? 'inode/directory' : mime, created: Date.now(), modified: Date.now(), mode: type === 'directory' ? 0o755 : 0o644, owner: osStore.getState().settings.username };
}
const strip = ({ data, ...node }: FileRecord): VNode => node;
export class FileSystem {
  constructor(private bus: EventBus) {}
  async init() {
    let records = await db.all<FileRecord>('files');
    if (!records.length) {
      const directories = ['/System','/System/Logs','/Home','/Home/Documents','/Home/Downloads','/Home/Pictures','/Home/Music','/Home/Videos','/Home/Desktop','/Home/Projects','/Home/.config','/Trash'];
      records = directories.map(p => fileMeta(p, 0, 'directory'));
      const seeds: [string, string][] = [
        ['/Home/Documents/Welcome to Netronim.txt', 'Welcome to your new workspace.\n\nNetronim keeps your files, apps, settings, and creations right here in your browser.\n\nA few things to try:\n• Drag a window by its title bar. Double-click it to maximize.\n• Drag a window to either screen edge to snap it.\n• Open Terminal and type help.\n• Drop an image, audio file, or video onto the desktop.\n• Make something in Sketchbook or ronimCanvas.\n• Install an HTML app or an .npk in Settings → Apps.\n\nYour data stays in this browser profile. Export a backup regularly; clearing site data removes it.\n\nHave a lovely day,\nNetronim'],
        ['/Home/Projects/hello.ts', '// A small beginning.\ninterface Universe {\n  name: string;\n  possibilities: number;\n}\n\nconst netronim: Universe = {\n  name: "Your workspace",\n  possibilities: Infinity,\n};\n\nconsole.log(`Hello, ${netronim.name}!`);\n'],
        ['/Home/Projects/ideas.md', '# A place for your next big idea\n\n- [ ] Make something useful\n- [ ] Leave things better than you found them\n- [ ] Take a break\n'],
        ['/Home/.config/system.json', JSON.stringify({ OS: 'Netronim', version: '1.0.0', filesystem: 'IndexedDB', renderer: ['RendyGL', 'HTML5View'] }, null, 2)],
      ];
      for (const [path, text] of seeds) records.push({ ...fileMeta(path, new Blob([text]).size), data: new Blob([text], { type: 'text/plain' }) });
      await db.batch('files', records);
    }
    osStore.setState({ files: records.map(strip) });
  }
  node(path: string): VNode | undefined { const normalized = normalizePath(path); return osStore.getState().files.find(f => f.path === normalized); }
  list(path = '/Home'): VNode[] { const normalized = normalizePath(path); return osStore.getState().files.filter(f => f.parent === normalized && f.path !== normalized).sort((a,b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1)); }
  descendants(path: string): VNode[] { return osStore.getState().files.filter(f => f.path.startsWith(path === '/' ? '/' : path + '/')); }
  private writable(path: string) {
    if (path === '/' || path.startsWith('/System')) throw new Error('This system location is protected.');
    const node = this.node(path); if (node && !(node.mode & 0o200)) throw new Error(`Permission denied: ${path}`);
    const parent = this.node(dirname(path)); if (parent && !(parent.mode & 0o200)) throw new Error(`Permission denied: ${dirname(path)}`);
  }
  private publish(records: FileRecord[], removed: string[] = []) {
    const changes = new Map(records.map(r => [r.path, strip(r)]));
    osStore.setState(s => ({ files: [...s.files.filter(f => !removed.includes(f.path) && !changes.has(f.path)), ...changes.values()] }));
    this.bus.emit('fs:changed', { changed: records.map(r => r.path), removed });
  }
  async mkdir(path: string): Promise<VNode> {
    path = normalizePath(path); this.writable(path);
    if (this.node(path)) throw new Error(`${basename(path)} already exists.`);
    const segments = path.split('/').filter(Boolean); let current = '';
    const additions: FileRecord[] = [];
    for (const part of segments) { current += '/' + part; if (!this.node(current)) additions.push(fileMeta(current, 0, 'directory')); else if (this.node(current)?.type !== 'directory') throw new Error(`${current} is not a folder.`); }
    await db.batch('files', additions); this.publish(additions); return additions.find(f => f.path === path)!;
  }
  async write(path: string, data: Blob | string, mime?: string): Promise<VNode> {
    path = normalizePath(path); this.writable(path);
    if (this.node(path)?.type === 'directory') throw new Error('Cannot overwrite a folder with a file.');
    if (!this.node(dirname(path))) await this.mkdir(dirname(path));
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    const old = this.node(path); const base = fileMeta(path, blob.size);
    const record: FileRecord = { ...base, created: old?.created || base.created, mode: old?.mode ?? base.mode, owner: old?.owner || base.owner, mime: mime || (mime === undefined && old && extension(old.path) === extension(path) ? old.mime : base.mime), data: blob };
    if (mime) record.kind = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'text';
    await db.put('files', record); this.publish([record]); return strip(record);
  }
  async read(path: string): Promise<Blob> {
    path = normalizePath(path); const node = this.node(path);
    if (!node) throw new Error(`No such file: ${path}`);
    if (node.type === 'directory') throw new Error(`${path} is a directory.`);
    if (!(node.mode & 0o400)) throw new Error(`Permission denied: ${path}`);
    const record = await db.get<FileRecord>('files', path);
    if (!record?.data) throw new Error(`File data is unavailable: ${path}`);
    return record.data;
  }
  async text(path: string) { return (await this.read(path)).text(); }
  async remove(path: string) {
    path = normalizePath(path); this.writable(path);
    const node = this.node(path); if (!node) throw new Error(`No such file: ${path}`);
    const paths = [path, ...this.descendants(path).map(n => n.path)];
    for (const p of paths) this.writable(p);
    await db.batch('files', [], paths); this.publish([], paths);
  }
  async rename(path: string, name: string) {
    if (!name.trim() || /[\/\\\0]/.test(name) || name === '.' || name === '..') throw new Error('Enter a valid filename without slashes.');
    return this.move(path, dirname(normalizePath(path)) + '/' + name);
  }
  async move(source: string, destination: string) {
    source = normalizePath(source); destination = normalizePath(destination); this.writable(source); this.writable(destination);
    const node = this.node(source); if (!node) throw new Error(`No such file: ${source}`);
    if (source === destination) return;
    if (destination.startsWith(source + '/')) throw new Error('Cannot move a folder inside itself.');
    if (this.node(destination)) throw new Error(`${basename(destination)} already exists.`);
    if (!this.node(dirname(destination))) await this.mkdir(dirname(destination));
    const nodes = [node, ...this.descendants(source)]; const records: FileRecord[] = [];
    for (const n of nodes) {
      const path = destination + n.path.slice(source.length); const old = await db.get<FileRecord>('files', n.path);
      records.push({ ...old!, path, name: basename(path), parent: dirname(path), modified: Date.now() });
    }
    await db.batch('files', records, nodes.map(n => n.path)); this.publish(records, nodes.map(n => n.path));
  }
  async copy(source: string, destination: string, move = false): Promise<string> {
    source = normalizePath(source); this.writable(source);
    const node = this.node(source); if (!node) throw new Error(`No such file: ${source}`);
    destination = uniquePath(normalizePath(destination), p => !!this.node(p));
    if (move) { await this.move(source, destination); return destination; }
    this.writable(destination);
    if (!this.node(dirname(destination))) await this.mkdir(dirname(destination));
    const nodes = [node, ...this.descendants(source)]; const records: FileRecord[] = [];
    for (const n of nodes) {
      const path = destination + n.path.slice(source.length);
      const old = await db.get<FileRecord>('files', n.path);
      records.push({ ...old!, path, name: basename(path), parent: dirname(path), created: Date.now(), modified: Date.now() });
    }
    await db.batch('files', records); this.publish(records); return destination;
  }
  async chmod(path: string, mode: number) {
    path = normalizePath(path); const node = this.node(path); if (!node) throw new Error(`No such file: ${path}`);
    if (mode < 0 || mode > 0o777) throw new Error('Use an octal mode between 000 and 777.');
    const record = { ...(await db.get<FileRecord>('files', path))!, mode, modified: Date.now() };
    await db.put('files', record); this.publish([record]);
  }
  async trash(path: string) {
    if (path.startsWith('/Trash/')) return this.remove(path);
    const name = uniquePath('/Trash/' + basename(path), p => !!this.node(p));
    await this.move(path, name);
  }
}
