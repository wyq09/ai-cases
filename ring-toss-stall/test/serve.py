#!/usr/bin/env python3
"""本地禁缓存静态服务器：python3 test/serve.py 8790"""
import http.server, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

if __name__ == '__main__':
    os.chdir(ROOT)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
