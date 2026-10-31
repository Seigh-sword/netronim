import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCw, Maximize, Cpu } from 'lucide-react';
import { kernel } from '../kernel/kernel';
import { RendyGL } from '../kernel/rendygl';
import type { GPUTextureHandle } from '../kernel/rendygl';
import type { AppProps } from '../kernel/types';
import { Button, ErrorNotice, Loading } from './ui';
const WORKER = `
let instance, memory, width=256, height=160;
self.onmessage=async(e)=>{
 const d=e.data;
 try {
  if(d.type==='init'){
   const result=await WebAssembly.instantiate(d.bytes,{});instance=result.instance;
   if(!instance.exports.render||!instance.exports.memory)throw new Error('This WASM app must export memory and render(time, pointerX, pointerY).');
   memory=instance.exports.memory;
   if(memory.buffer.byteLength<width*height*4)throw new Error('WASM memory is too small for a 256 × 160 RGBA framebuffer.');
   instance.exports.init?.(width,height);self.postMessage({type:'ready',memory:memory.buffer.byteLength});
  }
  if(d.type==='frame'&&instance){
   const start=performance.now();const pointer=instance.exports.render(d.time|0,d.x|0,d.y|0)|0;
   if(pointer<0||pointer+width*height*4>memory.buffer.byteLength)throw new Error('WASM returned an out-of-bounds framebuffer.');
   const pixels=new Uint8Array(memory.buffer,pointer,width*height*4).slice();
   self.postMessage({type:'frame',pixels:pixels.buffer,work:performance.now()-start},[pixels.buffer]);
  }
 }catch(error){self.postMessage({type:'error',message:error.message});}
};`;
export default function WasmView({process,window:win,source,title='WebAssembly framebuffer',description='A little program. A whole world of pixels.'}:AppProps&{source?:string;title?:string;description?:string}){
  const canvas=useRef<HTMLCanvasElement>(null);const container=useRef<HTMLDivElement>(null);const worker=useRef<Worker|null>(null);const [backend,setBackend]=useState('Initializing');const [error,setError]=useState('');const [ready,setReady]=useState(false);const [paused,setPaused]=useState(false);const [speed,setSpeed]=useState(1);const [work,setWork]=useState(0);const [restart,setRestart]=useState(0);const pointer=useRef({x:128,y:80});const clock=useRef(0);const pausedRef=useRef(paused);pausedRef.current=paused;const speedRef=useRef(speed);speedRef.current=speed;
  useEffect(()=>{
    let active=true,cancelFrame=()=>{},renderer:RendyGL|undefined,texture:GPUTextureHandle|undefined,pending=false,previous=0;let url='';const pkg=kernel.packages.get(win.appId);
    const setup=async()=>{
      try{
        let bytes:Uint8Array;
        if(source){const response=await fetch(source);if(!response.ok)throw new Error('WebAssembly binary could not be loaded.');bytes=new Uint8Array(await response.arrayBuffer());}else if(pkg?.files?.['app.wasm'])bytes=pkg.files['app.wasm'];else throw new Error('This package does not contain app.wasm.');
        if(!active)return;renderer=await RendyGL.create(canvas.current!,kernel.display);if(!active){renderer.destroy();return;}setBackend(renderer.backend==='webgpu'?'WebGPU':'WebGL');
        texture=await renderer.createTexture({data:new Uint8Array(256*160*4),width:256,height:160});
        url=URL.createObjectURL(new Blob([WORKER],{type:'text/javascript'}));const w=new Worker(url);worker.current=w;
        w.onmessage=e=>{if(!active)return;if(e.data.type==='ready'){setReady(true);kernel.processes.report(process.id,{memory:e.data.memory+256*160*4});}if(e.data.type==='error'){setError(e.data.message);pending=false;}if(e.data.type==='frame'){pending=false;setWork(e.data.work);kernel.processes.report(process.id,{cpu:e.data.work});if(!pausedRef.current&&texture){renderer!.updateTexture(texture,new Uint8Array(e.data.pixels));renderer!.renderTexture(texture);}}};
        w.onerror=e=>{setError(e.message);pending=false;};w.postMessage({type:'init',bytes:bytes.buffer},[bytes.buffer]);
        cancelFrame=renderer.frame((time,delta)=>{if(previous===0)previous=time;if(!pausedRef.current)clock.current+=Math.min(delta,100)*speedRef.current;previous=time;if(!pending&&w){pending=true;w.postMessage({type:'frame',time:Math.floor(clock.current/25),x:pointer.current.x,y:pointer.current.y});}});
      }catch(e){if(active)setError((e as Error).message);}
    };setup();return()=>{active=false;cancelFrame();worker.current?.terminate();renderer?.destroy();if(url)URL.revokeObjectURL(url);};
  },[win.appId,source,restart,process.id]);
  return <div className="app wasm-app" ref={container}><div className="toolbar"><Cpu size={17}/><span className="media-app-name">{title}</span><span className="spacer"/><span className="pill green">RendyGL · {backend}</span><span className="pill">WASM worker</span></div><div className="wasm-stage"><canvas ref={canvas} width={768} height={480} onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();pointer.current={x:(e.clientX-r.left)/r.width*256,y:(e.clientY-r.top)/r.height*160};}}/>{!ready&&!error&&<div className="wasm-loading"><Loading label="Waking up the pixels…"/></div>}{error&&<div className="wasm-error"><ErrorNotice>{error}</ErrorNotice><small>RendyGL apps use the documented RGBA framebuffer ABI. WASI imports are not provided.</small></div>}</div><div className="wasm-controls"><div><h3>{title}</h3><p>{description}</p></div><span className="spacer"/><label>Speed<input aria-label="Animation speed" type="range" min=".1" max="3" step=".1" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/></label><Button onClick={()=>setPaused(!paused)}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'Resume':'Pause'}</Button><button className="icon-btn" title="Restart WASM worker" onClick={()=>{setReady(false);setError('');clock.current=0;setRestart(r=>r+1);}}><RotateCw size={16}/></button><button className="icon-btn" title="Fullscreen" onClick={()=>container.current?.requestFullscreen?.().catch(()=>{})}><Maximize size={16}/></button></div><footer className="statusbar"><span>256 × 160 RGBA framebuffer</span><span className="spacer"/><span>{work.toFixed(2)} ms WASM frame work</span><span>Move your pointer to interact</span></footer></div>;
}
