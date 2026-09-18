#!/usr/bin/env python3
"""bull-flight 单文件构建：src/*.{css,js} → index.html"""
import os, sys, re

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ORDER = ['art.js', 'audio.js', 'fx.js', 'config-panel.js', 'logic.js', 'game.js', 'ui.js', 'main.js']

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

def main():
    shell = read(os.path.join(SRC, 'shell.html'))
    css = read(os.path.join(SRC, 'style.css'))
    js_parts, total = [], 0
    for name in ORDER:
        p = os.path.join(SRC, name)
        if not os.path.exists(p):
            print(f'[warn] 缺模块 {name}，跳过'); continue
        code = read(p)
        if '</script' in code:
            sys.exit(f'[fatal] {name} 含 </script 字面量，会截断 HTML')
        js_parts.append(f'/* ==== {name} ==== */\n' + code)
        total += len(code.encode())
        print(f'[ok] {name:18s} {len(code.encode()):>7d} B')
    reset_js = (
        "(function(){var Q={};location.search.replace(/^\\?/,'').split('&').forEach("
        "function(kv){var p=kv.split('=');Q[decodeURIComponent(p[0])]=p[1]===undefined?true:decodeURIComponent(p[1]);});"
        "if(Q.reset){try{localStorage.removeItem('bf.cfg.v1');localStorage.removeItem('bf.save.v1');}catch(e){}}"
        "window.__errs=window.__errs||[];window.onerror=function(m,s2,l,c){__errs.push(String(m).slice(0,200)+' @'+(l||'?'));};"
        "window.onunhandledrejection=function(e){__errs.push('rej:'+String(e&&e.reason).slice(0,200));};})();"
    )
    html = shell.replace('/*STYLE_INLINE*/', css)
    html = html.replace('/*RESET_INLINE*/', reset_js)
    html = html.replace('/*MODULE_SCRIPTS*/', '\n\n'.join(js_parts))
    out = os.path.join(ROOT, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    size = os.path.getsize(out)
    print(f'[done] index.html {size} B ({size/1024:.1f} KB), JS 合计 {total/1024:.1f} KB')

if __name__ == '__main__':
    main()
