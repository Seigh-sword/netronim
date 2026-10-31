import type { AppProps } from '../kernel/types';
import WasmView from '../components/WasmView';
export default function PixelPulse(props:AppProps){return <WasmView {...props} source="/wasm/pulse.wasm" title="Pixel Pulse" description="A tiny plasma field, computed in WebAssembly. Move your pointer to bend the colors."/>;}
