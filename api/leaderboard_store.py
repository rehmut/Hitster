import json
import os
from pathlib import Path

import requests

KV_REST_API_URL = os.environ.get("KV_REST_API_URL")
KV_REST_API_TOKEN = os.environ.get("KV_REST_API_TOKEN")
KV_LEADERBOARD_KEY = "hitster_leaderboard"

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_LEADERBOARD_FILE = PROJECT_ROOT / "leaderboard.json"


def _kv_headers():
    if KV_REST_API_URL and KV_REST_API_TOKEN:
        return {"Authorization": f"Bearer {KV_REST_API_TOKEN}"}
    return None


def get_leaderboard():
    headers = _kv_headers()
    if headers:
        try:
            response = requests.get(
                f"{KV_REST_API_URL}/get/{KV_LEADERBOARD_KEY}",
                headers=headers,
            )
            if response.status_code == 200:
                payload = response.json()
                if payload and payload.get("result"):
                    return json.loads(payload["result"])
        except Exception as exc:
            print(f"KV leaderboard fetch failed: {exc}")

    if LOCAL_LEADERBOARD_FILE.exists():
        try:
            return json.loads(LOCAL_LEADERBOARD_FILE.read_text())
        except Exception as exc:
            print(f"Local leaderboard read failed: {exc}")
    return []


def save_leaderboard(entries):
    headers = _kv_headers()
    if headers:
        try:
            payload = json.dumps(entries)
            kv_headers = dict(headers)
            kv_headers.setdefault("Content-Type", "application/json")
            requests.post(
                f"{KV_REST_API_URL}/set/{KV_LEADERBOARD_KEY}",
                headers=kv_headers,
                data=payload.encode("utf-8"),
            )
            return
        except Exception as exc:
            print(f"KV leaderboard save failed: {exc}")

    LOCAL_LEADERBOARD_FILE.write_text(json.dumps(entries, indent=2))


def add_score(entry):
    entries = get_leaderboard()
    entries.append(entry)
    entries.sort(key=lambda item: item.get("score", 0), reverse=True)
    limited = entries[:50]
    save_leaderboard(limited)
    return limited
