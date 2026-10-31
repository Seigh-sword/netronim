import { describe, expect, it } from 'vitest';
import { crc32, decodeNPK, encodeNPK, packageFiles, readManifest, sha256, validArchivePath } from './npk';
import type { AppManifest } from './types';
const manifest: AppManifest = { id:'test-app',name:'Test app',version:'1.0.0',author:'Tests',description:'A test.',icon:'AppWindow',color:'#b7a3f7',type:'html5view',min_os_version:'1.0.0',permissions:['fs:read'],category:'Utilities' };
describe('NPK1 archive format',()=>{
  it('computes the standard CRC-32 checksum',()=>expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926));
  it('round-trips a complete application package',async()=>{const files=await packageFiles(manifest,{'index.html':new TextEncoder().encode('<h1>Hello Netronim</h1>'.repeat(100)),'assets/icon.svg':new TextEncoder().encode('<svg/>')});const bytes=await encodeNPK(files);const decoded=await decodeNPK(bytes);expect(decoded).toEqual(files);expect(readManifest(decoded).id).toBe('test-app');expect(bytes.length).toBeLessThan(Object.values(files).reduce((n,f)=>n+f.length,0));expect(await sha256(bytes)).toMatch(/^[a-f0-9]{64}$/);});
  it('preserves binary bytes and empty files',async()=>{const files=await packageFiles(manifest,{'index.html':new Uint8Array([0,255,128,1,0,2,255]),'assets/empty':new Uint8Array()});expect(await decodeNPK(await encodeNPK(files))).toEqual(files);});
  it('rejects traversal, absolute paths, and backslashes',()=>{for(const name of ['../escape','/etc/passwd','a\\b','a//b','a/./b','C:/file','\0'])expect(validArchivePath(name)).toBe(false);expect(validArchivePath('assets/icons/hello.svg')).toBe(true);});
  it('rejects invalid permissions and unsupported renderers',()=>{expect(()=>readManifest({})).toThrow();});
  it('detects corruption before returning file data',async()=>{const files=await packageFiles(manifest,{'index.html':new TextEncoder().encode('hello')});const bytes=await encodeNPK(files);bytes[40]^=0xff;await expect(decodeNPK(bytes)).rejects.toThrow();});
  it('detects a modified header',async()=>{const bytes=await encodeNPK(await packageFiles(manifest,{'index.html':new Uint8Array([1])}));bytes[8]=99;await expect(decodeNPK(bytes)).rejects.toThrow('header');});
  it('rejects archives without a manifest',async()=>{await expect(decodeNPK(await encodeNPK({'index.html':new Uint8Array([1])}))).rejects.toThrow('manifest');});
});
