from http.server import BaseHTTPRequestHandler
import json

from api.leaderboard_store import add_score, get_leaderboard


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(get_leaderboard()).encode())

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        payload = self.rfile.read(content_length) if content_length else b'{}'
        try:
            new_score = json.loads(payload)
        except json.JSONDecodeError as exc:
            self.send_error(400, f'Invalid JSON: {exc}')
            return

        if not all(key in new_score for key in ('name', 'score', 'mode')):
            self.send_error(400, 'Invalid data')
            return

        try:
            add_score(new_score)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())
        except Exception as exc:
            self.send_error(500, str(exc))
