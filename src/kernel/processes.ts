import { osStore } from './store';
import type { AppManifest, ProcessInfo } from './types';
export class ProcessManager {
  private nextPID = 100;
  private timer?: ReturnType<typeof setInterval>;
  start() {
    this.timer = setInterval(() => {
      osStore.setState(s => ({ processes: s.processes.map(p => {
        if (p.state === 'suspended') return { ...p, cpu: 0 };
        const root = document.querySelector(`[data-window-process="${p.id}"]`);
        const nodes = root?.querySelectorAll('*').length || 0;
        const canvasBytes = Array.from(root?.querySelectorAll('canvas') || []).reduce((n, c) => n + c.width * c.height * 4, 0);
        const packageBytes = Object.values(s.packages.find(a => a.manifest.id === p.appId)?.files || {}).reduce((n, a) => n + a.byteLength, 0);
        return { ...p, memory: p.memory || Math.round(256 * 1024 + nodes * 2048 + canvasBytes + packageBytes) };
      }) }));
    }, 2500);
  }
  create(manifest: AppManifest, workspace: number, id?: number): ProcessInfo {
    const state = osStore.getState();
    if (state.processes.length >= state.settings.processLimit) throw new Error(`Process limit reached (${state.settings.processLimit}). Close an app or raise the limit in Settings.`);
    const process: ProcessInfo = { id: id || this.nextPID++, appId: manifest.id, name: manifest.name, startedAt: Date.now(), state: 'running', memory: 0, cpu: -1, workspace };
    this.nextPID = Math.max(this.nextPID, process.id + 1);
    osStore.setState(s => ({ processes: [...s.processes, process] })); return process;
  }
  report(id: number, metrics: { memory?: number; cpu?: number }) {
    osStore.setState(s => ({ processes: s.processes.map(p => p.id === id ? { ...p, ...metrics } : p) }));
  }
  suspend(id: number) { osStore.setState(s => ({ processes: s.processes.map(p => p.id === id ? { ...p, state: p.state === 'running' ? 'suspended' : 'running' } : p) })); }
  kill(id: number) { osStore.setState(s => ({ processes: s.processes.filter(p => p.id !== id), windows: s.windows.filter(w => w.processId !== id), focusedWindow: s.focusedWindow && s.windows.find(w => w.id === s.focusedWindow)?.processId === id ? null : s.focusedWindow })); }
  stop() { clearInterval(this.timer); }
}
