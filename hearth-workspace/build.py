#!/usr/bin/env python3
"""把 src/ 的 HTML + CSS + JS 打包成一个零外部资源的单文件 index.html。

用法: python3 build.py
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"

MODULES = [
    "icons.js",
    "art.js",
    "data.js",
    "logic.js",
    "core.js",
    "chat.js",
    "goals.js",
    "files.js",
    "tasks.js",
    "extra.js",
    "boot.js",
]


def main() -> int:
    shell = (SRC / "shell.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")

    pieces = []
    for name in MODULES:
        path = SRC / name
        if not path.is_file():
            print(f"[missing] {name}")
            return 1
        code = path.read_text(encoding="utf-8")
        if "</script" in code.lower():
            print(f"[unsafe] closing script tag in {name}")
            return 1
        pieces.append(f"/* ===== {name} ===== */\n{code}")
        print(f"[ok] {name:12s} {path.stat().st_size:>8,d} B")

    script = "(() => {\n'use strict';\n" + "\n\n".join(pieces) + "\n})();\n"

    html = shell.replace("/*STYLE_INLINE*/", css).replace("/*SCRIPT_INLINE*/", script)
    if "/*STYLE_INLINE*/" in html or "/*SCRIPT_INLINE*/" in html:
        print("[error] shell placeholders do not match")
        return 1

    # 零外部资源自检
    bad = re.findall(r'(?:src|href)\s*=\s*["\'](https?:)?//[^"\']+', html)
    if bad:
        print(f"[error] external resources found: {bad[:3]}")
        return 1

    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"[built] {out} ({out.stat().st_size:,d} B)")

    for extra in ("index.html",):
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
