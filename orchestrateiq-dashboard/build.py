#!/usr/bin/env python3
"""Assemble dist/index.html from src modules + fonts."""
import base64, pathlib, sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

LATIN_RNG = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
EXT_RNG = "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF"

def read(p): return pathlib.Path(p).read_text()

def main():
    shell = read(SRC / "shell.html")

    faces = []
    for name, rng in [("dmsans-latin", LATIN_RNG), ("dmsans-latin-ext", EXT_RNG)]:
        b64 = base64.b64encode((ROOT / "fonts" / f"{name}.woff2").read_bytes()).decode()
        faces.append(
            "@font-face{font-family:'DM Sans';font-style:normal;font-weight:100 1000;font-display:block;"
            "src:url(data:font/woff2;base64," + b64 + ") format('woff2');unicode-range:" + rng + ";}")
    shell = shell.replace("/*FONT_FACE*/", "\n".join(faces))

    css = read(SRC / "styles.css")
    for f in sorted(SRC.glob("css-*.css")):
        css += f"\n/* ==== {f.name} ==== */\n" + read(f)
    shell = shell.replace("/*STYLE*/", css)

    js_names = ["icons.js", "data.js", "core.js"] + sorted(p.name for p in SRC.glob("pg-*.js"))
    parts = []
    for name in js_names:
        code = read(SRC / name)
        if "</script" in code.lower():
            sys.exit(f"FATAL: '</script' found in {name}")
        parts.append(f";/* ==== {name} ==== */\n" + code)
    shell = shell.replace("/*JS*/", "\n".join(parts))

    DIST.mkdir(exist_ok=True)
    out = ROOT / "index.html"
    out.write_text(shell)
    print(f"OK index.html {out.stat().st_size/1024:.0f} KB  modules: {', '.join(js_names)}")

if __name__ == "__main__":
    main()
