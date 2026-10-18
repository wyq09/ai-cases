#!/usr/bin/env python3
"""math-race 单文件构建：src/*.{css,js} + vendor → client/index.html"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'client')
JS_ORDER = ['core.js', 'audio.js', 'views.js', 'race.js', 'main.js']


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def main():
    shell = read(os.path.join(SRC, 'shell.html'))
    css = read(os.path.join(SRC, 'style.css'))
    vendor = read(os.path.join(SRC, 'vendor', 'qrcode.js'))
    if '</script' in css or '</script' in vendor:
        sys.exit('[fatal] css/vendor 含 </script 字面量，会截断 HTML')

    js_parts = []
    for name in JS_ORDER:
        code = read(os.path.join(SRC, name))
        if '</script' in code:
            sys.exit(f'[fatal] {name} 含 </script 字面量，会截断 HTML')
        js_parts.append(f'/* ==== {name} ==== */\n{code}')
        print(f'[ok] {name:10s} {len(code.encode()):>7d} B')
    js = '\n'.join(js_parts)
    print(f'[ok] {"vendor":10s} {len(vendor.encode()):>7d} B')

    html = (shell
            .replace('/*__CSS__*/', css)
            .replace('/*__VENDOR__*/', vendor)
            .replace('/*__JS__*/', js))
    os.makedirs(OUT, exist_ok=True)
    out_path = os.path.join(OUT, 'index.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'[done] client/index.html {os.path.getsize(out_path)} B')


if __name__ == '__main__':
    main()
