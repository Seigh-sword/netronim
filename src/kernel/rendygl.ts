import type { DisplayServer } from './display';
export interface GPUBufferHandle { backend: 'webgl' | 'webgpu'; buffer: WebGLBuffer | GPUBuffer }
export interface GPUShaderHandle { backend: 'webgl' | 'webgpu'; program?: WebGLProgram; vertex?: GPUShaderModule; fragment?: GPUShaderModule }
export interface GPUTextureHandle { backend: 'webgl' | 'webgpu'; texture: WebGLTexture | GPUTexture; width: number; height: number }
const PARTICLE_WGSL = `
struct Vertex { @location(0) pos: vec2f, @location(1) velocity: vec2f };
struct Output { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) speed: f32 };
@vertex fn vs(@builtin(vertex_index) i: u32, v: Vertex) -> Output {
  var corners = array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
  let c = corners[i]; var o: Output; let aspect = ${'${aspect}'};
  o.position = vec4f(v.pos.x / aspect + c.x * .006, v.pos.y + c.y * .006, 0., 1.);
  o.uv = c; o.speed = length(v.velocity); return o;
}
@fragment fn fs(i: Output) -> @location(0) vec4f {
  let d = length(i.uv); if (d > 1.) { discard; }
  let color = mix(vec3f(.38,.72,.94), vec3f(.75,.54,1.), clamp(i.speed * 15.,0.,1.));
  return vec4f(color, (1. - d) * .85);
}`;
const PARTICLE_VERTEX = `attribute vec2 position; attribute vec2 velocity; varying float speed; void main(){gl_Position=vec4(position,0.,1.);gl_PointSize=3.+min(length(velocity)*70.,5.);speed=length(velocity);}`;
const PARTICLE_FRAGMENT = `precision mediump float; varying float speed; void main(){float d=length(gl_PointCoord-vec2(.5))*2.;if(d>1.)discard;vec3 c=mix(vec3(.38,.72,.94),vec3(.75,.54,1.),min(speed*15.,1.));gl_FragColor=vec4(c,(1.-d)*.85);}`;
const TEXTURE_VERTEX = `attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0.,1.);}`;
const TEXTURE_FRAGMENT = `precision mediump float;varying vec2 uv;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,uv);}`;
const TEXTURE_WGSL = `@group(0) @binding(0) var tex: texture_2d<f32>; @group(0) @binding(1) var samp: sampler;
struct O { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32)->O { var p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.)); var o:O;o.p=vec4f(p[i],0.,1.);o.uv=vec2f((p[i].x+1.)*.5,(1.-p[i].y)*.5);return o; }
@fragment fn fs(o:O)->@location(0) vec4f{return textureSample(tex,samp,o.uv);}`;

