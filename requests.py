import json
from dataclasses import dataclass
from urllib import request as urllib_request, error as urllib_error

@dataclass
class Response:
    status_code: int
    text: str

    def json(self):
        if not self.text:
            return None
        return json.loads(self.text)

def _build_request(method, url, headers=None, data=None):
    body = data
    req = urllib_request.Request(url, data=body, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    return req

def _prepare_body(json_payload=None, data=None):
    if json_payload is not None:
        body = json.dumps(json_payload).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        return body, headers
    return data, {}

def get(url, headers=None):
    try:
        with urllib_request.urlopen(_build_request('GET', url, headers=headers)) as resp:
            return Response(resp.status, resp.read().decode('utf-8'))
    except urllib_error.HTTPError as exc:
        return Response(exc.code, exc.read().decode('utf-8'))

def post(url, headers=None, json=None, data=None):
    body, additional_headers = _prepare_body(json, data)
    merged_headers = dict(headers or {})
    merged_headers.update({k: v for k, v in additional_headers.items() if k not in merged_headers})
    try:
        with urllib_request.urlopen(_build_request('POST', url, headers=merged_headers, data=body)) as resp:
            return Response(resp.status, resp.read().decode('utf-8'))
    except urllib_error.HTTPError as exc:
        return Response(exc.code, exc.read().decode('utf-8'))

def delete(url, headers=None):
    try:
        with urllib_request.urlopen(_build_request('DELETE', url, headers=headers)) as resp:
            return Response(resp.status, resp.read().decode('utf-8'))
    except urllib_error.HTTPError as exc:
        return Response(exc.code, exc.read().decode('utf-8'))
