from http.server import BaseHTTPRequestHandler
import json
import os

# Note: On Vercel, the filesystem is read-only/ephemeral. 
# Scores saved here will NOT persist across deployments or cold starts.
# To fix this, you would need to connect a database like Vercel KV or Firebase.
LEADERBOARD_FILE = '/tmp/leaderboard.json'

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
        if os.path.exists(LEADERBOARD_FILE):
            with open(LEADERBOARD_FILE, 'r') as f:
                self.wfile.write(f.read().encode())
        else:
            self.wfile.write(json.dumps([]).encode())

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            new_score = json.loads(post_data)
            
            # Load existing
            data = []
            if os.path.exists(LEADERBOARD_FILE):
                with open(LEADERBOARD_FILE, 'r') as f:
                    try:
                        data = json.load(f)
                    except:
                        data = []
            
            data.append(new_score)
            data.sort(key=lambda x: x['score'], reverse=True)
            data = data[:50]
            
            # Save (Ephemeral!)
            with open(LEADERBOARD_FILE, 'w') as f:
                json.dump(data, f)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode())
            
        except Exception as e:
            self.send_error(500, str(e))
