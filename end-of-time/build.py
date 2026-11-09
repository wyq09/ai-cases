#!/usr/bin/env python3
"""把 src/ 模块 + vendored three.js(r128 UMD) + 后处理 addons 内联进 shell.html，
生成零外部资源的单文件 index.html。

用法: python3 build.py
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
VENDOR = ROOT / "vendor"

# 按依赖顺序（three.min.js 最先；EffectComposer 定义 THREE.Pass，必须早于 ShaderPass / UnrealBloomPass）
LIBRARIES = [
    "three.min.js",
    "EffectComposer.js",
    "CopyShader.js",
    "LuminosityHighPassShader.js",
    "RenderPass.js",
    "ShaderPass.js",
    "UnrealBloomPass.js",
]

# 应用模块：均为普通脚本（无 ES import），按依赖序
MODULES = ["audio.js", "scene.js", "ui.js", "main.js"]


def read_checked(path: Path, kind: str) -> str:
    if not path.is_file():
        sys.exit(f"Missing {kind}: {path}")
    code = path.read_text(encoding="utf-8")
    if "</script" in code.lower():
        sys.exit(f"Unsafe closing script tag in {path.name}")
    return code


def main():
    shell = (SRC / "shell.html").read_text(encoding="utf-8")
    css = read_checked(SRC / "style.css", "source")

    pieces = []
    total = 0
    for name in LIBRARIES:
        code = read_checked(VENDOR / name, "library")
        total += len(code.encode("utf-8"))
        pieces.append(f"/* ===== vendor/{name} ===== */\n{code}")
        print(f"[lib ] {name:34s} {len(code.encode('utf-8')):>10,d} B")

    for name in MODULES:
        code = read_checked(SRC / name, "module")
        total += len(code.encode("utf-8"))
        pieces.append(f"/* ===== src/{name} ===== */\n{code}")
        print(f"[mod ] {name:34s} {len(code.encode('utf-8')):>10,d} B")

    script = "(function () {\n'use strict';\n" + "\n\n".join(pieces) + "\n})();\n"

    html = shell.replace("/*STYLE_INLINE*/", css)
    html = html.replace("/*SCRIPT_INLINE*/", script)
    if "/*STYLE_INLINE*/" in html or "/*SCRIPT_INLINE*/" in html:
        sys.exit("Shell placeholders do not match")

    # 零外部资源自检：不允许出现任何运行期外链
    for bad in ("<script src=", "<link ", "url(", "@import", "import("):
        if bad in html:
            sys.exit(f"Found external-resource pattern in output: {bad}")

    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"[done] index.html: {out.stat().st_size:,d} B；零外部资源，可直接 file:// 打开")


if __name__ == "__main__":
    main()