"""
Stdlib-only HTTP server for the demo target app (no third-party dependencies).

    python -m demo.target_app.server --port 8765

GET  /?state=original|refactored|broken|broken-removed   the page
GET  /api/orders                                         orders created so far
POST /api/orders?state=...                               create an order (500 in the `broken` state)
POST /api/reset                                          clear orders
GET  /healthz
"""

from __future__ import annotations

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from demo.target_app.pages import STATES, build_page


class Handler(BaseHTTPRequestHandler):
    orders: list[dict] = []
    lock = threading.Lock()

    def log_message(self, *args):  # keep demo output clean
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload) -> None:
        self._send(code, json.dumps(payload).encode(), "application/json")

    def do_GET(self):  # noqa: N802
        url = urlparse(self.path)
        if url.path == "/healthz":
            return self._json(200, {"ok": True})
        if url.path == "/api/orders":
            with self.lock:
                return self._json(200, list(self.orders))
        if url.path == "/":
            state = parse_qs(url.query).get("state", ["original"])[0]
            if state not in STATES:
                return self._json(400, {"error": f"unknown state {state!r}", "states": STATES})
            return self._send(200, build_page(state).encode("utf-8"), "text/html; charset=utf-8")
        return self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        url = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        if url.path == "/api/reset":
            with self.lock:
                self.orders.clear()
            return self._json(200, {"ok": True})
        if url.path == "/api/orders":
            state = parse_qs(url.query).get("state", ["original"])[0]
            if state == "broken":  # the real bug: the order is never created
                return self._json(500, {"error": "upstream timeout"})
            body = json.loads(raw or b"{}")
            with self.lock:
                order = {"id": 1000 + len(self.orders) + 1, "email": body.get("email", ""), "items": body.get("items", [])}
                self.orders.append(order)
            return self._json(201, order)
        return self._json(404, {"error": "not found"})


def make_server(port: int = 0, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    Handler.orders = []
    return ThreadingHTTPServer((host, port), Handler)


def serve_in_thread(port: int = 0) -> tuple[ThreadingHTTPServer, str]:
    server = make_server(port)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    srv = make_server(args.port)
    print(f"demo target app on http://127.0.0.1:{args.port}/?state=original")
    srv.serve_forever()
