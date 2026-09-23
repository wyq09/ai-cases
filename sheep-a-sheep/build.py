#!/usr/bin/env python3
"""拼接 src/*.js 到 src/shell.html 的 MODULE_SCRIPTS 占位符，产出单文件 index.html"""
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

shell = open('src/shell.html').read()
inline = ''
for f in ['core', 'logic', 'art', 'audio', 'fx', 'config-panel', 'game']:
    p = f'src/{f}.js'
    if not os.path.exists(p):
        print(f'!! 缺少 {p}（跳过——集成前应补齐）')
        continue
    code = open(p).read()
    assert '</script' not in code, f'{f}.js 含 </script'
    inline += f'<script>\n/* ===== src/{f}.js ===== */\n' + code + '\n</script>\n'

assert '<!-- MODULE_SCRIPTS -->' in shell, '壳文件缺少占位符'
html = shell.replace('<!-- MODULE_SCRIPTS -->', inline)
open('index.html', 'w').write(html)
print(f'OK index.html {len(html)} bytes')
