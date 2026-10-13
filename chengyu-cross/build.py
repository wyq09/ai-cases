#!/usr/bin/env python3
"""填成语 单文件构建：src/*.js 按 ORDER 拼入 shell.html 的 <!-- MODULE_SCRIPTS --> 占位。"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ORDER = ['config.js', 'idioms.js', 'audio.js', 'logic.js', 'config-panel.js', 'game.js']


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def main():
    shell = read(os.path.join(SRC, 'shell.html'))
    parts = []
    total = 0
    for name in ORDER:
        p = os.path.join(SRC, name)
        if not os.path.exists(p):
            print(f'[warn] 缺少 {name}，跳过')
            continue
        code = read(p)
        if '</script' in code.lower():
            sys.exit(f'[fatal] {name} 含 </script 字面量，会截断 HTML')
        parts.append(f'/* ==== {name} ==== */\n' + code)
        total += len(code.encode())
        print(f'[ok] {name:18s} {len(code.encode()):>8d} B')
    html = shell.replace(
        '<!-- MODULE_SCRIPTS -->',
        '<script>\n' + '\n\n'.join(parts) + '\n</script>')
    out = os.path.join(ROOT, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    size = os.path.getsize(out)
    print(f'[done] index.html {size} B ({size/1024:.1f} KB)，JS 合计 {total/1024:.1f} KB')


if __name__ == '__main__':
    main()
