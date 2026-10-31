import { db, openDB } from './db';
import { osStore, mergeSettings } from './store';
import { EventBus } from './bus';
import { FileSystem } from './fs';
import { ProcessManager } from './processes';
import { DisplayServer } from './display';
import { WindowManager } from './windows';
import { PackageManager } from './packages';
import { UpdateManager } from './updates';
import { MediaService } from './media';
import { extension, uid, download } from './utils';
import type { LogEntry, OSWindow, Settings } from './types';

export class Kernel {
  readonly bus = new EventBus();
  readonly fs = new FileSystem(this.bus);
  readonly processes = new ProcessManager();
  readonly display = new DisplayServer();
  readonly windows = new WindowManager(this.bus);
  readonly packages = new PackageManager();
  readonly updates = new UpdateManager(this.packages);
  readonly media = new MediaService(this.fs);
  private booting = false;
  private logCount = 0;
  async boot() {
    if (this.booting) return; this.booting = true;
    osStore.setState({ phase: 'boot', bootLines: ['Netronim BIOS 1.0 · Browser-native computing'], bootProgress: 2, error: '' });
    const stage = async (message: string, progress: number, action?: () => Promise<unknown> | unknown) => {
      if (action) await action();
      osStore.setState(s => ({ bootLines: [...s.bootLines, `[  OK  ] ${message}`], bootProgress: progress }));
      await new Promise(resolve => setTimeout(resolve, 90));
    };
    try {
      await stage('Opening persistent IndexedDB volume', 10, openDB);
      const saved = await db.get<{ key: string; value: Partial<Settings> }>('kv', 'settings');
      osStore.setState({ settings: mergeSettings(saved?.value) });
      const logs = await db.all<LogEntry & { key: number }>('logs');
      osStore.setState({ logs: logs.sort((a,b) => b.id-a.id).slice(0,300) });
      await stage('Mounting virtual file system', 24, () => this.fs.init());
      await stage('Starting process scheduler', 38, () => this.processes.start());
      await stage('Initializing display compositor', 52, () => this.display.start());
      await stage('Restoring window manager', 64);
      await stage('Connecting inter-process event bus', 75);
      await stage('Registering application packages', 87, () => this.packages.init());
      await stage('Starting update service', 96, () => this.updates.init());
      const clipboard = await db.get<{ key: string; value: string[] }>('kv', 'clipboard');
      osStore.setState({ clipboard: clipboard?.value || [], phase: osStore.getState().settings.skipLogin ? 'desktop' : 'login', bootProgress: 100 });
      this.log('kernel', `Netronim 1.0.0 ready · ${osStore.getState().packages.length} registered apps`);
      if (osStore.getState().phase === 'desktop') await this.restore();
      window.addEventListener('online', () => { this.log('network', 'Network connection restored.'); });
      window.addEventListener('offline', () => { this.log('network', 'Offline mode. Local apps and files remain available.', 'warn'); });
      window.addEventListener('netronim:notify', ((event: CustomEvent) => this.notify(event.detail.title, event.detail.message, event.detail.appId)) as EventListener);
      window.addEventListener('netronim:close-app', ((event: CustomEvent<number>) => this.windows.close(event.detail)) as EventListener);
      document.addEventListener('visibilitychange', () => this.bus.emit('system:visibility', !document.hidden));
    } catch (error) { osStore.setState({ phase: 'error', error: (error as Error).message }); }
  }
  async restore() {
    const restored = await this.windows.restore(async (appId, path, win) => { await this.launch(appId, path, win); });
    if (!restored && !osStore.getState().settings.onboardingComplete) await this.launch('welcome');
  }
  async login(username: string) {
    const name = username.trim().slice(0,40); if (!name) throw new Error('Enter a name for your workspace.');
    await this.settings({ username: name }); osStore.setState({ phase: 'desktop' }); this.log('session', `${name} signed in.`); await this.restore();
  }
  async settings(patch: Partial<Settings>) {
    const settings = { ...osStore.getState().settings, ...patch }; osStore.setState({ settings });
    await db.put('kv', { key: 'settings', value: settings }); this.bus.emit('settings:changed', settings);
  }
  log(source: string, message: string, level: LogEntry['level'] = 'info') {
    const entry: LogEntry = { id: Date.now() + this.logCount++ / 1000, time: Date.now(), source, message, level };
    osStore.setState(s => ({ logs: [entry, ...s.logs].slice(0,300) }));
    void db.put('logs', { key: entry.id, ...entry }).catch(console.error);
    if (this.logCount % 100 === 0) void db.all<LogEntry & { key: number }>('logs').then(entries => entries.sort((a,b) => b.id-a.id).slice(500).length ? db.batch('logs', [], entries.sort((a,b) => b.id-a.id).slice(500).map(e => e.key)) : undefined).catch(console.error);
  }
  notify(title: string, message: string, appId?: string) {
    const notification = { id: uid(), title, message, appId, time: Date.now(), read: false };
    osStore.setState(s => ({ notifications: [notification, ...s.notifications].slice(0,60) })); this.bus.emit('notification', notification);
  }
  async copy(text: string, system = true) {
    const clipboard = [text, ...osStore.getState().clipboard.filter(t => t !== text)].slice(0,50);
    osStore.setState({ clipboard }); await db.put('kv', { key: 'clipboard', value: clipboard });
    if (system) await navigator.clipboard.writeText(text); this.bus.emit('clipboard:changed', clipboard);
  }
  async launch(appId: string, filePath?: string, restored?: OSWindow) {
    const pkg = this.packages.get(appId); if (!pkg) throw new Error(`Application not found: ${appId}`);
    const state = osStore.getState();
    const existing = !restored && state.windows.find(w => w.appId === appId && w.filePath === filePath);
    if (existing) { this.windows.moveWindow(existing.id, state.workspace); this.windows.focus(existing.id); return existing; }
    const process = this.processes.create(pkg.manifest, restored?.workspace ?? state.workspace, restored?.processId);
    try { const win = this.windows.open(process, pkg.manifest, filePath, restored); this.log('process', `${pkg.manifest.name} started (PID ${process.id}).`); this.bus.emit('app:launched', { appId, processId: process.id }); return win; }
    catch (e) { this.processes.kill(process.id); throw e; }
  }
  async openFile(path: string) {
    const node = this.fs.node(path); if (!node) throw new Error('File no longer exists.');
    if (node.type === 'directory') return this.launch('files', path);
    const app = this.packages.association(extension(path)); return this.launch(app?.id || 'textedit', path);
  }
  async reboot(update = false) {
    this.log('kernel', update ? 'Applying staged update and restarting.' : 'Restart requested.');
    osStore.setState({ phase: 'updating', updateProgress: 8 });
    const s = osStore.getState(); await db.put('kv', { key: 'session', value: { windows: s.windows, workspace: s.workspace } });
    osStore.setState({ updateProgress: 38 }); await db.put('kv', { key: 'settings', value: s.settings });
    osStore.setState({ updateProgress: 65 }); await openDB();
    await new Promise(r => setTimeout(r, 650)); osStore.setState({ updateProgress: 100 });
    await new Promise(r => setTimeout(r, 400)); location.reload();
  }
  shutdown() { this.log('kernel', 'System shutdown requested.'); this.processes.stop(); this.display.stop(); osStore.setState({ phase: 'off', dialog: null }); }
  async backup() {
    const encodeValue = async (value: unknown): Promise<unknown> => {
      if (value instanceof Blob) { const bytes = new Uint8Array(await value.arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192)); return { __type: 'Blob', mime: value.type, data: btoa(binary) }; }
      if (value instanceof Uint8Array) return { __type: 'Uint8Array', data: Array.from(value) };
      if (Array.isArray(value)) return Promise.all(value.map(encodeValue));
      if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k,v]) => [k, await encodeValue(v)])));
      return value;
    };
    const stores: Record<string, unknown> = {};
    for (const store of ['files','kv','packages']) stores[store] = await encodeValue(await db.all(store));
    const json = JSON.stringify({ format: 'netronim-backup', version: 1, created: Date.now(), stores });
    download(new Blob([json], { type: 'application/json' }), `Netronim-${new Date().toISOString().slice(0,10)}.nbk`);
    this.log('backup', 'Full system backup exported.');
  }
  async restoreBackup(file: File) {
    if (file.size > 200 * 1024 * 1024) throw new Error('Backups are limited to 200 MB.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'netronim-backup' || data.version !== 1 || !data.stores) throw new Error('Not a supported Netronim backup.');
    const decodeValue = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(decodeValue);
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (record.__type === 'Blob' && typeof record.data === 'string') { const binary = atob(record.data); return new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: String(record.mime || '') }); }
        if (record.__type === 'Uint8Array' && Array.isArray(record.data)) return new Uint8Array(record.data);
        return Object.fromEntries(Object.entries(record).map(([k,v]) => [k, decodeValue(v)]));
      }
      return value;
    };
    for (const store of ['files','kv','packages']) { if (!Array.isArray(data.stores[store])) throw new Error('Backup is missing a required storage section.'); await db.clear(store); await db.batch(store, decodeValue(data.stores[store]) as unknown[]); }
    await this.reboot();
  }
}
export const kernel = new Kernel();
