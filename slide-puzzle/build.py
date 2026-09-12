#!/usr/bin/env python3
"""把 src/ 模块内联进 src/shell.html 生成单文件 index.html。"""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

shell = open('src/shell.html').read()
inline = ''
for f in ['logic', 'art', 'audio', 'fx', 'config-panel', 'game']:
    p = f'src/{f}.js'
    if not os.path.exists(p):
        print(f'WARN missing {p}')
        continue
    code = open(p).read()
    assert '</script' not in code, f'{f}.js 含 </script>'
    inline += f'<script>\n/* ===== src/{f}.js ===== */\n' + code + '\n</script>\n'
assert '<!-- MODULE_SCRIPTS -->' in shell, '壳文件缺少占位符'
open('index.html', 'w').write(shell.replace('<!-- MODULE_SCRIPTS -->', inline))
print(f'build OK, {len(inline) + len(shell)} bytes')
