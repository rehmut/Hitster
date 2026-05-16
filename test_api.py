import threading
import time

import requests
import server
from api.prediction_store import score_prediction

BASE_URL = "http://localhost:8000"

def start_server():
    thread = threading.Thread(target=server.run_server, daemon=True)
    thread.start()
    time.sleep(1)
    return thread

def expect_ok(response, step):
    if response.status_code != 200:
        raise AssertionError(f"{step} failed: {response.status_code} {response.text}")
    return response.json()


def test_prediction_scores_keep_semifinal_and_final_separate():
    config = {
        "semi1Acts": [{"country": "A"}, {"country": "B"}],
        "semi2Acts": [{"country": "C"}, {"country": "D"}],
        "results": {
            "semi1": ["A"],
            "semi2": ["D"],
            "final": ["A", "D"],
            "finalGermanyPlace": 23,
            "finalLastPlace": "Germany",
        },
    }
    picks = {
        "semi1": {"A": True, "B": False},
        "semi2": {"C": False, "D": True},
        "final": [{"country": "A"}, {"country": "D"}],
        "lastPlace": "Germany",
        "germanyPlace": 23,
    }

    score = score_prediction(picks, config)

    assert score["semifinal"] == 4
    assert score["final"]["points"] == 44
    assert score["total"] == 48


def test_final_top10_near_misses_still_score():
    config = {
        "semi1Acts": [],
        "semi2Acts": [],
        "results": {
            "final": ["Bulgaria", "Israel", "Romania", "Australia"],
        },
    }
    picks = {
        "final": [
            {"country": "Israel"},
            {"country": "Romania"},
            {"country": "Australia"},
            {"country": "Bulgaria"},
        ],
    }

    score = score_prediction(picks, config)

    assert score["final"]["top10"] == 30

def test_multiplayer_flow():
    host = "TesterHost"
    guest = "TesterGuest"

    print("Creating room...")
    room = expect_ok(
        requests.post(f"{BASE_URL}/api/room/create", json={"host_name": host}),
        "create room"
    )
    code = room["room_code"]
    print(f"Room code: {code}")

    print("Joining room...")
    room = expect_ok(
        requests.post(f"{BASE_URL}/api/room/join", json={"code": code, "name": guest}),
        "join room"
    )
    assert len(room["players"]) == 2, "Expected two players after join"

    print("Marking players ready...")
    expect_ok(
        requests.post(
            f"{BASE_URL}/api/room/player",
            json={"code": code, "player": {"name": host, "ready": True}}
        ),
        "host ready"
    )
    room = expect_ok(
        requests.post(
            f"{BASE_URL}/api/room/player",
            json={"code": code, "player": {"name": guest, "ready": True}}
        ),
        "guest ready"
    )
    assert all(p.get("ready") for p in room["players"]), "Both players should be ready"

    print("Starting match...")
    room = expect_ok(
        requests.post(
            f"{BASE_URL}/api/room/update",
            json={"code": code, "updates": {"status": "playing"}}
        ),
        "start match"
    )
    assert room["status"] == "playing"

    print("Posting score update...")
    room = expect_ok(
        requests.post(
            f"{BASE_URL}/api/room/player",
            json={"code": code, "player": {"name": guest, "score": 5, "lives": 1, "state": "done"}}
        ),
        "guest progress"
    )
    assert any(p["score"] == 5 for p in room["players"]), "Score should be tracked"

    print("Guest leaves room...")
    expect_ok(
        requests.post(f"{BASE_URL}/api/room/leave", json={"code": code, "name": guest}),
        "guest leave"
    )

    print("Host finishes and leaves room...")
    expect_ok(
        requests.post(
            f"{BASE_URL}/api/room/player",
            json={"code": code, "player": {"name": host, "state": "done"}}
        ),
        "host done"
    )
    expect_ok(
        requests.post(f"{BASE_URL}/api/room/leave", json={"code": code, "name": host}),
        "host leave"
    )

    res = requests.get(f"{BASE_URL}/api/room/status?code={code}")
    assert res.status_code == 404, "Room should be deleted after everyone leaves"
    print("Room cleaned up as expected.")

if __name__ == "__main__":
    start_server()
    test_multiplayer_flow()
