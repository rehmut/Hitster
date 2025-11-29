from http.server import BaseHTTPRequestHandler
import json
import os
import requests

# Vercel KV Configuration
KV_REST_API_URL = os.environ.get('KV_REST_API_URL')
KV_REST_API_TOKEN = os.environ.get('KV_REST_API_TOKEN')
LEADERBOARD_KEY = 'hitster_leaderboard'

# Fallback for local development
LOCAL_LEADERBOARD_FILE = '/tmp/leaderboard.json'

class handler(BaseHTTPRequestHandler):
    def get_leaderboard(self):
        if KV_REST_API_URL and KV_REST_API_TOKEN:
            try:
                headers = {'Authorization': f'Bearer {KV_REST_API_TOKEN}'}
                response = requests.get(f'{KV_REST_API_URL}/get/{LEADERBOARD_KEY}', headers=headers)
                data = response.json()
                if data and 'result' in data and data['result']:
                    return json.loads(data['result'])
                return []
            except Exception as e:
                print(f"KV Error: {e}")
                return []
        else:
            if os.path.exists(LOCAL_LEADERBOARD_FILE):
                try:
                    with open(LOCAL_LEADERBOARD_FILE, 'r') as f:
                        return json.load(f)
                except:
                    return []
            return []

    def save_leaderboard(self, data):
        if KV_REST_API_URL and KV_REST_API_TOKEN:
            try:
                headers = {'Authorization': f'Bearer {KV_REST_API_TOKEN}'}
                # KV SET command
                requests.post(
                    f'{KV_REST_API_URL}/set/{LEADERBOARD_KEY}',
                    headers=headers,
                    json=json.dumps(data) # Store as string
                )
            except Exception as e:
                print(f"KV Save Error: {e}")
        else:
            with open(LOCAL_LEADERBOARD_FILE, 'w') as f:
                json.dump(data, f)

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
        data = self.get_leaderboard()
        self.wfile.write(json.dumps(data).encode())

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            new_score = json.loads(post_data)
            
            data = self.get_leaderboard()
            
            data.append(new_score)
            data.sort(key=lambda x: x['score'], reverse=True)
            data = data[:50]
            
            self.save_leaderboard(data)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode())
            
        except Exception as e:
            self.send_error(500, str(e))
