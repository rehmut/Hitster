from http.server import BaseHTTPRequestHandler
import json

from api.prediction_store import add_prediction_submission, get_prediction_leaderboard


class handler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_GET(self):
        try:
            self._send_json(get_prediction_leaderboard())
        except Exception as exc:
            self.send_error(500, str(exc))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        payload = self.rfile.read(content_length) if content_length else b"{}"
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            self.send_error(400, f"Invalid JSON: {exc}")
            return

        try:
            submission = add_prediction_submission(data)
            self._send_json({"status": "success", "submission": submission})
        except ValueError as exc:
            self.send_error(400, str(exc))
        except Exception as exc:
            self.send_error(500, str(exc))
