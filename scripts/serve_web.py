from __future__ import annotations

import argparse
import http.server
import socketserver
from pathlib import Path


class DevelopmentServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    request_queue_size = 128
    daemon_threads = True


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
    }

    def do_GET(self) -> None:  # noqa: N802
        if self.path == '/health':
            body = b'{"ok":true,"service":"robo-bridge-web"}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8769)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / 'apps' / 'web'
    handler = lambda *a, **kw: Handler(*a, directory=str(root), **kw)  # noqa: E731
    with DevelopmentServer((args.host, args.port), handler) as server:
        print(f'ROBO BRIDGE MCP web: http://{args.host}:{args.port}')
        server.serve_forever()


if __name__ == '__main__':
    main()
