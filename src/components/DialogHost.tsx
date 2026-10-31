import { useEffect, useRef } from 'react';
import { useOS, osStore } from '../kernel/store';
import { X, Check } from 'lucide-react';
export function DialogHost() {
  const dialog = useOS().dialog; const input = useRef<HTMLInputElement>(null); const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (dialog) { setTimeout(() => { input.current?.focus(); input.current?.select(); if (!dialog.input) panel.current?.querySelector<HTMLButtonElement>('.btn-primary')?.focus(); }, 20); } }, [dialog]);
  if (!dialog) return null;
  const finish = (value: string | null) => { osStore.setState({ dialog: null }); dialog.resolve(value); };
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && finish(null)}><div ref={panel} role="alertdialog" aria-modal="true" aria-label={dialog.title} className="system-dialog" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); finish(null); } if (e.key === 'Tab') { const buttons = Array.from(panel.current!.querySelectorAll<HTMLElement>('input,button')); const first = buttons[0], last = buttons[buttons.length-1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}>
    <div className="dialog-title"><h2>{dialog.title}</h2><button className="icon-btn" aria-label="Cancel" onClick={() => finish(null)}><X size={18}/></button></div>
    {dialog.message && <p className="dialog-message">{dialog.message}</p>}
    <form onSubmit={e => { e.preventDefault(); finish(dialog.input ? input.current?.value || '' : 'yes'); }}>
      {dialog.input && <input ref={input} aria-label={dialog.label || dialog.title} defaultValue={dialog.value || ''} placeholder={dialog.placeholder} maxLength={240}/>}
      <div className="dialog-actions"><button type="button" className="btn" onClick={() => finish(null)}>Cancel</button><button type="submit" className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}>{dialog.confirmLabel || 'Confirm'}</button></div>
    </form>
  </div></div>;
}
