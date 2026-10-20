#!/usr/bin/env python3
"""把 src/ 内联成单文件 index.html。场景数据保留在 assets/ 下按需加载。"""
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

ORDER = ['format', 'renderer-gl', 'renderer-gpu', 'main']

shell = open('src/shell.html', encoding='utf-8').read()
css = open('src/style.css', encoding='utf-8').read()

inline = ''
total = 0
for name in ORDER:
    p = f'src/{name}.js'
    if not os.path.exists(p):
        sys.exit(f'[fatal] 缺少 {p}')
    code = open(p, encoding='utf-8').read()
    if '</script' in code.lower():
        sys.exit(f'[fatal] {name}.js 含 </script 字面量')
    inline += f'<script>\n/* ===== src/{name}.js ===== */\n{code}\n</script>\n'
    total += len(code.encode())
    print(f'[ok] {name:14s} {len(code.encode()):>7d} B')

reset = (
    "(function(){var Q={};location.search.replace(/^\\?/,'').split('&').forEach(function(kv){"
    "if(!kv)return;var p=kv.split('=');Q[decodeURIComponent(p[0])]=p[1]===undefined?true:decodeURIComponent(p[1]);});"
    "window.__Q=Q;window.__errs=window.__errs||[];"
    "window.onerror=function(m,s,l,c){__errs.push(String(m).slice(0,240)+' @'+(l||'?'));};"
    "window.onunhandledrejection=function(e){__errs.push('rej:'+String(e&&e.reason).slice(0,240));};})();"
)

html = shell.replace('/*STYLE_INLINE*/', css)
html = html.replace('/*RESET_INLINE*/', reset)
html = html.replace('<!--MODULE_SCRIPTS-->', inline)

out = 'index.html'
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'[done] index.html {os.path.getsize(out)} B (js {total} B)')
