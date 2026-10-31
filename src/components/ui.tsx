import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { X, LoaderCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { Icon } from './Icon';
export function Button({ children, variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; children: ReactNode }) { return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>; }
export function IconButton({ icon, label, className = '', size = 17, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; size?: number }) { return <button className={`icon-btn ${className}`} title={label} aria-label={label} {...props}><Icon name={icon} size={size}/></button>; }
export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) { return <button className="icon-btn" onClick={onClick} title={label} aria-label={label}><X size={17}/></button>; }
export function EmptyState({ icon = 'FolderOpen', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) { return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={32}/></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>; }
export function Loading({ label = 'One moment…' }: { label?: string }) { return <div className="loading"><LoaderCircle size={22} className="spin"/><span>{label}</span></div>; }
export function ErrorNotice({ children }: { children: ReactNode }) { return <div className="error-notice"><AlertCircle size={16}/><span>{children}</span></div>; }
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span/></button>; }
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span className="field-label">{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={`toolbar ${className}`}>{children}</div>; }
export function Tabs({ items, value, onChange }: { items: { id: string; label: string; icon?: string }[]; value: string; onChange: (id: string) => void }) { return <div className="tabs" role="tablist">{items.map(item => <button role="tab" aria-selected={value === item.id} key={item.id} className={value === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>{item.icon && <Icon name={item.icon} size={15}/>} {item.label}</button>)}</div>; }
export function BackButton({ onClick }: { onClick: () => void }) { return <button className="icon-btn" onClick={onClick} aria-label="Back"><ArrowLeft size={17}/></button>; }
export function useDialogFocus(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return; const previous = document.activeElement as HTMLElement;
    const el = ref.current; const first = el?.querySelector<HTMLElement>('input,button,select,textarea'); first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]'));
      const first = focusable[0], last = focusable[focusable.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    el?.addEventListener('keydown', trap); return () => { el?.removeEventListener('keydown', trap); previous?.focus(); };
  }, [open]);
  return ref;
}
