export interface Token { value: string; quoted: boolean; quote?: 'single' | 'double' }
export function tokenize(input: string): Token[] {
  const tokens: Token[] = []; let current = '', quoted = false, quote = '', escaped = false, started = false;
  let tokenQuote: Token['quote'];
  const push = () => { if (started) tokens.push({ value: current, quoted, quote: tokenQuote }); current = ''; quoted = false; tokenQuote = undefined; started = false; };
  for (const char of input) {
    if (escaped) { current += char; escaped = false; started = true; continue; }
    if (char === '\\' && quote !== "'") { escaped = true; started = true; continue; }
    if (quote) { if (char === quote) quote = ''; else current += char; continue; }
    if (char === '"' || char === "'") { quote = char; tokenQuote = char === '"' ? 'double' : 'single'; quoted = true; started = true; continue; }
    if (/\s/.test(char)) { push(); continue; }
    if ('|;&<>'.includes(char)) { push(); if (tokens.at(-1)?.value === char && '|&>'.includes(char)) tokens[tokens.length-1].value += char; else tokens.push({ value: char, quoted: false }); continue; }
    current += char; started = true;
  }
  if (quote) throw new Error(`Unclosed ${quote} quote.`);
  if (escaped) current += '\\'; push(); return tokens;
}
export function expandToken(token: Token, env: Record<string,string>): string {
  if (token.quote === 'single') return token.value;
  return token.value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_,a,b) => env[a || b] || '');
}
export function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.');
  return new RegExp(`^${escaped}$`,'i').test(value);
}
export interface CommandSegment { args: string[]; operator: string; redirect?: { path: string; append: boolean } }
export function parseCommand(input: string, env: Record<string,string>): CommandSegment[] {
  const tokens = tokenize(input); const segments: CommandSegment[] = []; let args: string[] = [], operator = '', redirect: CommandSegment['redirect'];
  const push = () => { if (args.length || redirect) segments.push({ args, operator, redirect }); args = []; redirect = undefined; operator = ''; };
  for (let i=0;i<tokens.length;i++) {
    const token = tokens[i];
    if (!token.quoted && ['|','||','&&',';','>','>>'].includes(token.value)) {
      if (token.value === '>' || token.value === '>>') { const path = tokens[++i]; if (!path || !path.value || ['|',';'].includes(path.value)) throw new Error('Expected a filename after redirection.'); redirect = { path: expandToken(path,env), append: token.value === '>>' }; }
      else { if (!args.length) throw new Error(`Unexpected operator: ${token.value}`); operator = token.value; push(); }
    } else args.push(expandToken(token,env));
  }
  push(); return segments;
}
