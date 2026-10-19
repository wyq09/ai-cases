#!/usr/bin/env python3
"""mouse-parkour 鼠族跑酷 单文件构建：src/*.{css,js} → index.html

零外部资源：所有美术为程序化 Canvas2D，音��为 WebAudio 合成，特效为 Canvas 粒子。
产物为单文件 HTML，可直接托管在静态站（case.youyongai.com/mouse-parkour/）。
"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ORDER = ['art.js', 'audio.js', 'fx.js', 'logic.js', 'ui.js', 'game.js']

RESET_JS = (
    "(function(){var Q={};location.search.replace(/^\\?/,'').split('&').forEach("
    "function(kv){var p=kv.split('=');Q[decodeURIComponent(p[0])]=p[1]===undefined?true:decodeURIComponent(p[1]);});"
    "window.__q=Q;window.__errs=window.__errs||[];"
    "window.onerror=function(m,s2,l,c){__errs.push(String(m).slice(0,200)+' @'+(l||'?'));};"
    "window.onunhandledrejection=function(e){__errs.push('rej:'+String(e&&e.reason).slice(0,200));};})();"
)


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
            print(f'[warn] 缺模块 {name}，跳过')
            continue
        code = read(p)
        # <script> 块内的字面量 </script> 会提前结束脚本，统一转义为 <\/script>
        # （在 JS 字符串 / 正则 / 模板 / 注释中语义完全等价）
        low = code.lower()
        if '</script' in low:
            n = low.count('</script')
            code = code.replace('</script', '<\\/script').replace('</SCRIPT', '<\\/SCRIPT')
            print(f'[warn] {name} 含 {n} 处 </script 字面量，已自动转义')
        js_parts.append(f'/* ==== {name} ==== */\n' + code)
        total += len(code.encode())
        print(f'[ok] {name:12s} {len(code.encode()):>7d} B')

    if shell.count('<!--STYLE_INLINE-->') != 1:
        sys.exit('[fatal] shell.html 的 <!--STYLE_INLINE--> 占位符必须恰好 1 个')
    if shell.count('<!--RESET_INLINE-->') != 1:
        sys.exit('[fatal] shell.html 的 <!--RESET_INLINE--> 占位符必须恰好 1 个')
    if shell.count('<!--MODULE_SCRIPTS-->') != 1:
        sys.exit('[fatal] shell.html 的 <!--MODULE_SCRIPTS--> 占位符必须恰好 1 个')

    html = shell.replace('<!--STYLE_INLINE-->', css)
    html = html.replace('<!--RESET_INLINE-->', RESET_JS)
    html = html.replace('<!--MODULE_SCRIPTS-->', '\n\n'.join(js_parts))

    out = os.path.join(ROOT, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    size = os.path.getsize(out)
    print(f'[done] index.html {size} B ({size/1024:.1f} KB), JS 合计 {total/1024:.1f} KB')


if __name__ == '__main__':
    main()
