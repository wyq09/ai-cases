#!/usr/bin/env python3
"""将 vendor/three.module.js 与 src/*.js 打包为单文件零外部资源的 index.html。

用法: python3 supercritical/build.py
"""
from pathlib import Path
import datetime
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
VENDOR = ROOT / "vendor"

# 加载顺序即依赖顺序：引擎 → 工具/数据 → 转场 → 场景 → 运行器
ENGINE = ("math.js", "gfx.js", "type.js", "audio.js", "deck.js")
MODULES = [
    "math.js",
    "gfx.js",
    "type.js",
    "audio.js",
    "kit.js",
    "data.js",
    "beds.js",
    "transitions.js",
    "scenes-a.js",
    "scenes-b.js",
    "scenes-c.js",
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


ERROR_HOOK = r"""
window.__errs = window.__errs || [];
window.addEventListener('error', function(e){
  window.__errs.push(String(e.message || e) + ' @ ' + (e.lineno || '?'));
});
window.addEventListener('unhandledrejection', function(e){
  window.__errs.push('REJ ' + String((e.reason && e.reason.stack) || e.reason));
});
(function(){
  var origErr = console.error.bind(console);
  console.error = function(){
    try {
      var m = String(arguments[0] || '');
      if (m.indexOf('THREE.WebGLProgram') >= 0 || m.indexOf('Shader Error') >= 0 || m.indexOf('WebGL') >= 0) {
        window.__errs.push('SHADER ' + Array.prototype.map.call(arguments, function(a){
          return typeof a === 'string' ? a.slice(0, 500) : String(a);
        }).join(' ').slice(0, 900));
      }
    } catch(_) {}
    return origErr.apply(console, arguments);
  };
})();
"""


def main():
    template_path = SRC / "template.html"
    if not template_path.is_file():
        sys.exit(f"Missing template: {template_path}")
    template = template_path.read_text(encoding="utf-8")
    if "/*INLINE_BUNDLE*/" not in template:
        sys.exit("Placeholder /*INLINE_BUNDLE*/ not found in src/template.html")

    three_body, three_namespace = load_three_bundle()
    three_bytes = (VENDOR / "three.module.js").stat().st_size

    license_path = VENDOR / "LICENSE-three.txt"
    license_comment = ""
    if license_path.is_file():
        license_comment = "/* Includes three.js\n" + license_path.read_text(encoding="utf-8") + "*/\n"

    pieces = []
    missing = []
    own_lines = 0
    own_bytes = 0
    for name in MODULES:
        path = SRC / name
        if not path.is_file():
            print(f"[warn] missing {name}, skipped")
            missing.append(name)
            continue
        code = path.read_text(encoding="utf-8")
        if "</script" in code.lower():
            sys.exit(f"Unsafe closing script tag in {name}")
        pieces.append((name, code))
        n_lines = code.count("\n") + 1
        if name not in ENGINE:
            own_lines += n_lines
        own_bytes += len(code.encode("utf-8"))
        print(f"[ok]   {name:16s} {path.stat().st_size:>9,d} B  {n_lines:>6,d} lines")

    # 演示文稿在运行时能读到自己的「体量」：第 1 幕把人类的输入与机器的输出并置。
    build_info = {
        "lines": sum(code.count("\n") + 1 for _, code in pieces),
        "authorLines": own_lines,
        "bytes": own_bytes + three_bytes,
        "threeBytes": three_bytes,
        "date": datetime.date.today().isoformat(),
    }

    script = (
        license_comment
        + "(() => {\n'use strict';\n"
        + "const THREE = (() => {\n"
        + three_body
        + "\nreturn "
        + three_namespace
        + ";\n})();\n"
        + "window.THREE = THREE;\n"
        + "window.__SC = window.__SC || {};\n"
        + "window.__SC.BUILD = "
        + json.dumps(build_info)
        + ";\n"
        + ERROR_HOOK
        + "\n\n"
        + "\n\n".join(f"/* ===== {name} ===== */\n{code}" for name, code in pieces)
        + "\n})();\n"
    )

    html = template.replace("/*INLINE_BUNDLE*/", "<script>\n" + script + "\n</script>")
    out_path = ROOT / "index.html"
    out_path.write_text(html, encoding="utf-8")

    size = out_path.stat().st_size
    status = "complete" if not missing else f"partial (missing: {', '.join(missing)})"
    print(f"[info] lines={build_info['lines']:,d} author-lines={build_info['authorLines']:,d}")
    print(f"[done] {out_path.name}: {size:,d} B ({status}); 零外部资源，支持 http:// 与 file://")


if __name__ == "__main__":
    main()