/** Unified graphics facade. GPU resources are owned by the caller and the OS schedules frames. */
export class RendyGL {
  backend: 'webgl' | 'webgpu' = 'webgl';
  device?: GPUDevice; private gpuContext?: GPUCanvasContext; private gl?: WebGLRenderingContext;
  private particlePipeline?: GPURenderPipeline; private texturePipeline?: GPURenderPipeline;
  private gpuQuad?: GPUBuffer; private glQuad?: WebGLBuffer;
  private particleShader?: GPUShaderHandle; private textureShader?: GPUShaderHandle;
  private disposed = false;
  private constructor(readonly canvas: HTMLCanvasElement, private display: DisplayServer) {}
  static async create(canvas: HTMLCanvasElement, display: DisplayServer): Promise<RendyGL> {
    const renderer = new RendyGL(canvas, display);
    try {
      if ('gpu' in navigator) {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
        if (adapter) {
          renderer.device = await adapter.requestDevice(); renderer.backend = 'webgpu';
          renderer.gpuContext = canvas.getContext('webgpu') as GPUCanvasContext;
          renderer.gpuContext.configure({ device: renderer.device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
          await renderer.initGPU(); return renderer;
        }
      }
    } catch (error) { console.warn('WebGPU unavailable, using WebGL.', error); }
    renderer.gl = canvas.getContext('webgl', { alpha: false, antialias: true }) || undefined;
    if (!renderer.gl) throw new Error('Neither WebGPU nor WebGL is available. Enable browser hardware acceleration.');
    renderer.backend = 'webgl'; renderer.initGL(); return renderer;
  }
  private shaderModule(code: string) { return this.device!.createShaderModule({ code }); }
  private async initGPU() {
    const device = this.device!; const format = navigator.gpu.getPreferredCanvasFormat();
    const particleCode = PARTICLE_WGSL.replace('${aspect}', String(this.canvas.width / this.canvas.height));
    this.particleShader = { backend: 'webgpu', vertex: this.shaderModule(particleCode), fragment: this.shaderModule(particleCode) };
    this.particlePipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: this.particleShader.vertex!, entryPoint: 'vs', buffers: [{ arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' },{ shaderLocation: 1, offset: 8, format: 'float32x2' }] }] }, fragment: { module: this.particleShader.fragment!, entryPoint: 'fs', targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] }, primitive: { topology: 'triangle-list' } });
    this.textureShader = { backend: 'webgpu', vertex: this.shaderModule(TEXTURE_WGSL), fragment: this.shaderModule(TEXTURE_WGSL) };
    this.texturePipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: this.textureShader.vertex!, entryPoint: 'vs' }, fragment: { module: this.textureShader.fragment!, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
  }
  private initGL() {
    const gl = this.gl!; this.particleShader = this.compileShader({ vertex: PARTICLE_VERTEX, fragment: PARTICLE_FRAGMENT }); this.textureShader = this.compileShader({ vertex: TEXTURE_VERTEX, fragment: TEXTURE_FRAGMENT });
    this.glQuad = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.glQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  }
  compileShader(source: { vertex: string; fragment: string; wgsl?: string }): GPUShaderHandle {
    if (this.backend === 'webgpu') { const module = this.shaderModule(source.wgsl || source.vertex); return { backend: 'webgpu', vertex: module, fragment: module }; }
    const gl = this.gl!; const program = gl.createProgram()!;
    for (const [type, code] of [[gl.VERTEX_SHADER, source.vertex],[gl.FRAGMENT_SHADER, source.fragment]] as [number,string][]) { const shader = gl.createShader(type)!; gl.shaderSource(shader, code); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error || 'Shader compilation failed.'); } gl.attachShader(program, shader); gl.deleteShader(shader); }
    gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed.'); return { backend: 'webgl', program };
  }
  createBuffer(data: Float32Array): GPUBufferHandle {
    if (this.backend === 'webgpu') { const buffer = this.device!.createBuffer({ size: Math.max(16,data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); this.device!.queue.writeBuffer(buffer,0,data as BufferSource); return { backend: 'webgpu', buffer }; }
    const gl = this.gl!, buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW); return { backend: 'webgl', buffer };
  }
  updateBuffer(handle: GPUBufferHandle, data: Float32Array) { if (handle.backend === 'webgpu') this.device!.queue.writeBuffer(handle.buffer as GPUBuffer,0,data as BufferSource); else { const gl = this.gl!; gl.bindBuffer(gl.ARRAY_BUFFER,handle.buffer as WebGLBuffer); gl.bufferSubData(gl.ARRAY_BUFFER,0,data); } }
  async createTexture(source: ImageBitmap | { data: Uint8Array; width: number; height: number }): Promise<GPUTextureHandle> {
    const width = source.width, height = source.height;
    if (this.backend === 'webgpu') {
      const texture = this.device!.createTexture({ size: [width,height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      if ('data' in source) this.device!.queue.writeTexture({ texture }, source.data as BufferSource, { bytesPerRow: width * 4 }, [width,height]);
      else this.device!.queue.copyExternalImageToTexture({ source }, { texture }, [width,height]); return { backend: 'webgpu', texture, width, height };
    }
    const gl = this.gl!, texture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D,texture); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if ('data' in source) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,source.data); else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    return { backend: 'webgl', texture, width, height };
  }
  async loadNIF(blob: Blob) { return this.createTexture(await createImageBitmap(blob)); }
  updateTexture(handle: GPUTextureHandle, data: Uint8Array) {
    if (handle.backend === 'webgpu') this.device!.queue.writeTexture({ texture: handle.texture as GPUTexture },data as BufferSource,{ bytesPerRow: handle.width * 4 },[handle.width,handle.height]);
    else { const gl = this.gl!; gl.bindTexture(gl.TEXTURE_2D,handle.texture as WebGLTexture); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,handle.width,handle.height,gl.RGBA,gl.UNSIGNED_BYTE,data); }
  }
  private begin() {
    if (this.backend === 'webgpu') { const encoder = this.device!.createCommandEncoder(); const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.gpuContext!.getCurrentTexture().createView(), clearValue: { r:.035,g:.047,b:.085,a:1 }, loadOp: 'clear', storeOp: 'store' }] }); return { encoder, pass }; }
    const gl = this.gl!; gl.viewport(0,0,this.canvas.width,this.canvas.height); gl.clearColor(.035,.047,.085,1); gl.clear(gl.COLOR_BUFFER_BIT); return { gl };
  }
  renderParticles(buffer: GPUBufferHandle, count: number) {
    if (this.disposed) return;
    if (this.backend === 'webgpu') {
      const { encoder, pass } = this.begin() as { encoder: GPUCommandEncoder; pass: GPURenderPassEncoder }; pass.setPipeline(this.particlePipeline!); pass.setVertexBuffer(0,buffer.buffer as GPUBuffer); pass.draw(6,count); pass.end(); this.device!.queue.submit([encoder.finish()]);
    } else {
      const { gl } = this.begin() as { gl: WebGLRenderingContext }; gl.useProgram(this.particleShader!.program!); gl.bindBuffer(gl.ARRAY_BUFFER,buffer.buffer as WebGLBuffer);
      const p = gl.getAttribLocation(this.particleShader!.program!,'position'), v = gl.getAttribLocation(this.particleShader!.program!,'velocity'); gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p,2,gl.FLOAT,false,16,0); gl.enableVertexAttribArray(v); gl.vertexAttribPointer(v,2,gl.FLOAT,false,16,8); gl.drawArrays(gl.POINTS,0,count);
    }
  }
  renderTexture(texture: GPUTextureHandle) {
    if (this.disposed) return;
    if (this.backend === 'webgpu') {
      const { encoder, pass } = this.begin() as { encoder: GPUCommandEncoder; pass: GPURenderPassEncoder }; const sampler = this.device!.createSampler({ magFilter:'linear',minFilter:'linear' }); const bind = this.device!.createBindGroup({ layout: this.texturePipeline!.getBindGroupLayout(0), entries: [{ binding:0,resource:(texture.texture as GPUTexture).createView() },{ binding:1,resource:sampler }] }); pass.setPipeline(this.texturePipeline!); pass.setBindGroup(0,bind); pass.draw(3); pass.end(); this.device!.queue.submit([encoder.finish()]);
    } else {
      const { gl } = this.begin() as { gl: WebGLRenderingContext }; gl.disable(gl.BLEND); gl.useProgram(this.textureShader!.program!); gl.bindBuffer(gl.ARRAY_BUFFER,this.glQuad!); const p = gl.getAttribLocation(this.textureShader!.program!,'p'); gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texture.texture as WebGLTexture); gl.uniform1i(gl.getUniformLocation(this.textureShader!.program!,'image'),0); gl.drawArrays(gl.TRIANGLES,0,6); gl.enable(gl.BLEND);
    }
  }
  frame(callback: (time: number, delta: number) => void) { return this.display.schedule(callback); }
  destroy() {
    this.disposed = true;
    for (const handle of [this.particleShader,this.textureShader]) { if (handle?.backend === 'webgl') this.gl?.deleteProgram(handle.program!); }
    // GPU shader modules are garbage-collected with the destroyed device.
    if (this.glQuad) this.gl?.deleteBuffer(this.glQuad); this.device?.destroy();
  }
}
