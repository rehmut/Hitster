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

        host_name = data.get('host_name')
        if not host_name:
            self.send_error(400, 'Missing host_name')
            return

        try:
            room = manager.create_room(host_name)
            send_json(self, room)
        except Exception as exc:
            self.send_error(500, str(exc))
