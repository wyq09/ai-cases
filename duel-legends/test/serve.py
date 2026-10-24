#!/usr/bin/env python3
import http.server, socketserver, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8794
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()
    def log_message(self, *args): pass
if __name__ == '__main__':
    os.chdir(ROOT); socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
        print('serving on http://127.0.0.1:%d' % PORT, flush=True); httpd.serve_forever()
