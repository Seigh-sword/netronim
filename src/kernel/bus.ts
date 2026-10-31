export type EventHandler = (payload: unknown) => void;
export class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();
  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => { this.listeners.get(event)?.delete(handler); };
  }
  emit(event: string, payload?: unknown) {
    for (const handler of this.listeners.get(event) || []) {
      try { handler(payload); } catch (error) { console.error(`[EventBus:${event}]`, error); }
    }
  }
  clear() { this.listeners.clear(); }
}
