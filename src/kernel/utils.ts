import type { DialogRequest } from './types';
import { osStore } from './store';
export const uid = () => crypto.randomUUID();
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}
export function normalizePath(path: string, cwd = '/Home'): string {
  let value = path.trim().replace(/^~(?=\/|$)/, '/Home');
  if (!value.startsWith('/')) value = `${cwd}/${value}`;
  const parts: string[] = [];
  for (const part of value.split('/')) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); }
  return '/' + parts.join('/');
}
export const basename = (path: string) => path.split('/').filter(Boolean).pop() || '/';
export const dirname = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
export const extension = (path: string) => path.includes('.') ? '.' + path.split('.').pop()!.toLowerCase() : '';
export function uniquePath(path: string, exists: (p: string) => boolean): string {
  if (!exists(path)) return path;
  const dot = path.lastIndexOf('.'); const base = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
  const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
  let i = 2; while (exists(`${base} (${i})${ext}`)) i++;
  return `${base} (${i})${ext}`;
}
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const diff = (pa[i] || 0) - (pb[i] || 0); if (diff) return diff; }
  return 0;
}
export function download(data: Blob | string, name: string, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function dialog(request: Omit<DialogRequest, 'resolve' | 'input'> & { input?: boolean }): Promise<string | null> {
  return new Promise(resolve => osStore.setState({ dialog: { ...request, input: request.input ?? false, resolve } }));
}
export const escapeHTML = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
export function safeURL(input: string): string {
  let value = input.trim();
  if (!value) throw new Error('Enter a website address.');
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP and HTTPS URLs are supported.');
  return url.href;
}
