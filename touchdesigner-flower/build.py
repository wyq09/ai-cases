#!/usr/bin/env python3
"""把 src/ 模块内联进 src/shell.html，生成零外部资源的单文件 index.html。

无第三方依赖（原生 WebGL2），所以没有 vendor/。
用法: python3 build.py
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"

# 应用模块：均为普通脚本（无 ES import），按依赖序
MODULES = [
    "util.js",      # 命名空间 / 随机 / 噪声 / 四元数矩阵
    "layout.js",    # 构图数据（参考图像素坐标）+ 调色参数 + 画幅适配
    "gen.js",       # 程序化生成：花 / 叶 / 雾 / 丝线 / 散景
    "shaders.js",   # GLSL
    "camera.js",    # 轨道相机
    "render.js",    # WebGL2 渲染器
    "ui.js",        # 界面层
    "main.js",      # 启动 / 主循环 / 测试钩子
]


def read_checked(path: Path, kind: str) -> str:
    if not path.is_file():
        sys.exit(f"Missing {kind}: {path}")
    code = path.read_text(encoding="utf-8")
    if "</script" in code.lower():
        sys.exit(f"Unsafe closing script tag in {path.name}")
    return code


def main():
    shell = read_checked(SRC / "shell.html", "source")
    css = read_checked(SRC / "style.css", "source")

    pieces = []
    total = 0
    for name in MODULES:
        code = read_checked(SRC / name, "module")
        total += len(code.encode("utf-8"))
        pieces.append(f"/* ===== src/{name} ===== */\n{code}")
        print(f"[mod ] {name:34s} {len(code.encode('utf-8')):>10,d} B")

    script = "(function () {\n'use strict';\n" + "\n\n".join(pieces) + "\n})();\n"

    html = shell.replace("/*STYLE_INLINE*/", css)
    html = html.replace("<!-- MODULE_SCRIPTS -->", "<script>\n" + script + "</script>")
    if "/*STYLE_INLINE*/" in html or "MODULE_SCRIPTS" in html:
        sys.exit("Shell placeholders do not match")

    # 零外部资源自检：不允许出现任何运行期外链
    for bad in ("<script src=", "<link ", "url(", "@import", "import(", "https://", "http://"):
        if bad in html:
            sys.exit(f"Found external-resource pattern in output: {bad}")

    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"[done] index.html: {out.stat().st_size:,d} B；零外部资源，可直接 file:// 打开")


if __name__ == "__main__":
    main()
