import { beforeAll, describe, expect, it } from 'vitest';
import { FileSystem } from './fs';
import { EventBus } from './bus';
import { normalizePath, uniquePath, compareVersions } from './utils';
import { db } from './db';
const fs=new FileSystem(new EventBus());
beforeAll(async()=>{await db.clear('files');await fs.init();});
describe('persistent virtual filesystem',()=>{
  it('normalizes paths without allowing a relative escape from root',()=>{expect(normalizePath('../Projects','/Home/Documents')).toBe('/Home/Projects');expect(normalizePath('../../../../etc')).toBe('/etc');expect(normalizePath('~')).toBe('/Home');});
  it('creates nested directories and persists file contents',async()=>{await fs.mkdir('/Home/Tests/Nested');await fs.write('/Home/Tests/Nested/hello.txt','hello');expect(await fs.text('/Home/Tests/Nested/hello.txt')).toBe('hello');const second=new FileSystem(new EventBus());await second.init();expect(await second.text('/Home/Tests/Nested/hello.txt')).toBe('hello');});
  it('copies directory trees and moves them without changing bytes',async()=>{await fs.copy('/Home/Tests','/Home/Tests-copy');expect(await fs.text('/Home/Tests-copy/Nested/hello.txt')).toBe('hello');await fs.move('/Home/Tests-copy','Home/Renamed'.replace('Home/','/Home/'));expect(fs.node('/Home/Tests-copy')).toBeUndefined();expect(await fs.text('/Home/Renamed/Nested/hello.txt')).toBe('hello');});
  it('prevents moving a directory into its own descendant',async()=>{await expect(fs.move('/Home/Tests','/Home/Tests/Nested/Child')).rejects.toThrow('inside itself');});
  it('enforces owner read/write bits and chmod',async()=>{await fs.chmod('/Home/Tests/Nested/hello.txt',0o000);await expect(fs.read('/Home/Tests/Nested/hello.txt')).rejects.toThrow('Permission denied');await expect(fs.write('/Home/Tests/Nested/hello.txt','no')).rejects.toThrow('Permission denied');await fs.chmod('/Home/Tests/Nested/hello.txt',0o644);await fs.write('/Home/Tests/Nested/hello.txt','yes');expect(await fs.text('/Home/Tests/Nested/hello.txt')).toBe('yes');});
  it('moves deleted files to Trash and removes them recursively',async()=>{await fs.trash('/Home/Renamed');expect(fs.node('/Home/Renamed')).toBeUndefined();expect(fs.node('/Trash/Renamed/Nested/hello.txt')).toBeDefined();await fs.remove('/Trash/Renamed');expect(fs.node('/Trash/Renamed/Nested/hello.txt')).toBeUndefined();});
  it('protects system locations',async()=>{await expect(fs.remove('/System')).rejects.toThrow('protected');await expect(fs.write('/System/test','no')).rejects.toThrow('protected');});
  it('generates collision-safe names and compares semantic versions',()=>{expect(uniquePath('/a.txt',p=>p==='/a.txt')).toBe('/a (2).txt');expect(compareVersions('1.2.0','1.10.0')).toBeLessThan(0);expect(compareVersions('2.0.0','1.9.9')).toBeGreaterThan(0);});
});
