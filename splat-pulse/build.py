#!/usr/bin/env python3
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ORDER = ['geometry', 'audio', 'renderer', 'main']

RESET = """(function(){window.__q={};location.search.replace(/^\\?/,'').split('&').forEach(function(pair){if(!pair)return;var parts=pair.split('=');__q[decodeURIComponent(parts[0])]=parts[1]===undefined?true:decodeURIComponent(parts[1]);});window.__errs=[];window.__ready=false;window.onerror=function(message,source,line){__errs.push(String(message).slice(0,240)+' @'+line);};window.onunhandledrejection=function(event){__errs.push('rej:'+String(event.reason&&event.reason.message||event.reason).slice(0,240));};})();"""


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as file:
        return file.read()


def main():
    shell = read('shell.html')
    modules = []
    for name in ORDER:
        code = read(name + '.js')
        if '</script' in code.lower():
            sys.exit('[fatal] ' + name + '.js contains a closing script tag')
        modules.append(code)
        print('[ok] %-12s %7d B' % (name + '.js', len(code.encode())))
    for marker in ['<!--STYLE_INLINE-->', '<!--RESET_INLINE-->', '<!--MODULE_SCRIPTS-->']:
        if shell.count(marker) != 1:
            sys.exit('[fatal] missing marker ' + marker)
    html = shell.replace('<!--STYLE_INLINE-->', read('style.css'))
    html = html.replace('<!--RESET_INLINE-->', RESET)
    html = html.replace('<!--MODULE_SCRIPTS-->', '<script>\n' + '\n\n'.join(modules) + '\n</script>')
    output = os.path.join(ROOT, 'index.html')
    with open(output, 'w', encoding='utf-8') as file:
        file.write(html)
    print('[done] index.html %d B' % os.path.getsize(output))


if __name__ == '__main__':
    main()
