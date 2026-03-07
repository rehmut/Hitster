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
        name = data.get('name')
        if not code or not name:
            self.send_error(400, 'Missing code or name')
            return

        room, error = manager.join_room(code, name)
        if error:
            self.send_error(400, error)
            return

        send_json(self, room)
