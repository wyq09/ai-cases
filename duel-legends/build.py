#!/usr/bin/env python3
import os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ORDER = ['cards.js', 'logic.js', 'ai.js', 'art.js', 'audio.js', 'fx.js', 'game.js']
RESET_JS = "(function(){var Q={};location.search.replace(/^\\?/,'').split('&').forEach(function(kv){var p=kv.split('=');Q[decodeURIComponent(p[0])]=p[1]===undefined?true:decodeURIComponent(p[1]);});window.__q=Q;window.__errs=[];function pushErr(m,l,e){__errs.push(String(m).slice(0,180)+' @'+(l||'?')+(e&&e.stack?' | '+String(e.stack).split('\\n').slice(0,4).join(' <- '):''));}window.onerror=function(m,s,l,c,e){pushErr(m,l,e);};window.onunhandledrejection=function(e){pushErr('rej:'+String(e&&e.reason).slice(0,180),'promise',e&&e.reason);};})();"
def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f: return f.read()
def main():
    shell = read('shell.html'); parts = []
    for name in ORDER:
        code = read(name)
        if '</script' in code.lower(): code = code.replace('</script', '<\\/script').replace('</SCRIPT', '<\\/SCRIPT')
        parts.append('/* ==== ' + name + ' ==== */\n' + code)
        print('[ok] %-12s %7d B' % (name, len(code.encode())))
    for marker in ['<!--STYLE_INLINE-->', '<!--RESET_INLINE-->', '<!--MODULE_SCRIPTS-->']:
        if shell.count(marker) != 1: sys.exit('[fatal] bad marker ' + marker)
    html = shell.replace('<!--STYLE_INLINE-->', read('style.css')).replace('<!--RESET_INLINE-->', RESET_JS).replace('<!--MODULE_SCRIPTS-->', '\n\n'.join(parts))
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f: f.write(html)
    print('[done] index.html %.1f KB' % (len(html.encode()) / 1024))
if __name__ == '__main__': main()
