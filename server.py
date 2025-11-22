import http.server
import socketserver
import json
import os
import urllib.parse

PORT = 8000
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')
LEADERBOARD_FILE = os.path.join(os.path.dirname(__file__), 'leaderboard.json')

# Ensure leaderboard file exists
if not os.path.exists(LEADERBOARD_FILE):
    with open(LEADERBOARD_FILE, 'w') as f:
        json.dump([], f)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        if self.path == '/api/leaderboard':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            with open(LEADERBOARD_FILE, 'r') as f:
                self.wfile.write(f.read().encode())
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/leaderboard':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                new_score = json.loads(post_data)
                
                # Validate
                if 'name' not in new_score or 'score' not in new_score or 'mode' not in new_score:
                    self.send_error(400, "Invalid data")
                    return

                with open(LEADERBOARD_FILE, 'r+') as f:
                    data = json.load(f)
                    data.append(new_score)
                    # Sort by score desc
                    data.sort(key=lambda x: x['score'], reverse=True)
                    # Keep top 50
                    data = data[:50]
                    
                    f.seek(0)
                    json.dump(data, f, indent=2)
                    f.truncate()

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode())
                
            except Exception as e:
                print(f"Error saving score: {e}")
                self.send_error(500, str(e))
        else:
            self.send_error(404)

print(f"Serving at http://localhost:{PORT}")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
