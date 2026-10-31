import { osStore } from './store';
import { clamp } from './utils';
import { db } from './db';
import type { AppManifest, OSWindow, ProcessInfo, Rect } from './types';
import type { EventBus } from './bus';
export const TASKBAR_HEIGHT = 58;
export class WindowManager {
  private nextID = 1; private topZ = 10; private saveTimer?: ReturnType<typeof setTimeout>;
  constructor(private bus: EventBus) { bus.on('window:changed', () => this.save()); }
  get workArea() { const taskbar = osStore.getState().settings.taskbar; const reserved = taskbar.autoHide ? 0 : TASKBAR_HEIGHT; return { width: window.innerWidth, height: Math.max(240, window.innerHeight - reserved) }; }
  open(process: ProcessInfo, manifest: AppManifest, filePath?: string, restored?: OSWindow): OSWindow {
    const area = this.workArea;
    const sizes: Record<string, [number, number]> = { welcome: [820, 550], calculator: [410, 580], clock: [760, 570], about: [760, 650], settings: [980, 680], terminal: [900, 590], browser: [1100, 720], canvas: [1120, 720], sketchbook: [1060, 690], files: [1000, 650], camera: [780, 620], recorder: [780, 570] };
    const [preferredWidth, preferredHeight] = sizes[manifest.id] || [manifest.category === 'Utilities' ? 740 : 960, manifest.category === 'Utilities' ? 550 : 640];
    const width = Math.min(preferredWidth, area.width - 36);
    const height = Math.min(preferredHeight, area.height - 48);
    const offset = (osStore.getState().windows.length % 6) * 26;
    const win: OSWindow = { id: restored?.id || this.nextID++, processId: process.id, appId: manifest.id, title: manifest.name, icon: manifest.icon, color: manifest.color,
      x: clamp((area.width - width) / 2 + offset, 8, Math.max(8, area.width - width - 8)), y: clamp((area.height - height) / 2 - 12 + offset, 8, Math.max(8, area.height - height - 8)),
      width: Math.max(300, width), height: Math.max(240, height), minimized: false, maximized: area.width < 650, z: ++this.topZ, workspace: process.workspace, filePath, ...restored };
    this.nextID = Math.max(this.nextID, win.id + 1); this.topZ = Math.max(this.topZ, win.z);
    osStore.setState(s => ({ windows: [...s.windows, win], focusedWindow: win.id })); this.bus.emit('window:changed'); return win;
  }
  update(id: number, patch: Partial<OSWindow>) {
    osStore.setState(s => ({ windows: s.windows.map(w => w.id === id ? { ...w, ...patch } : w) })); this.bus.emit('window:changed');
  }
  focus(id: number) {
    const win = osStore.getState().windows.find(w => w.id === id); if (!win) return;
    this.update(id, { z: ++this.topZ, minimized: false, workspace: osStore.getState().workspace });
    osStore.setState({ focusedWindow: id });
  }
  close(id: number) {
    const win = osStore.getState().windows.find(w => w.id === id); if (!win) return;
    osStore.setState(s => ({ windows: s.windows.filter(w => w.id !== id), processes: s.processes.filter(p => p.id !== win.processId), focusedWindow: s.focusedWindow === id ? null : s.focusedWindow }));
    const next = osStore.getState().windows.filter(w => !w.minimized && w.workspace === osStore.getState().workspace).sort((a,b) => b.z - a.z)[0];
    if (next) osStore.setState({ focusedWindow: next.id }); this.bus.emit('window:changed');
  }
  minimize(id: number) {
    this.update(id, { minimized: true });
    const next = osStore.getState().windows.filter(w => !w.minimized && w.workspace === osStore.getState().workspace).sort((a,b) => b.z-a.z)[0];
    osStore.setState({ focusedWindow: next?.id || null });
  }
  maximize(id: number) {
    const win = osStore.getState().windows.find(w => w.id === id); if (!win) return;
    if (win.maximized) this.update(id, { maximized: false, ...(win.restore || {}) });
    else this.update(id, { maximized: true, restore: { x: win.x, y: win.y, width: win.width, height: win.height } });
    this.focus(id);
  }
  snap(id: number, side: 'left' | 'right' | 'top') {
    const win = osStore.getState().windows.find(w => w.id === id); if (!win) return;
    const area = this.workArea;
    const restore = win.restore || { x: win.x, y: win.y, width: win.width, height: win.height };
    if (side === 'top') this.update(id, { maximized: true, restore });
    else this.update(id, { maximized: false, restore, x: side === 'left' ? 0 : area.width / 2, y: 0, width: area.width / 2, height: area.height });
    this.focus(id);
  }
  geometry(id: number, rect: Rect) {
    const area = this.workArea;
    const width = clamp(rect.width, 320, area.width); const height = clamp(rect.height, 230, area.height);
    this.update(id, { width, height, x: clamp(rect.x, 0, Math.max(0, area.width - width)), y: clamp(rect.y, 0, Math.max(0, area.height - height)), maximized: false });
  }
  setWorkspace(index: number) {
    osStore.setState({ workspace: clamp(index, 0, 1), focusedWindow: null }); this.bus.emit('window:changed');
  }
  moveWindow(id: number, workspace: number) { this.update(id, { workspace }); }
  tile() {
    const wins = osStore.getState().windows.filter(w => w.workspace === osStore.getState().workspace);
    const area = this.workArea; const cols = Math.ceil(Math.sqrt(wins.length)); const rows = Math.ceil(wins.length / cols);
    wins.forEach((w, i) => this.update(w.id, { x: i % cols * area.width / cols, y: Math.floor(i / cols) * area.height / rows, width: area.width / cols, height: area.height / rows, minimized: false, maximized: false }));
  }
  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { const s = osStore.getState(); if (s.phase === 'desktop') void db.put('kv', { key: 'session', value: { windows: s.windows, workspace: s.workspace } }).catch(console.error); }, 200);
  }
  async restore(launch: (appId: string, path?: string, restored?: OSWindow) => Promise<void>) {
    const saved = await db.get<{ key: string; value: { windows: OSWindow[]; workspace: number } }>('kv', 'session');
    if (saved?.value.windows.length) {
      for (const win of saved.value.windows) { try { await launch(win.appId, win.filePath, win); } catch { /* An uninstalled app is omitted from the restored session. */ } }
      this.setWorkspace(saved.value.workspace || 0);
      return true;
    }
    return false;
  }
}
