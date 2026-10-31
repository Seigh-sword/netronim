import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { X, Upload, Check, Info } from 'lucide-react';
import { kernel } from './kernel/kernel';
import { useOS, osStore } from './kernel/store';
import { BootLogin } from './components/BootLogin';
import { Desktop } from './components/Desktop';
import { Taskbar, StartMenu } from './components/Taskbar';
import { DialogHost } from './components/DialogHost';
import { reportError } from './apps/hooks';
import './styles.css';
import './apps/apps.css';

function Toasts() {
  const notifications = useOS().notifications; const [visible,setVisible] = useState<string[]>([]); const seen = useRef(new Set<string>());
  useEffect(() => { const fresh=notifications.filter(n=>!seen.current.has(n.id)); fresh.forEach(n=>seen.current.add(n.id)); if(fresh.length)setVisible(v=>[...fresh.map(n=>n.id),...v].slice(0,3)); const timer=setTimeout(()=>setVisible(v=>v.slice(0,-1)),6500);return()=>clearTimeout(timer); },[notifications]);
  return <div className="toast-stack">{notifications.filter(n=>visible.includes(n.id)).map(n=><div className="toast" key={n.id}><span className="toast-icon"><Info size={18}/></span><div><strong>{n.title}</strong><p>{n.message}</p>{n.appId&&<button className="text-button" onClick={()=>{kernel.launch(n.appId!).catch(reportError);setVisible(v=>v.filter(id=>id!==n.id));}}>Open app</button>}</div><button className="icon-btn" aria-label="Dismiss" onClick={()=>setVisible(v=>v.filter(id=>id!==n.id))}><X size={14}/></button></div>)}</div>;
}
function App() {
  const state=useOS(); const [startOpen,setStartOpen]=useState(false); const input=useRef<HTMLInputElement>(null); const importTarget=useRef('/Home/Downloads'); const importAbort=useRef<AbortController|null>(null);
  useEffect(()=>{void kernel.boot();if('serviceWorker'in navigator && import.meta.env.PROD)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(e=>kernel.log('offline',e.message,'warn'));},[]);
  useEffect(()=>{document.documentElement.dataset.theme=state.settings.theme;document.documentElement.style.setProperty('--accent',state.settings.accent);document.documentElement.classList.toggle('reduce-motion',state.settings.reduceMotion);},[state.settings.theme,state.settings.accent,state.settings.reduceMotion]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(state.phase!=='desktop')return;
      const target=e.target as HTMLElement;const typing=target.matches('input,textarea,select')||target.isContentEditable;
      if(e.key==='Meta'&&!typing || e.ctrlKey&&e.key==='Escape'){e.preventDefault();setStartOpen(v=>!v);}
      if(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==='t'){e.preventDefault();kernel.launch('terminal').catch(reportError);}
      if(e.ctrlKey&&e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();kernel.windows.setWorkspace(e.key==='ArrowLeft'?0:1);}
      if(e.altKey&&e.key==='Tab'){e.preventDefault();const wins=state.windows.filter(w=>w.workspace===state.workspace).sort((a,b)=>a.z-b.z);if(wins[0])kernel.windows.focus(wins[0].id);}
      if(e.key==='Escape')setStartOpen(false);
      if(e.key==='F5'&&!typing){e.preventDefault();kernel.fs.init().catch(reportError);}
    };
    const importEvent=(e:Event)=>{importTarget.current=(e as CustomEvent).detail||'/Home/Downloads';input.current?.click();};
    window.addEventListener('keydown',key);document.addEventListener('netronim:import',importEvent);return()=>{window.removeEventListener('keydown',key);document.removeEventListener('netronim:import',importEvent);};
  },[state.phase,state.windows,state.workspace]);
  const scale=state.settings.uiScale/100;
  return <div className="os-shell" style={{zoom:scale}}>
    {state.phase==='desktop'?<><Desktop openStart={()=>setStartOpen(true)}/><Taskbar startOpen={startOpen} toggleStart={()=>setStartOpen(v=>!v)} closeStart={()=>setStartOpen(false)}/>{startOpen&&<StartMenu close={()=>setStartOpen(false)}/>}<Toasts/></>:<BootLogin/>}
    <DialogHost/>
    <input ref={input} type="file" multiple hidden onChange={async e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;importAbort.current=new AbortController();try{const paths=await kernel.media.import(files,importTarget.current,{signal:importAbort.current.signal});kernel.notify('Import complete',`${paths.length} file${paths.length===1?'':'s'} saved to ${importTarget.current}.`,'files');}catch(error){reportError(error);}finally{osStore.setState({importProgress:null});}}}/>
    {state.importProgress&&<div className="import-progress"><span className="import-spinner"><Upload size={19}/></span><div><strong>Making room for {state.importProgress.name}</strong><p>{state.importProgress.progress?`${Math.round(state.importProgress.progress*100)}% · Converting media in real time`:'Importing and optimizing…'}</p><div className="thin-progress"><span style={{width:`${Math.max(5,state.importProgress.progress*100)}%`}}/></div></div><button className="icon-btn" aria-label="Cancel import" onClick={()=>importAbort.current?.abort()}><X size={16}/></button></div>}
    <div className="brightness-overlay" style={{opacity:(100-state.settings.brightness)/100}}/>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
