#!/usr/bin/env python3
"""将 vendor/three.module.js 与 src/*.js 打包为单文件零外部资源的 index.html。

用法: python3 last-half-pixel/build.py
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
VENDOR = ROOT / "vendor"

MODULES = [
    "math.js",
    "gfx.js",
    "type.js",
    "audio.js",
    "transitions.js",
    "scenes-early.js",
    "scenes-late.js",
    "deck.js",
]


def load_three_bundle():
    three_path = VENDOR / "three.module.js"
    if not three_path.is_file():
        sys.exit(f"Missing Three.js module: {three_path}")
    library = three_path.read_text(encoding="utf-8")

    match = re.search(r"\nexport\s*\{([^}]+)\};\s*$", library)
    if not match:
        sys.exit("Cannot locate the Three.js export list in vendor/three.module.js")

    exports = []
    for entry in match.group(1).split(","):
        entry = entry.strip()
        if not entry:
            continue
        names = [n.strip() for n in entry.split(" as ")]
        exports.append((names[-1], names[0]))

    body = library[: match.start()]
    if "</script" in body.lower():
        sys.exit("Unsafe closing script tag in vendor/three.module.js")

    namespace = "{" + ",".join(json.dumps(pub) + ":" + loc for pub, loc in exports) + "}"
    return body, namespace


def main():
    template_path = SRC / "template.html"
    if not template_path.is_file():
        sys.exit(f"Missing template: {template_path}")
    template = template_path.read_text(encoding="utf-8")
    if "/*INLINE_BUNDLE*/" not in template:
        sys.exit("Placeholder /*INLINE_BUNDLE*/ not found in src/template.html")

    three_body, three_namespace = load_three_bundle()

    license_path = VENDOR / "LICENSE-three.txt"
    license_comment = ""
    if license_path.is_file():
        license_comment = "/* Includes three.js\n" + license_path.read_text(encoding="utf-8") + "*/\n"

    pieces = []
    missing = []
    for name in MODULES:
        path = SRC / name
        if not path.is_file():
            print(f"[warn] missing {name}, skipped")
            missing.append(name)
            continue
        code = path.read_text(encoding="utf-8")
        if "</script" in code.lower():
            sys.exit(f"Unsafe closing script tag in {name}")
        pieces.append(f"/* ===== {name} ===== */\n{code}")
        print(f"[ok]   {name:16s} {path.stat().st_size:>9,d} B")

    early_hook = (
        "window.__errs = window.__errs || [];\n"
        "window.addEventListener('error', function(e){\n"
        "  window.__errs.push(String(e.message || e) + ' @ ' + (e.lineno || '?'));\n"
        "});\n"
        "window.addEventListener('unhandledrejection', function(e){\n"
        "  window.__errs.push('REJ ' + String((e.reason && e.reason.stack) || e.reason));\n"
        "});\n"
        "(function(){\n"
        "  var origErr = console.error.bind(console);\n"
        "  console.error = function(){\n"
        "    try {\n"
        "      var m = String(arguments[0] || '');\n"
        "      if (m.indexOf('THREE.WebGLProgram') >= 0 || m.indexOf('Shader Error') >= 0 || m.indexOf('WebGL') >= 0) {\n"
        "        window.__errs.push('SHADER ' + Array.prototype.map.call(arguments, function(a){\n"
        "          return typeof a === 'string' ? a.slice(0, 400) : String(a);\n"
        "        }).join(' ').slice(0, 600));\n"
        "      }\n"
        "    } catch(_) {}\n"
        "    return origErr.apply(console, arguments);\n"
        "  };\n"
        "})();\n"
    )

    script = (
        license_comment
        + "(() => {\n'use strict';\n"
        + "const THREE = (() => {\n"
        + three_body
        + "\nreturn "
        + three_namespace
        + ";\n})();\n"
        + "window.THREE = THREE;\n"
        + "window.__LHP = window.__LHP || {};\n"
        + early_hook
        + "\n\n"
        + "\n\n".join(pieces)
        + "\n})();\n"
    )

    html = template.replace("/*INLINE_BUNDLE*/", "<script>\n" + script + "\n</script>")
    out_path = ROOT / "index.html"
    out_path.write_text(html, encoding="utf-8")

    size = out_path.stat().st_size
    status = "complete" if not missing else f"partial (missing: {', '.join(missing)})"
    print(f"[done] {out_path.name}: {size:,d} B ({status}); 零外部资源，支持 http:// 与 file://")


if __name__ == "__main__":
    main()
