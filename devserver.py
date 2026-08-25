"""Static file server for local dev. Disables caching so edited JS/CSS/HTML
are always served fresh — plain `python -m http.server` doesn't send
cache-control headers, which leads the browser to silently reuse stale
module imports across reloads."""

import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
