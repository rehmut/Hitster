from http.server import BaseHTTPRequestHandler
import urllib.parse

from api.multiplayer import manager
from api.room.common import send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        code = params.get('code', [None])[0]
        if not code:
            self.send_error(400, 'Missing room code')
            return

        room = manager.get_room(code)
        if not room:
            self.send_error(404, 'Room not found')
            return

        send_json(self, room)
