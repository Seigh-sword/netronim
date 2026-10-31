import { describe, expect, it } from 'vitest';
import { tokenize, parseCommand, globMatch } from './terminal-parser';
describe('Netronim shell parser',()=>{
  it('preserves quoted spaces and operators',()=>{expect(tokenize('echo "hello | world"')).toEqual([{value:'echo',quoted:false,quote:undefined},{value:'hello | world',quoted:true,quote:'double'}]);});
  it('expands environment variables only outside single quotes',()=>{expect(parseCommand('echo "$USER" \'$USER\'',{USER:'Explorer'})[0].args).toEqual(['echo','Explorer','$USER']);});
  it('parses pipelines and logical operators',()=>{const result=parseCommand('cat a.txt | grep hello && echo done',{});expect(result.map(s=>s.args[0])).toEqual(['cat','grep','echo']);expect(result[0].operator).toBe('|');expect(result[1].operator).toBe('&&');});
  it('parses overwrite and append redirection',()=>{expect(parseCommand('echo hello >> notes.txt',{})[0].redirect).toEqual({path:'notes.txt',append:true});expect(parseCommand('echo hello > notes.txt',{})[0].redirect?.append).toBe(false);});
  it('rejects incomplete quotations and redirection',()=>{expect(()=>tokenize('echo "hello')).toThrow('Unclosed');expect(()=>parseCommand('echo >',{})).toThrow('filename');});
  it('matches file globs without evaluating code',()=>{expect(globMatch('*.txt','notes.txt')).toBe(true);expect(globMatch('h?llo','hello')).toBe(true);expect(globMatch('*.txt','notes.ts')).toBe(false);});
});
