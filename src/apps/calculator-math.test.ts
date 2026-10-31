import { describe, expect, it } from 'vitest';
import { calculate } from './calculator-math';
describe('safe calculator parser',()=>{
  it.each([['1+2*3',7],['(1+2)*3',9],['2^3^2',512],['-2^2',-4],['5!',120],['10%3',1],['sqrt(81)',9],['abs(-4)',4],['1e3+0.5',1000.5],['sin(90)',1]])('%s = %s',(expression,expected)=>expect(calculate(expression,true)).toBeCloseTo(expected as number,9));
  it('rejects division by zero and code injection',()=>{expect(()=>calculate('1/0')).toThrow('zero');expect(()=>calculate('globalThis.alert(1)')).toThrow();expect(()=>calculate('fetch("https://example.com")')).toThrow();});
  it('uses the previous answer without eval',()=>expect(calculate('Ans*2',false,21)).toBe(42));
});
