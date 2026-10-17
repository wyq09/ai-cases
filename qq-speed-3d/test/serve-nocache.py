#!/usr/bin/env python3
"""Tiny static server for ego-lite tests: always revalidates JS/CSS.

Usage: python3 test/serve-nocache.py [port] [root]
Default: http://127.0.0.1:8795 serving the qq-speed-3d directory.
"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8795
    root = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCacheHandler, directory=root)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"no-cache server on http://127.0.0.1:{port}/ (root={root})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
