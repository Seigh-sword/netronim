import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { db } from '../kernel/db';
import { kernel } from '../kernel/kernel';
import { osStore } from '../kernel/store';
import type { VNode } from '../kernel/types';
export function useStoredState<T>(appId: string, initial: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initial); const [ready, setReady] = useState(false);
  const latest = useRef(value); latest.current = value;
  useEffect(() => { let active = true; db.get<{ key: string; value: T }>('kv', `app:${appId}`).then(saved => { if (active) { if (saved) setValue(saved.value); setReady(true); } }).catch(e => { if (active) { setReady(true); kernel.log(appId, String(e), 'error'); } }); return () => { active = false; }; }, [appId]);
  useEffect(() => { if (ready) void db.put('kv', { key: `app:${appId}`, value }).catch(e => kernel.log(appId, `Could not save app data: ${e.message}`, 'error')); }, [appId, value, ready]);
  useEffect(() => { const flush = () => { if (ready) void db.put('kv', { key: `app:${appId}`, value: latest.current }).catch(() => {}); }; window.addEventListener('pagehide', flush); return () => window.removeEventListener('pagehide', flush); }, [appId, ready]);
  return [value, setValue, ready];
}
export function useBlob(path?: string) {
  const [url, setURL] = useState(''); const [error, setError] = useState('');
  const modified = osStore.getState().files.find(f => f.path === path)?.modified;
  useEffect(() => {
    if (!path) { setURL(''); return; }
    let active = true, objectURL = ''; setError(''); setURL('');
    kernel.fs.read(path).then(blob => { if (!active) return; const node = kernel.fs.node(path); objectURL = URL.createObjectURL(node?.mime ? new Blob([blob], { type: node.mime }) : blob); setURL(objectURL); }).catch(e => active && setError(e.message));
    return () => { active = false; if (objectURL) URL.revokeObjectURL(objectURL); };
  }, [path, modified]);
  return { url, error };
}
export function useMediaFiles(kind: VNode['kind']) {
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => { const load = () => setPaths(osStore.getState().files.filter(f => f.type === 'file' && f.kind === kind && !f.path.startsWith('/Trash/')).map(f => f.path)); load(); return kernel.bus.on('fs:changed', load); }, [kind]);
  return paths;
}
export function useFileText(path?: string) {
  const [text, setText] = useState(''); const [ready, setReady] = useState(!path); const [error, setError] = useState('');
  useEffect(() => { if (!path) return; let active = true; setReady(false); kernel.fs.text(path).then(t => { if (active) { setText(t); setReady(true); } }).catch(e => { if (active) { setError(e.message); setReady(true); } }); return () => { active = false; }; }, [path]);
  return { text, setText, ready, error };
}
export function useInterval(callback: () => void, delay: number | null) {
  const ref = useRef(callback); ref.current = callback;
  useEffect(() => { if (delay === null) return; const timer = setInterval(() => ref.current(), delay); return () => clearInterval(timer); }, [delay]);
}
export function useWindowTitle(id: number, title: string) { useEffect(() => { if (title) kernel.windows.update(id, { title }); }, [id, title]); }
export function reportError(e: unknown) { kernel.notify('Something needs attention', e instanceof Error ? e.message : String(e)); kernel.log('app', e instanceof Error ? e.message : String(e), 'error'); }
