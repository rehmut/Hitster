from http.server import BaseHTTPRequestHandler
import json

from api.multiplayer import manager
from api.room.common import read_json, send_json


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            data = read_json(self)
        except json.JSONDecodeError as exc:
            self.send_error(400, f'Invalid JSON: {exc}')
            return

        code = data.get('code')
        updates = data.get('updates')
        if not code or not updates:
            self.send_error(400, 'Missing code or updates')
            return

        room = manager.update_room(code, updates)
        if not room:
            self.send_error(404, 'Room not found')
            return

        send_json(self, room)
