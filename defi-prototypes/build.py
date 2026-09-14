#!/usr/bin/env python3
"""构建：shell.html + src/*.js → index.html（单文件交付）；同时生成 test.html（异步加载器，供子代理自检）"""
import pathlib, sys

ROOT = pathlib.Path(__file__).parent
CORE = ["app.js", "phone.js", "charts.js", "ui.js", "fx-bubbles.js"]
SCENES = [f"scene-{c}.js" for c in "abcdefgh"]
FILES = CORE + SCENES + ["phone-os.js"]

TEST_LOADER = """<script>
window.__SWP_TEST__ = true;
(function () {
  var FILES = %s;
  function load() {
    var i = 0;
    function next() {
      if (i >= FILES.length) {
        document.dispatchEvent(new Event('swp:ready'));
        if (window.SW && window.SW.boot) window.SW.boot();
        return;
      }
      var f = FILES[i++];
      var s = document.createElement('script');
      s.src = 'src/' + f;
      s.onload = next; s.onerror = next;
      document.body.appendChild(s);
    }
    next();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
</script>""" % str(FILES)


def read_js(name):
    s = (ROOT / "src" / name).read_text()
    low = s.lower()
    assert "</script" not in low, f"非法字符串 </script 出现在 {name}"
    return s


def make_test():
    shell = (ROOT / "src" / "shell.html").read_text()
    html = shell.replace("<!-- MODULE_SCRIPTS -->", TEST_LOADER)
    (ROOT / "test.html").write_text(html)
    print(f"test.html  {len(html):>8,} bytes")


def make_index():
    missing = [f for f in FILES if not (ROOT / "src" / f).exists()]
    if missing:
        print(f"index.html 跳过：缺少 {missing}")
        return
    shell = (ROOT / "src" / "shell.html").read_text()
    tags = ""
    for f in FILES:
        tags += "<script>\n" + read_js(f) + "\n</script>\n"
    html = shell.replace("<!-- MODULE_SCRIPTS -->", tags)
    (ROOT / "index.html").write_text(html)
    print(f"index.html {len(html):>8,} bytes")


if __name__ == "__main__":
    make_test()
    make_index()
