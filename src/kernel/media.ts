import type { FileSystem } from './fs';
import { osStore } from './store';
import { extension, uniquePath, download } from './utils';
import { basename } from './utils';

export interface ImportOptions { convert?: boolean; keepOriginals?: boolean; signal?: AbortSignal }
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => { const abort = () => reject(new DOMException('Conversion cancelled.', 'AbortError')); if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true }); promise.then(v => { signal.removeEventListener('abort', abort); resolve(v); }, e => { signal.removeEventListener('abort', abort); reject(e); }); });
}
export async function imageToNIF(file: Blob): Promise<Blob> {
  const canvas = document.createElement('canvas');
  let source: ImageBitmap | HTMLImageElement; let url = '';
  try { source = await createImageBitmap(file); }
  catch { url = URL.createObjectURL(file); source = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('This image codec is not supported by your browser.')); image.src = url; }); }
  canvas.width = source instanceof HTMLImageElement ? source.naturalWidth : source.width; canvas.height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!canvas.width || !canvas.height || canvas.width * canvas.height > 80_000_000) { if ('close' in source) source.close(); if (url) URL.revokeObjectURL(url); throw new Error('Image dimensions are invalid or too large.'); }
  canvas.getContext('2d')!.drawImage(source, 0, 0); if ('close' in source) source.close(); if (url) URL.revokeObjectURL(url);
  const result = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image encoding failed.')), 'image/webp', 0.8));
  canvas.width = 0; canvas.height = 0;
  if (result.type !== 'image/webp') throw new Error('WebP encoding is unavailable; the original image was kept.');
  return result;
}
function recorderMime(audio: boolean) {
  const options = audio ? ['audio/webm;codecs=opus','audio/webm'] : ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mime = options.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('WebM recording is not supported in this browser. The original media was kept.'); return mime;
}
export async function audioToAUD(file: Blob, progress: (n: number) => void = () => {}, signal?: AbortSignal): Promise<Blob> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    await context.resume(); const destination = context.createMediaStreamDestination(); const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
    const mime = recorderMime(true); const recorder = new MediaRecorder(destination.stream, { mimeType: mime, audioBitsPerSecond: 128_000 }); const chunks: Blob[] = [];
    const result = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => reject(new Error('Audio conversion failed.'));
      recorder.onstop = () => signal?.aborted ? reject(new DOMException('Conversion cancelled.', 'AbortError')) : resolve(new Blob(chunks, { type: mime }));
    });
    source.onended = () => { if (recorder.state !== 'inactive') recorder.stop(); progress(1); };
    const interval = setInterval(() => progress(Math.min(context.currentTime / buffer.duration, 1)), 100);
    recorder.start(200); source.start(); const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); try { source.stop(); } catch {} }; signal?.addEventListener('abort', stop, { once: true });
    try { return await abortable(result, signal); } finally { clearInterval(interval); signal?.removeEventListener('abort', stop); destination.stream.getTracks().forEach(t => t.stop()); }
  } finally { await context.close(); }
}
export async function videoToVID(file: Blob, progress: (n: number) => void = () => {}, signal?: AbortSignal): Promise<Blob> {
  const url = URL.createObjectURL(file), video = document.createElement('video'); video.src = url; video.muted = true; video.playsInline = true; video.preload = 'auto';
  const context = new AudioContext(); let stream: MediaStream | undefined;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('This video codec cannot be decoded by your browser.')); setTimeout(() => reject(new Error('Video metadata timed out.')), 15_000); });
    if (!Number.isFinite(video.duration) || video.duration > 3600) throw new Error('Video conversion supports finite videos up to one hour.');
    const scale = Math.min(1, 1920 / video.videoWidth, 1080 / video.videoHeight);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2); canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext('2d')!; const mime = recorderMime(false);
    stream = canvas.captureStream(30); const audio = context.createMediaStreamDestination(); context.createMediaElementSource(video).connect(audio); audio.stream.getAudioTracks().forEach(t => stream!.addTrack(t));
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 }); const chunks: Blob[] = []; let animation = 0;
    const result = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; recorder.onerror = () => reject(new Error('Video encoding failed.'));
      recorder.onstop = () => { cancelAnimationFrame(animation); signal?.aborted ? reject(new DOMException('Conversion cancelled.', 'AbortError')) : resolve(new Blob(chunks, { type: mime })); };
    });
    const draw = () => { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); progress(video.currentTime / video.duration); if (!video.ended) animation = requestAnimationFrame(draw); };
    video.onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };
    await context.resume(); await video.play(); recorder.start(250); draw();
    const stop = () => { video.pause(); if (recorder.state !== 'inactive') recorder.stop(); }; signal?.addEventListener('abort', stop, { once: true });
    try { return await abortable(result, signal); } finally { signal?.removeEventListener('abort', stop); cancelAnimationFrame(animation); }
  } finally { video.pause(); video.removeAttribute('src'); video.load(); stream?.getTracks().forEach(t => t.stop()); URL.revokeObjectURL(url); await context.close(); }
}
export class MediaService {
  constructor(private fs: FileSystem) {}
  async convert(file: Blob, progress: (n: number) => void = () => {}, signal?: AbortSignal): Promise<{ blob: Blob; ext: string; converted: boolean }> {
    if (file.type.startsWith('image/') && !file.type.includes('svg')) return { blob: await imageToNIF(file), ext: '.nif', converted: true };
    if (file.type.startsWith('audio/')) return { blob: await audioToAUD(file, progress, signal), ext: '.aud', converted: true };
    if (file.type.startsWith('video/')) return { blob: await videoToVID(file, progress, signal), ext: '.vid', converted: true };
    return { blob: file, ext: '', converted: false };
  }
  async import(files: File[], target = '/Home/Downloads', options: ImportOptions = {}) {
    const settings = osStore.getState().settings; const results: string[] = []; const warnings: string[] = [];
    for (const file of files) {
      if (file.size > 256 * 1024 * 1024) { warnings.push(`${file.name}: exceeds the 256 MB import limit.`); continue; }
      osStore.setState({ importProgress: { name: file.name, progress: 0 } });
      const progress = (n: number) => osStore.setState({ importProgress: { name: file.name, progress: n } });
      let blob: Blob = file, name = file.name;
      if ((options.convert ?? settings.autoConvert) && extension(name) !== '.npk') {
        try { const converted = await this.convert(file, progress, options.signal); if (converted.converted) { blob = converted.blob; name = name.replace(/\.[^.]+$/, '') + converted.ext; } }
        catch (e) { if (options.signal?.aborted) throw e; warnings.push(`${file.name}: ${(e as Error).message}`); }
      }
      if (!(blob.type.startsWith('image/') || blob.type.startsWith('video/') || blob.type.startsWith('audio/') || extension(name) === '.npk')) { blob = new Blob([await file.text()], { type: 'text/plain;charset=utf-8' }); }
      const path = uniquePath(`${target}/${name}`, p => !!this.fs.node(p)); await this.fs.write(path, blob); results.push(path);
      if (options.keepOriginals ?? settings.keepOriginals) {
        const original = uniquePath(`/Home/Downloads/Originals/${file.name}`, p => !!this.fs.node(p)); await this.fs.write(original, file, file.type || 'application/octet-stream');
      }
      progress(1);
    }
    osStore.setState({ importProgress: null });
    if (warnings.length) throw new Error(`${results.length} imported. ${warnings.join('\n')}`);
    return results;
  }
  async export(path: string, native = false) {
    const node = this.fs.node(path); if (!node || node.type === 'directory') throw new Error('Select a file to export. Folder backups are available in Settings.');
    const data = await this.fs.read(path);
    const name = native ? node.name : node.name.replace(/\.nif$/, '.webp').replace(/\.vid$/, '.webm').replace(/\.aud$/, '.webm');
    download(new Blob([data], { type: node.mime }), name);
  }
}
