import http.server
import socketserver
import json
import os
import urllib.parse

PORT = 8000
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')

from api.leaderboard_store import add_score, get_leaderboard
from api.multiplayer import manager


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def _send_json(self, payload, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/leaderboard':
            self._send_json(get_leaderboard())
        elif parsed_path.path == '/api/room/status':
            query = urllib.parse.parse_qs(parsed_path.query)
            code = query.get('code', [None])[0]
            if not code:
                self.send_error(400, "Missing room code")
                return

            room = manager.get_room(code)
            if room:
                self._send_json(room)
            else:
                self.send_error(404, "Room not found")
        else:
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length else b'{}'

        if self.path == '/api/leaderboard':
            self._handle_leaderboard(post_data)
        elif self.path == '/api/room/create':
            self._handle_room_create(post_data)
        elif self.path == '/api/room/join':
            self._handle_room_join(post_data)
        elif self.path == '/api/room/update':
            self._handle_room_update(post_data)
        elif self.path == '/api/room/player':
            self._handle_player_update(post_data)
        elif self.path == '/api/room/leave':
            self._handle_leave_room(post_data)
        else:
            self.send_error(404)

    def _handle_leaderboard(self, payload):
        try:
            new_score = json.loads(payload)
        except json.JSONDecodeError as exc:
            self.send_error(400, f'Invalid JSON: {exc}')
            return

        if not all(k in new_score for k in ('name', 'score', 'mode')):
            self.send_error(400, "Invalid data")
            return

        try:
            add_score(new_score)
            self._send_json({"status": "success"})
        except Exception as exc:
            print(f"Error saving score: {exc}")
            self.send_error(500, str(exc))

    def _handle_room_create(self, payload):
        try:
            data = json.loads(payload)
            host_name = data.get('host_name')
            if not host_name:
                self.send_error(400, "Missing host_name")
                return

            room = manager.create_room(host_name)
            self._send_json(room)
        except Exception as e:
            self.send_error(500, str(e))

    def _handle_room_join(self, payload):
        try:
            data = json.loads(payload)
            code = data.get('code')
            name = data.get('name')
            if not code or not name:
                self.send_error(400, "Missing code or name")
                return

            room, error = manager.join_room(code, name)
            if error:
                self.send_error(400, error)
                return

            self._send_json(room)
        except Exception as e:
            self.send_error(500, str(e))

    def _handle_room_update(self, payload):
        try:
            data = json.loads(payload)
            code = data.get('code')
            updates = data.get('updates')
            if not code or not updates:
                self.send_error(400, "Missing code or updates")
                return

            room = manager.update_room(code, updates)
            if not room:
                self.send_error(404, "Room not found")
                return

            self._send_json(room)
        except Exception as e:
            self.send_error(500, str(e))

    def _handle_player_update(self, payload):
        try:
            data = json.loads(payload)
            code = data.get('code')
            player_updates = data.get('player')
            if not code or not player_updates:
                self.send_error(400, "Missing code or player payload")
                return

            room, error = manager.update_player(code, player_updates)
            if error:
                self.send_error(400, error)
                return

            self._send_json(room)
        except Exception as e:
            self.send_error(500, str(e))

    def _handle_leave_room(self, payload):
        try:
            data = json.loads(payload)
            code = data.get('code')
            name = data.get('name')
            if not code or not name:
                self.send_error(400, "Missing code or name")
                return

            response, error = manager.leave_room(code, name)
            if error:
                self.send_error(400, error)
                return

            self._send_json(response if isinstance(response, dict) else response)
        except Exception as e:
            self.send_error(500, str(e))


def run_server():
    print(f"Serving at http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()
