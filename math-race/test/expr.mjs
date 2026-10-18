'use strict';

/* 独立表达式求值器：只认整数与 + - × ÷ ( )，用于交叉验证出题引擎与驱动 UI 测试 */

export function evalExpr(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ') { i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      tokens.push({ t: 'num', v: Number(text.slice(i, j)) });
      i = j;
      continue;
    }
    if ('+-×÷()'.includes(c)) { tokens.push({ t: c }); i++; continue; }
    throw new Error('bad char: ' + c);
  }
  let pos = 0;
  const PREC = { '+': 1, '-': 1, '×': 2, '÷': 2 };
  function peek() { return tokens[pos]; }
  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') { pos++; return tk.v; }
    if (tk.t === '(') {
      pos++;
      const v = parseExpr(0);
      if (!peek() || peek().t !== ')') throw new Error('missing )');
      pos++;
      return v;
    }
    if (tk.t === '-') { pos++; return -parsePrimary(); }
    throw new Error('bad primary: ' + tk.t);
  }
  function parseExpr(minPrec) {
    let left = parsePrimary();
    for (;;) {
      const tk = peek();
      if (!tk || !(tk.t in PREC) || PREC[tk.t] < minPrec) return left;
      pos++;
      const right = parseExpr(PREC[tk.t] + 1);
      if (tk.t === '+') left += right;
      else if (tk.t === '-') left -= right;
      else if (tk.t === '×') left *= right;
      else left /= right;
    }
  }
  const v = parseExpr(0);
  if (pos !== tokens.length) throw new Error('trailing tokens');
  return v;
}
