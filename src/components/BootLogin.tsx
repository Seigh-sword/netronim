import { useState } from 'react';
import { ArrowRight, Power, RotateCw, UserRound, ShieldCheck } from 'lucide-react';
import { useOS } from '../kernel/store';
import { kernel } from '../kernel/kernel';
import { Logo } from './Icon';
export function BootLogin() {
  const state = useOS(); const [name, setName] = useState(state.settings.username); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (state.phase === 'desktop') return null;
  if (state.phase === 'off') return <div className="power-screen"><Logo size={64}/><p>You can close this tab. Your workspace is saved.</p><button className="btn btn-primary" onClick={() => location.reload()}><Power size={17}/> Turn on</button></div>;
  if (state.phase === 'error') return <div className="power-screen"><Logo size={60}/><h1>Let’s try that again.</h1><p>{state.error}</p><p className="muted">Netronim needs IndexedDB. Private browsing or full storage can prevent boot.</p><button className="btn btn-primary" onClick={() => location.reload()}>Retry boot</button></div>;
  if (state.phase === 'updating') return <div className="power-screen update-screen"><Logo size={68}/><h1>{state.updateProgress === 100 ? 'Ready for a fresh start.' : 'Making things a little better.'}</h1><p>Installing update… Do not turn off your computer.</p><div className="boot-progress"><span style={{ width: `${state.updateProgress}%` }}/></div><span className="muted">{state.updateProgress}% · Your files are safe</span></div>;
  return <div className={`boot-login ${state.phase === 'login' ? 'login-mode' : ''}`}>
    <div className="boot-wallpaper"/>
    {state.phase === 'boot' ? <div className="boot-center"><Logo size={82}/><h1>netronim<span>OS</span></h1><div className="boot-progress"><span style={{ width: `${state.bootProgress}%` }}/></div><p>A little space for everything.</p><div className="bios-lines">{state.bootLines.slice(-5).map((line,i) => <div key={i}>{line}</div>)}</div></div> : <form className="login-card" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await kernel.login(name); } catch (e) { setError((e as Error).message); setBusy(false); } }}>
      <div className="login-avatar"><UserRound size={42} strokeWidth={1.3}/><span className="online-dot"/></div><span className="eyebrow">WELCOME TO YOUR WORKSPACE</span><h1>Good to see you.</h1><p>Sign in and pick up where you left off.</p>
      <label className="login-input"><UserRound size={17}/><input aria-label="Username" autoComplete="username" value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Your name" required/><button aria-label="Sign in" disabled={busy}><ArrowRight size={20}/></button></label>
      {error && <p className="form-error">{error}</p>}<small><ShieldCheck size={13}/> Local account · No password needed</small>
    </form>}
    <div className="boot-footer"><span><Logo size={20}/> Netronim OS <b>1.0.0</b></span><div><span className="muted">Browser-native. Personally yours.</span><button title="Restart" aria-label="Restart" onClick={() => location.reload()}><RotateCw size={17}/></button><button title="Shut down" aria-label="Shut down" onClick={() => kernel.shutdown()}><Power size={17}/></button></div></div>
  </div>;
}
