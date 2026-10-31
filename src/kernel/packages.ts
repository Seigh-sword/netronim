import { db } from './db';
import { osStore } from './store';
import { BUILTIN_MANIFESTS } from '../apps/manifests';
import { decodeNPK, encodeNPK, packageFiles, readManifest } from './npk';
import { compareVersions, dialog, safeURL, uid } from './utils';
import type { AppManifest, InstalledPackage } from './types';
export class PackageManager {
  async init() {
    const records = await db.all<{ key: string } & InstalledPackage>('packages');
    const installed = records.filter(p => !p.builtin && p.manifest?.id);
    const builtins = BUILTIN_MANIFESTS.map(manifest => ({ manifest, builtin: true, installedAt: 0 }));
    osStore.setState({ packages: [...builtins, ...installed.filter(p => !BUILTIN_MANIFESTS.some(m => m.id === p.manifest.id))] });
  }
  get(id: string) { return osStore.getState().packages.find(p => p.manifest.id === id); }
  async installBytes(bytes: Uint8Array, trusted = false): Promise<AppManifest> {
    const files = await decodeNPK(bytes); const manifest = readManifest(files);
    const existing = this.get(manifest.id);
    if (existing?.builtin) throw new Error('Built-in system apps cannot be replaced by a package.');
    if (existing && compareVersions(manifest.version, existing.manifest.version) < 0 && !trusted) throw new Error('Use Archive Studio to confirm a package downgrade.');
    if (!trusted) {
      const answer = await dialog({ title: `Install ${manifest.name}?`, message: `${manifest.version} · ${manifest.author}\n\n${manifest.description}\n\nPermissions: ${manifest.permissions.length ? manifest.permissions.join(', ') : 'No privileged OS APIs'}.\n\nOnly install packages from people you trust. HTML5View runs in a sandbox; WebAssembly runs in a worker.`, confirmLabel: 'Install app' });
      if (answer === null) throw new Error('Installation cancelled.');
    }
    let associations: unknown = manifest.associations || [];
    if (files['_HEADERS/associations.json']) { associations = JSON.parse(new TextDecoder().decode(files['_HEADERS/associations.json'])); if (!Array.isArray(associations) || associations.some(a => typeof a !== 'string' || !/^\.[a-z0-9]{1,12}$/i.test(a))) throw new Error('Invalid association header.'); manifest.associations = associations as string[]; }
    let changelog: InstalledPackage['changelog'] = [];
    if (files['_META/changelog.json']) { const parsed = JSON.parse(new TextDecoder().decode(files['_META/changelog.json'])); if (Array.isArray(parsed)) changelog = parsed.slice(0,100); }
    const record: InstalledPackage = { manifest, builtin: false, installedAt: Date.now(), files, changelog, headers: { api: files['_HEADERS/api.xml'] ? new TextDecoder().decode(files['_HEADERS/api.xml']) : '', associations: JSON.stringify(associations), ipc: files['_HEADERS/ipc.xml'] ? new TextDecoder().decode(files['_HEADERS/ipc.xml']) : '' } };
    await db.put('packages', { key: manifest.id, ...record });
    osStore.setState(s => ({ packages: [...s.packages.filter(p => p.manifest.id !== manifest.id), record] })); return manifest;
  }
  async installFile(file: Blob, trusted = false) { return this.installBytes(new Uint8Array(await file.arrayBuffer()), trusted); }
  async installWebApp(input: string | File, name?: string): Promise<AppManifest> {
    let title = name?.trim(), html: string, entry: string | undefined;
    if (input instanceof File) { html = await input.text(); if (html.length > 4 * 1024 * 1024) throw new Error('Single-file HTML apps are limited to 4 MB. Use NPK for larger apps.'); title ||= input.name.replace(/\.html?$/i, ''); }
    else { entry = safeURL(input); title ||= new URL(entry).hostname.replace(/^www\./, ''); html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#141824}body{color:#ccd;font:15px system-ui}p{padding:24px}</style></head><body><iframe src="${entry.replace(/"/g,'&quot;')}" referrerpolicy="no-referrer"></iframe></body></html>`; }
    if (!title || title.length > 60) throw new Error('Choose an app name between 1 and 60 characters.');
    const manifest: AppManifest = { id: 'web-' + uid().slice(0,8), name: title, version: '1.0.0', author: entry ? new URL(entry).hostname : 'Local app', description: entry ? `Web wrapper for ${entry}. The site may restrict embedded access.` : 'A locally installed, sandboxed HTML application.', icon: 'Globe2', color: '#8ebaf6', type: 'html5view', min_os_version: '1.0.0', permissions: entry ? ['network'] : [], category: 'Productivity', entry };
    const files = await packageFiles(manifest, { 'index.html': new TextEncoder().encode(html) });
    const bytes = await encodeNPK(files); return this.installBytes(bytes, true);
  }
  async uninstall(id: string) {
    const pkg = this.get(id); if (!pkg) throw new Error('App is not installed.'); if (pkg.builtin) throw new Error('System apps are part of the OS and cannot be uninstalled.');
    const wins = osStore.getState().windows.filter(w => w.appId === id); wins.forEach(w => osStore.getState().windows && window.dispatchEvent(new CustomEvent('netronim:close-app', { detail: w.id })));
    await db.remove('packages', id); osStore.setState(s => ({ packages: s.packages.filter(p => p.manifest.id !== id), windows: s.windows.filter(w => w.appId !== id), processes: s.processes.filter(p => p.appId !== id) }));
  }
  async export(id: string): Promise<Blob> {
    const pkg = this.get(id); if (!pkg) throw new Error('App not found.');
    if (pkg.builtin) throw new Error('Built-in apps are compiled into the OS. Use Archive Studio to create an exportable package.');
    const files = pkg.files || await packageFiles(pkg.manifest, { 'index.html': new TextEncoder().encode(`<!doctype html><html><body><h1>${pkg.manifest.name}</h1><p>This app is compiled into Netronim OS.</p></body></html>`) });
    const bytes = await encodeNPK(files); return new Blob([bytes as BufferSource], { type: 'application/x-netronim-package' });
  }
  association(ext: string): AppManifest | undefined {
    if (ext === '.npk') return this.get('archives')?.manifest;
    const installed = osStore.getState().packages.find(p => !p.builtin && p.manifest.associations?.includes(ext));
    return installed?.manifest || BUILTIN_MANIFESTS.find(m => m.associations?.includes(ext));
  }
}
