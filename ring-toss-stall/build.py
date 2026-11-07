#!/usr/bin/env python3
"""把 src/ 模块内联进 src/shell.html 生成单文件 index.html。"""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ORDER = ['logic', 'art', 'audio', 'fx', 'config-panel', 'scene', 'game']

def main():
    shell = open(os.path.join(SRC, 'shell.html')).read()
    css = open(os.path.join(SRC, 'style.css')).read()
    reset_js = (
        "(function(){"
        "var Q={};location.search.replace(/^\\?/,'').split('&').forEach(function(kv){"
        "var p=kv.split('=');if(!p[0])return;"
        "Q[decodeURIComponent(p[0])]=p[1]===undefined?true:decodeURIComponent(p[1]);});"
        "if(Q.reset){try{localStorage.removeItem('ringtoss_state_v1');"
        "localStorage.removeItem('ringtoss_config_v1');}catch(e){}}"
        "window.__errs=[];"
        "window.addEventListener('error',function(e){__errs.push(String(e.message||e).slice(0,240)+' @'+(e.lineno||'?'));});"
        "window.addEventListener('unhandledrejection',function(e){__errs.push('rej:'+String(e.reason).slice(0,240));});"
        "window.__RTQ=Q;"
        "})();"
    )
    inline = ''
    for name in ORDER:
        p = os.path.join(SRC, f'{name}.js')
        if not os.path.exists(p):
            print(f'WARN missing {name}.js'); continue
        code = open(p).read()
        assert '</script' not in code, f'{name}.js 含 </script 字面量，会截断 HTML'
        inline += f'<script>\n/* ===== src/{name}.js ===== */\n' + code + '\n</script>\n'
    assert '/*STYLE_INLINE*/' in shell and '/*RESET_INLINE*/' in shell and '<!-- MODULE_SCRIPTS -->' in shell, '壳文件缺少占位符'
    out = shell.replace('/*STYLE_INLINE*/', css).replace('/*RESET_INLINE*/', reset_js).replace('<!-- MODULE_SCRIPTS -->', inline)
    open(os.path.join(ROOT, 'index.html'), 'w').write(out)
    print(f'build OK, {len(out)} bytes')

if __name__ == '__main__':
    main()
