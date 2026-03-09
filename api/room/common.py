import json


def read_json(handler):
    length = int(handler.headers.get('Content-Length', 0))
    body = handler.rfile.read(length) if length else b''
    if not body:
        return {}
    return json.loads(body)


def send_json(handler, payload, status=200):
    handler.send_response(status)
    handler.send_header('Content-type', 'application/json')
    handler.send_header('Cache-Control', 'no-store')
    handler.end_headers()
    handler.wfile.write(json.dumps(payload).encode())
