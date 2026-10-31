import { osStore } from './store';
export class DisplayServer {
  private callbacks = new Set<(time: number, delta: number) => void>();
  private animation = 0; private last = 0; private sample = 0; private frames = 0;
  start() {
    if (this.animation) return;
    const frame = (time: number) => {
      const delta = this.last ? Math.min(time - this.last, 100) : 16.67; this.last = time;
      if (!document.hidden) {
        for (const callback of this.callbacks) { try { callback(time, delta); } catch (e) { console.error(e); this.callbacks.delete(callback); } }
        this.frames++;
        if (time - this.sample > 1000) {
          const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
          osStore.setState(s => ({ metrics: { fps: Math.round(this.frames * 1000 / (time - this.sample)), heap: memory?.usedJSHeapSize || 0, storage: s.files.reduce((n, f) => n + f.size, 0), time: Date.now() } }));
          this.frames = 0; this.sample = time;
        }
      }
      this.animation = requestAnimationFrame(frame);
    };
    this.animation = requestAnimationFrame(frame);
  }
  schedule(callback: (time: number, delta: number) => void) { this.callbacks.add(callback); return () => { this.callbacks.delete(callback); }; }
  stop() { cancelAnimationFrame(this.animation); this.animation = 0; this.callbacks.clear(); }
  get layerCount() { return osStore.getState().windows.filter(w => !w.minimized).length; }
}
