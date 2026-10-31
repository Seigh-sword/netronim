type MathToken = number | string;
export function calculate(expression: string, degrees = false, answer = 0): number {
  if (expression.length > 256) throw new Error('Expression is too long.');
  const source = expression.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/π/g,'pi').replace(/√/g,'sqrt').replace(/\s/g,'');
  const tokens: MathToken[] = []; let at = 0;
  while (at < source.length) {
    const number = source.slice(at).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) { tokens.push(Number(number[0])); at += number[0].length; continue; }
    const name = source.slice(at).match(/^[a-z]+/i);
    if (name) { tokens.push(name[0].toLowerCase()); at += name[0].length; continue; }
    if ('+-*/^()%!'.includes(source[at])) tokens.push(source[at++]); else throw new Error(`Unexpected character: ${source[at]}`);
  }
  let index = 0; const peek = () => tokens[index]; const take = () => tokens[index++];
  const angle = (n: number) => degrees ? n * Math.PI / 180 : n;
  const primary = (): number => {
    const token = take();
    if (typeof token === 'number') return token;
    if (token === '(') { const n = additive(); if (take() !== ')') throw new Error('Missing closing parenthesis.'); return n; }
    if (token === 'pi') return Math.PI; if (token === 'e') return Math.E; if (token === 'ans') return answer;
    if (typeof token === 'string' && ['sin','cos','tan','asin','acos','atan','sqrt','ln','log','abs','exp'].includes(token)) {
      if (take() !== '(') throw new Error(`Expected ( after ${token}`); const n = additive(); if (take() !== ')') throw new Error('Missing closing parenthesis.');
      switch (token) { case 'sin':return Math.sin(angle(n));case 'cos':return Math.cos(angle(n));case 'tan':return Math.tan(angle(n));case 'asin':return (degrees?180/Math.PI:1)*Math.asin(n);case 'acos':return (degrees?180/Math.PI:1)*Math.acos(n);case 'atan':return (degrees?180/Math.PI:1)*Math.atan(n);case 'sqrt':return Math.sqrt(n);case 'ln':return Math.log(n);case 'log':return Math.log10(n);case 'abs':return Math.abs(n);case 'exp':return Math.exp(n); }
    }
    throw new Error('Expected a number or expression.');
  };
  const postfix = (): number => { let n = primary(); while (peek() === '!') { take(); if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Factorial requires an integer from 0 to 170.'); n = Array.from({length:n},(_,i)=>i+1).reduce((a,b)=>a*b,1); } return n; };
  const unary = (): number => { if (peek() === '-') { take(); return -unary(); } if (peek() === '+') { take(); return unary(); } return power(); };
  const power = (): number => { const n = postfix(); if (peek() === '^') { take(); return n ** unary(); } return n; };
  const multiplicative = (): number => { let n = unary(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = take(); const right = unary(); if ((op === '/' || op === '%') && right === 0) throw new Error('Cannot divide by zero.'); n = op === '*' ? n * right : op === '/' ? n / right : n % right; } return n; };
  const additive = (): number => { let n = multiplicative(); while (peek() === '+' || peek() === '-') { const op = take(); const right = multiplicative(); n = op === '+' ? n + right : n - right; } return n; };
  if (!tokens.length) return 0; const result = additive(); if (index !== tokens.length) throw new Error('Check your expression.'); if (!Number.isFinite(result)) throw new Error('Result is outside the supported range.'); return Number(result.toPrecision(14));
}
