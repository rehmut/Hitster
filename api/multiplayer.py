import json
import os
import random
import string
import time
import requests

MAX_PLAYERS = int(os.environ.get('MAX_MULTIPLAYER_PLAYERS', 2))

# Vercel KV Configuration
KV_REST_API_URL = os.environ.get('KV_REST_API_URL')
KV_REST_API_TOKEN = os.environ.get('KV_REST_API_TOKEN')
ROOM_PREFIX = 'hitster_room_'

# Local fallback
LOCAL_ROOMS = {}


class MultiplayerManager:
    def _get_room_key(self, code):
        return f"{ROOM_PREFIX}{code}"

    def _generate_code(self):
        return ''.join(random.choices(string.ascii_uppercase, k=4))

    def _now(self):
        return time.time()

    def _new_player(self, name):
        now = self._now()
        return {
            "name": name,
            "score": 0,
            "lives": 3,
            "ready": False,
            "state": "lobby",
            "last_sync": now
        }

    def _find_player(self, room, player_name):
        return next((p for p in room['players'] if p['name'] == player_name), None)

    def get_room(self, code):
        if KV_REST_API_URL and KV_REST_API_TOKEN:
            try:
                headers = {'Authorization': f'Bearer {KV_REST_API_TOKEN}'}
                response = requests.get(f"{KV_REST_API_URL}/get/{self._get_room_key(code)}", headers=headers)
                data = response.json()
                if data and 'result' in data and data['result']:
                    return json.loads(data['result'])
                return None
            except Exception as e:
                print(f"KV Error: {e}")
                return None
        else:
            return LOCAL_ROOMS.get(code)

    def save_room(self, code, data):
        data['last_updated'] = self._now()
        if KV_REST_API_URL and KV_REST_API_TOKEN:
            try:
                headers = {
                    'Authorization': f'Bearer {KV_REST_API_TOKEN}',
                    'Content-Type': 'application/json'
                }
                payload = json.dumps(data).encode('utf-8')
                requests.post(
                    f"{KV_REST_API_URL}/set/{self._get_room_key(code)}",
                    headers=headers,
                    data=payload
                )
            except Exception as e:
                print(f"KV Save Error: {e}")
        else:
            LOCAL_ROOMS[code] = data

    def delete_room(self, code):
        if KV_REST_API_URL and KV_REST_API_TOKEN:
            try:
                headers = {'Authorization': f'Bearer {KV_REST_API_TOKEN}'}
                requests.delete(f"{KV_REST_API_URL}/del/{self._get_room_key(code)}", headers=headers)
            except Exception as e:
                print(f"KV Delete Error: {e}")
        else:
            LOCAL_ROOMS.pop(code, None)
        return True

    def create_room(self, host_name):
        code = self._generate_code()
        while self.get_room(code):
            code = self._generate_code()

        now = self._now()
        room_data = {
            "room_code": code,
            "status": "waiting",
            "host_name": host_name,
            "max_players": MAX_PLAYERS,
            "players": [self._new_player(host_name)],
            "game_mode": "country",
            "current_song_index": 0,
            "song_seed": random.randint(1, 100000),
            "created_at": now,
            "started_at": None,
            "winner": None
        }
        self.save_room(code, room_data)
        return room_data

    def join_room(self, code, player_name):
        room = self.get_room(code)
        if not room:
            return None, "Room not found"

        if len(room['players']) >= room.get('max_players', MAX_PLAYERS):
            return None, "Room full"

        if room['status'] not in ('waiting', 'lobby'):
            return None, "Game already started"

        if any(p['name'] == player_name for p in room['players']):
            return None, "Name taken"

        room['players'].append(self._new_player(player_name))
        self.save_room(code, room)
        return room, None

    def update_room(self, code, update_data):
        room = self.get_room(code)
        if not room:
            return None

        previous_status = room.get('status')
        for key, value in update_data.items():
            if key == 'players':
                room['players'] = value
            else:
                room[key] = value

        if room.get('status') == 'playing' and previous_status != 'playing':
            self._prepare_round(room)

        self.save_room(code, room)
        return room

    def _prepare_round(self, room):
        now = self._now()
        room['started_at'] = now
        room['winner'] = None
        room['song_seed'] = random.randint(1, 100000)
        for player in room['players']:
            player['score'] = 0
            player['lives'] = 3
            player['ready'] = False
            player['state'] = 'playing'
            player['last_sync'] = now

    def update_player(self, code, player_update):
        room = self.get_room(code)
        if not room:
            return None, "Room not found"

        name = player_update.get('name')
        if not name:
            return None, "Missing player name"

        player = self._find_player(room, name)
        if not player:
            return None, "Player not in room"

        for field in ('score', 'lives', 'ready', 'state'):
            if field in player_update:
                player[field] = player_update[field]
        player['last_sync'] = self._now()

        if all(p.get('state') == 'done' for p in room['players']) and room['players']:
            winners = sorted(room['players'], key=lambda p: p.get('score', 0), reverse=True)
            room['winner'] = winners[0]['name']
            room['status'] = 'completed'

        self.save_room(code, room)
        return room, None

    def leave_room(self, code, player_name):
        room = self.get_room(code)
        if not room:
            return None, "Room not found"

        original_count = len(room['players'])
        room['players'] = [p for p in room['players'] if p['name'] != player_name]
        if len(room['players']) == original_count:
            return None, "Player not in room"

        if not room['players']:
            self.delete_room(code)
            return {"status": "deleted"}, None

        if room['host_name'] == player_name:
            room['host_name'] = room['players'][0]['name']

        self.save_room(code, room)
        return room, None


manager = MultiplayerManager()
