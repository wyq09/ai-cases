#!/usr/bin/env python3
"""把 src/ 模块 + vendored three.js 内联进 shell.html，生成零外部资源单文件 index.html。

用法: python3 build.py
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
MODULES = [
    "terrain.js", "sim.js", "audio.js", "model.js",
    "world.js", "ui.js", "game.js", "main.js",
]


def main():
    shell = (SRC / "shell.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    library = (ROOT / "vendor" / "three.module.js").read_text(encoding="utf-8")

    match = re.search(r"\nexport\s*\{([^}]+)\};\s*$", library)
    if not match:
        sys.exit("Cannot locate the Three.js export list")
    exports = []
    for entry in match.group(1).split(","):
        names = entry.strip().split(" as ")
        exports.append((names[-1], names[0]))
    library = library[: match.start()]
    namespace = "{" + ",".join(json.dumps(p) + ":" + l for p, l in exports) + "}"

    license_text = (ROOT / "vendor" / "LICENSE-three.txt").read_text(encoding="utf-8")

    pieces = []
    for name in MODULES:
        path = SRC / name
        if not path.is_file():
            print(f"[warn] missing {name}, skipped")
            continue
        code = path.read_text(encoding="utf-8")
        if "</script" in code.lower():
            sys.exit(f"Unsafe closing script tag in {name}")
        pieces.append(f"/* ===== {name} ===== */\n{code}")
        print(f"[ok] {name:13s} {path.stat().st_size:>9,d} B")

    early = (
        "window.__errs=window.__errs||[];"
        "window.addEventListener('error',function(e){"
        "window.__errs.push(String(e.message||e)+' @ '+(e.lineno||'?'));});"
        "window.addEventListener('unhandledrejection',function(e){"
        "window.__errs.push('REJ '+String(e.reason&&e.reason.stack||e.reason));});"
        "var __ce=console.error.bind(console);console.error=function(){"
        "try{var m=String(arguments[0]||'');if(m.indexOf('THREE.WebGLProgram')>=0||m.indexOf('Shader Error')>=0){"
        "window.__errs.push('SHADER '+Array.prototype.map.call(arguments,function(a){return typeof a==='string'?a.slice(0,400):String(a)}).join(' ').slice(0,600));return;}}"
        "catch(e){}return __ce.apply(console,arguments);};"
    )

    script = (
        "/*\n" + license_text + "*/\n"
        "(() => {\n'use strict';\n"
        "const THREE = (() => {\n" + library + "\nreturn " + namespace + ";\n})();\n"
        "window.THREE = THREE;\n"
        + early + "\n"
        + "\n\n".join(pieces)
        + "\n})();\n"
    )

    script_tag = "<script>\n" + script + "\n</script>\n"
    html = shell.replace("/*STYLE_INLINE*/", css).replace("/*MODULE_SCRIPTS*/", script_tag)
    html = html.replace("<!-- MODULE_SCRIPTS -->\n", "")
    if "/*STYLE_INLINE*/" in html or "/*MODULE_SCRIPTS*/" in html:
        sys.exit("Shell placeholders do not match")

    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    size = out.stat().st_size
    print(f"[done] index.html: {size:,d} B; 零外部资源，可直接 file:// 打开")


if __name__ == "__main__":
    main()
