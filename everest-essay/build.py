#!/usr/bin/env python3
"""Zero-dependency single-file bundler for everest-essay.

Compresses illustrations from src/assets/ into crisp WebP data URIs,
inlines CSS + bundled JS into index.html, checks JS syntax with node --check,
and enforces zero external HTTP(S) resources.
"""

import base64
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
ASSETS = os.path.join(SRC, "assets")
OUT_HTML = os.path.join(ROOT, "index.html")

JS_ORDER = [
    "data.js",
    "diagrams.js",
    "app.js",
]

IMAGE_SLOTS = {
    "__IMG_HERO__": ("hero-everest.jpg", 1440, 82),
    "__IMG_ZONE_1__": ("zone-1-forest.jpg", 1280, 80),
    "__IMG_ZONE_2__": ("zone-2-subalpine.jpg", 1280, 80),
    "__IMG_ZONE_3__": ("zone-3-meadow.jpg", 1280, 80),
    "__IMG_ZONE_4__": ("zone-4-glacier.jpg", 1280, 80),
    "__IMG_ZONE_5__": ("zone-5-highcamp.jpg", 1280, 80),
    "__IMG_ZONE_6__": ("zone-6-summit.jpg", 1280, 82),
}

IMPORT_RE = re.compile(r"^\s*import\s+[\s\S]*?from\s+[\"'][^\"']+[\"'];\s*$", re.MULTILINE)
EXPORT_RE = re.compile(r"^(\s*)export\s+(?=(const|let|var|function|class)\b)", re.MULTILINE)


def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def encode_image_data_uri(src_path: str, target_width: int, quality: int) -> tuple[str, int]:
    """Convert image to resized WebP (preferred) or PIL WebP and return (data_uri, raw_bytes)."""
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Missing illustration asset: {src_path}")

    cwebp_bin = shutil.which("cwebp")
    with tempfile.NamedTemporaryFile(suffix=".webp", delete=False) as tf:
        tmp_out = tf.name

    try:
        if cwebp_bin:
            cmd = [
                cwebp_bin,
                "-quiet",
                "-q",
                str(quality),
                "-m",
                "5",
                "-resize",
                str(target_width),
                "0",
                src_path,
                "-o",
                tmp_out,
            ]
            subprocess.run(cmd, check=True)
            with open(tmp_out, "rb") as f:
                raw = f.read()
            b64 = base64.b64encode(raw).decode("ascii")
            return f"data:image/webp;base64,{b64}", len(raw)

        from PIL import Image
        import io

        with Image.open(src_path) as im:
            im = im.convert("RGB")
            w, h = im.size
            if w > target_width:
                nh = int(round(h * (target_width / float(w))))
                im = im.resize((target_width, nh), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="WEBP", quality=quality, method=5)
            raw = buf.getvalue()
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:image/webp;base64,{b64}", len(raw)
    finally:
        if os.path.exists(tmp_out):
            os.remove(tmp_out)


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
        raise RuntimeError("Missing inline CSS/JS placeholders in template.html")

    html = template.replace("/* __INLINE_CSS__ */", css).replace("/* __INLINE_JS__ */", combined_js)

    total_img_bytes = 0
    for token, (filename, width, quality) in IMAGE_SLOTS.items():
        if token not in html:
            raise RuntimeError(f"Missing image placeholder {token} in template.html")
        uri, raw_len = encode_image_data_uri(os.path.join(ASSETS, filename), width, quality)
        total_img_bytes += raw_len
        html = html.replace(token, uri)
        print(f"  inlined {filename} -> WebP {width}w q={quality} ({raw_len / 1024:.1f} KB)")

    if re.search(r'<(?:script|link|img)\b[^>]+(?:src|href)\s*=\s*["\']https?://', html, re.IGNORECASE):
        raise RuntimeError("External HTTP(S) resource detected in output index.html")

    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = os.path.getsize(OUT_HTML) / 1024.0
    print(
        f"Built {OUT_HTML} ({size_kb:.1f} KB total, {total_img_bytes / 1024:.1f} KB compressed art), "
        "node --check OK, zero external URLs."
    )


if __name__ == "__main__":
    try:
        bundle()
    except Exception as exc:
        print(f"BUILD ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
