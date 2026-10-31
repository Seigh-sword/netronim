import type { AppManifest } from './types';
import { PERMISSIONS } from './types';
import { compareVersions } from './utils';

// NPK1: bounded, independently DEFLATE-compressed entries + a compressed JSON directory.
// No extraction to a host filesystem, no executable metadata, and checksums on every entry.
const MAGIC = new Uint8Array([0x4e, 0x50, 0x4b, 0x01]);
const MAX_FILES = 512, MAX_FILE = 24 * 1024 * 1024, MAX_TOTAL = 96 * 1024 * 1024;
interface Entry { name: string; offset: number; length: number; size: number; crc: number; method: 'deflate-raw' | 'store' }
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
export async function sha256(bytes: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''); }
async function transform(bytes: Uint8Array, compression: boolean, limit: number): Promise<Uint8Array> {
  const Stream = compression ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (!Stream) { if (!compression) throw new Error('This browser cannot decompress NPK archives.'); return bytes; }
  const stream = new Blob([bytes as BufferSource]).stream().pipeThrough(new Stream('deflate-raw'));
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error('Archive expands beyond the safe size limit.'); } chunks.push(value); }
  const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
}
export function validArchivePath(name: string): boolean {
  return name.length > 0 && name.length < 240 && !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') && name.split('/').every(p => p && p !== '.' && p !== '..') && !/^[a-z]:/i.test(name);
}
export function validateManifest(value: unknown): AppManifest {
  if (!value || typeof value !== 'object') throw new Error('The package has no valid manifest.');
  const m = value as AppManifest;
  if (typeof m.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(m.id)) throw new Error('Invalid app ID. Use lowercase letters, numbers, and hyphens.');
  for (const key of ['name','version','author','description','icon'] as const) if (typeof m[key] !== 'string' || m[key].length > (key === 'description' ? 2000 : 160)) throw new Error(`Invalid manifest field: ${key}`);
  if (!/^\d+\.\d+\.\d+$/.test(m.version) || !/^\d+\.\d+\.\d+$/.test(m.min_os_version)) throw new Error('Versions must use major.minor.patch.');
  if (!['rendygl','html5view'].includes(m.type)) throw new Error('Unknown rendering pipeline.');
  if (!Array.isArray(m.permissions) || m.permissions.some(p => !PERMISSIONS.includes(p))) throw new Error('The manifest requests an unknown permission.');
  if (m.associations && (!Array.isArray(m.associations) || m.associations.some(a => typeof a !== 'string' || !/^\.[a-z0-9]{1,12}$/i.test(a)))) throw new Error('Invalid file association.');
  return { id: m.id, name: m.name, version: m.version, author: m.author, description: m.description, icon: m.icon.slice(0, 8), color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#b7a3f7', type: m.type, min_os_version: m.min_os_version, permissions: [...new Set(m.permissions)], category: ['System','Productivity','Media','Utilities','Games'].includes(m.category) ? m.category : 'Utilities', entry: typeof m.entry === 'string' ? m.entry : undefined, associations: m.associations || [] };
}
export async function encodeNPK(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const names = Object.keys(files); if (names.length > MAX_FILES) throw new Error(`NPK supports at most ${MAX_FILES} files.`);
  let total = 0; const entries: Entry[] = []; const parts: Uint8Array[] = []; let offset = 0;
  for (const name of names) {
    if (!validArchivePath(name)) throw new Error(`Unsafe archive path: ${name}`);
    const bytes = files[name]; total += bytes.length;
    if (bytes.length > MAX_FILE || total > MAX_TOTAL) throw new Error('Package exceeds the 96 MB expanded / 24 MB per-file limit.');
    let method: Entry['method'] = 'deflate-raw'; let payload = bytes;
    if (globalThis.CompressionStream) { const compressed = await transform(bytes, true, MAX_FILE); if (compressed.length < bytes.length) payload = compressed; else method = 'store'; } else method = 'store';
    entries.push({ name, offset, length: payload.length, size: bytes.length, crc: crc32(bytes), method }); parts.push(payload); offset += payload.length;
  }
  const directory = await transform(encoder.encode(JSON.stringify(entries)), true, 1024 * 1024);
  const header = new Uint8Array(32); const view = new DataView(header.buffer); header.set(MAGIC); view.setUint16(4, 1, true); view.setUint32(8, entries.length, true);
  view.setBigUint64(12, BigInt(offset), true); view.setBigUint64(20, BigInt(directory.length), true); view.setUint32(28, crc32(header.slice(0,28)), true);
  const result = new Uint8Array(32 + offset + directory.length); result.set(header); let at = 32;
  for (const part of [...parts, directory]) { result.set(part, at); at += part.length; } return result;
}
export async function decodeNPK(input: Uint8Array): Promise<Record<string, Uint8Array>> {
  if (input.length > 64 * 1024 * 1024 || input.length < 34) throw new Error('Invalid or oversized NPK archive.');
  if (!MAGIC.every((b, i) => input[i] === b)) throw new Error('Not a Netronim NPK archive.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.getUint16(4, true) !== 1 || view.getUint16(6, true) !== 0 || crc32(input.slice(0,28)) !== view.getUint32(28, true)) throw new Error('Unsupported or corrupt NPK header.');
  const count = view.getUint32(8, true), offset = Number(view.getBigUint64(12, true)), length = Number(view.getBigUint64(20, true));
  if (count > MAX_FILES || offset > input.length || length > 1024 * 1024 || 32 + offset + length !== input.length) throw new Error('Invalid archive directory bounds.');
  let entries: Entry[];
  try { entries = JSON.parse(decoder.decode(await transform(input.slice(32 + offset), false, 1024 * 1024))); } catch { throw new Error('Corrupt archive directory.'); }
  if (!Array.isArray(entries) || entries.length !== count) throw new Error('Archive entry count mismatch.');
  const files: Record<string, Uint8Array> = Object.create(null); let end = 0, total = 0; const names = new Set<string>();
  for (const entry of entries) {
    if (!entry || !validArchivePath(entry.name) || names.has(entry.name) || ['__proto__','constructor','prototype'].includes(entry.name) || !['store','deflate-raw'].includes(entry.method)) throw new Error('Unsafe or duplicate archive entry.');
    if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || !Number.isSafeInteger(entry.size) || entry.offset !== end || entry.length < 0 || entry.size < 0 || entry.size > MAX_FILE || 32 + entry.offset + entry.length > 32 + offset) throw new Error('Invalid archive entry bounds.');
    total += entry.size; if (total > MAX_TOTAL) throw new Error('Archive expanded size exceeds the safe limit.');
    const payload = input.slice(32 + entry.offset, 32 + entry.offset + entry.length);
    const bytes = entry.method === 'store' ? payload : await transform(payload, false, entry.size);
    if (bytes.length !== entry.size || crc32(bytes) !== entry.crc >>> 0) throw new Error(`Checksum failed: ${entry.name}`);
    files[entry.name] = bytes; names.add(entry.name); end += entry.length;
  }
  if (!files['_META/manifest.json']) throw new Error('Missing _META/manifest.json.');
  return files;
}
export async function packageFiles(manifest: AppManifest, entryFiles: Record<string, Uint8Array>, notes = ['Initial release.']): Promise<Record<string, Uint8Array>> {
  const m = validateManifest(manifest);
  const files: Record<string, Uint8Array> = { ...entryFiles,
    '_META/manifest.json': encoder.encode(JSON.stringify(m, null, 2)),
    '_META/changelog.json': encoder.encode(JSON.stringify([{ version: m.version, date: new Date().toISOString().slice(0,10), notes }])),
    '_HEADERS/api.xml': encoder.encode(`<api version="1">${m.permissions.map(p => `<permission name="${p}" />`).join('')}</api>`),
    '_HEADERS/associations.json': encoder.encode(JSON.stringify(m.associations || [])),
    '_HEADERS/ipc.xml': encoder.encode('<ipc version="1"><interface name="netronim.bridge" /></ipc>'),
  };
  return files;
}
export function readManifest(files: Record<string, Uint8Array>): AppManifest {
  const m = validateManifest(JSON.parse(decoder.decode(files['_META/manifest.json'])));
  if (compareVersions(m.min_os_version, '1.0.0') > 0) throw new Error(`This app requires Netronim ${m.min_os_version} or newer.`);
  if (m.type === 'html5view' && !files['index.html'] && !m.entry?.startsWith('https://')) throw new Error('HTML5View packages need index.html or an HTTPS entry URL.');
  if (m.type === 'rendygl' && !files['app.wasm']) throw new Error('RendyGL packages need app.wasm.');
  return m;
}
