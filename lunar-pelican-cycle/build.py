#!/usr/bin/env python3
"""Zero-dependency single-file bundler for lunar-pelican-cycle."""

import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
OUT_HTML = os.path.join(ROOT, "index.html")

JS_ORDER = [
    "math3d.js",
    "terrain.js",
    "physics.js",
    "mesh.js",
    "renderer.js",
    "audio.js",
    "ui.js",
    "main.js",
]

IMPORT_RE = re.compile(r"^\s*import\s+[^;]+;\s*$", re.MULTILINE)
EXPORT_RE = re.compile(r"^(\s*)export\s+(?=(const|let|var|function|class)\b)", re.MULTILINE)


def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def bundle() -> None:
    template = read_text(os.path.join(SRC, "template.html"))
    css = read_text(os.path.join(SRC, "style.css"))

    chunks = []
    for name in JS_ORDER:
        raw = read_text(os.path.join(SRC, name))
        stripped = IMPORT_RE.sub("", raw)
        stripped = EXPORT_RE.sub(r"\1", stripped)

        for lineno, line in enumerate(stripped.splitlines(), start=1):
            if re.match(r"^\s*(import|export)\b", line):
                raise RuntimeError(f"Unstripped module syntax in {name}:{lineno}: {line}")

        chunks.append(f"// --- {name} ---\n{stripped.strip()}\n")

    combined_js = "(function () {\n\"use strict\";\n\n" + "\n".join(chunks) + "\n})();\n"

    # Syntax-check bundled JS using node --check
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tf:
        tf.write(combined_js)
        tmp_js = tf.name
    try:
        res = subprocess.run(["node", "--check", tmp_js], capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"node --check failed:\n{res.stderr}")
    finally:
        if os.path.exists(tmp_js):
            os.remove(tmp_js)

    if "/* __INLINE_CSS__ */" not in template or "/* __INLINE_JS__ */" not in template:
        raise RuntimeError("Missing inline placeholders in template.html")

    html = template.replace("/* __INLINE_CSS__ */", css).replace("/* __INLINE_JS__ */", combined_js)

    # Verify zero external <script src="http..."> or <link href="http...">
    if re.search(r'<(?:script|link)\b[^>]+(?:src|href)\s*=\s*["\']https?://', html, re.IGNORECASE):
        raise RuntimeError("External HTTP(S) resource detected in output index.html")

    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = os.path.getsize(OUT_HTML) / 1024.0
    print(f"Built {OUT_HTML} ({size_kb:.1f} KB), node --check OK, zero external URLs.")


if __name__ == "__main__":
    try:
        bundle()
    except Exception as exc:
        print(f"BUILD ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
