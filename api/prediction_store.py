import json
import os
import time
from pathlib import Path

import requests

KV_REST_API_URL = os.environ.get("KV_REST_API_URL")
KV_REST_API_TOKEN = os.environ.get("KV_REST_API_TOKEN")
KV_PREDICTIONS_KEY = "hitster_predictions_2026"
RUNNING_ON_VERCEL = bool(os.environ.get("VERCEL"))

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_PREDICTIONS_FILE = PROJECT_ROOT / "prediction_submissions.json"
PREDICTION_CONFIG_FILES = (
    PROJECT_ROOT / "public" / "prediction-2026.json",
    Path(__file__).resolve().with_name("prediction-2026.json"),
)


def _kv_headers():
    if bool(KV_REST_API_URL) != bool(KV_REST_API_TOKEN):
        raise RuntimeError("KV_REST_API_URL and KV_REST_API_TOKEN must both be set")
    if KV_REST_API_URL and KV_REST_API_TOKEN:
        return {"Authorization": f"Bearer {KV_REST_API_TOKEN}"}
    return None


def _read_json_file(path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Failed to read {path}: {exc}")
        return fallback


def get_prediction_config():
    for path in PREDICTION_CONFIG_FILES:
        config = _read_json_file(path, None)
        if config:
            return config
    return {}


def get_prediction_submissions():
    headers = _kv_headers()
    if headers:
        try:
            response = requests.get(
                f"{KV_REST_API_URL}/get/{KV_PREDICTIONS_KEY}",
                headers=headers,
            )
            if response.status_code != 200:
                raise RuntimeError(f"KV GET failed with {response.status_code}: {response.text}")
            payload = response.json()
            if payload and payload.get("error"):
                raise RuntimeError(f"KV GET failed: {payload['error']}")
            if payload and payload.get("result"):
                return json.loads(payload["result"])
        except Exception as exc:
            print(f"KV prediction fetch failed: {exc}")
            raise

    return _read_json_file(LOCAL_PREDICTIONS_FILE, [])


def save_prediction_submissions(entries):
    headers = _kv_headers()
    if headers:
        try:
            payload = json.dumps(entries)
            kv_headers = dict(headers)
            kv_headers.setdefault("Content-Type", "application/json")
            response = requests.post(
                f"{KV_REST_API_URL}/set/{KV_PREDICTIONS_KEY}",
                headers=kv_headers,
                data=payload.encode("utf-8"),
            )
            if response.status_code != 200:
                raise RuntimeError(f"KV SET failed with {response.status_code}: {response.text}")
            response_payload = response.json()
            if response_payload and response_payload.get("error"):
                raise RuntimeError(f"KV SET failed: {response_payload['error']}")
            return
        except Exception as exc:
            print(f"KV prediction save failed: {exc}")
            raise

    if RUNNING_ON_VERCEL:
        raise RuntimeError("Prediction saving on Vercel requires KV_REST_API_URL and KV_REST_API_TOKEN")

    LOCAL_PREDICTIONS_FILE.write_text(json.dumps(entries, indent=2), encoding="utf-8")


def _country_set(results):
    return {entry if isinstance(entry, str) else entry.get("country") for entry in results or []}


def _score_semifinal(picks, acts, actual_results):
    actual = _country_set(actual_results)
    if not actual:
        return {"points": 0, "max": len(acts), "available": False}

    points = 0
    for act in acts:
        country = act.get("country")
        pick = picks.get(country)
        if isinstance(pick, bool) and pick == (country in actual):
            points += 1
    return {"points": points, "max": len(acts), "available": True}


def _score_final(picks, actual_results):
    if not actual_results:
        return {"points": 0, "available": False}

    actual_map = {
        (entry if isinstance(entry, str) else entry.get("country")): idx
        for idx, entry in enumerate(actual_results)
    }
    points = 0
    for idx, pick in enumerate(picks or []):
        if not pick:
            continue
        country = pick if isinstance(pick, str) else pick.get("country")
        if country not in actual_map:
            continue
        diff = abs(idx - actual_map[country])
        if diff == 0:
            points += 12
        elif diff == 1:
            points += 9
        elif diff == 2:
            points += 6
        elif diff == 3:
            points += 3
    return {"points": points, "available": True}


def score_prediction(picks, config=None):
    config = config or get_prediction_config()
    results = config.get("results", {})
    semi1 = _score_semifinal(picks.get("semi1", {}), config.get("semi1Acts", []), results.get("semi1", []))
    semi2 = _score_semifinal(picks.get("semi2", {}), config.get("semi2Acts", []), results.get("semi2", []))
    final = _score_final(picks.get("final", []), results.get("final", []))
    total = semi1["points"] + semi2["points"] + final["points"]
    return {"total": total, "semi1": semi1, "semi2": semi2, "final": final}


def _validate_semifinal(name, picks, acts):
    if not isinstance(picks, dict):
        raise ValueError(f"{name} must be an object keyed by country")
    valid_countries = {act.get("country") for act in acts}
    qualifiers = [country for country, value in picks.items() if value is True]
    if len(qualifiers) != 10:
        raise ValueError(f"{name} must have exactly 10 qualifiers")
    unknown = [country for country in picks if country not in valid_countries]
    if unknown:
        raise ValueError(f"{name} contains unknown countries: {', '.join(unknown)}")


def _clean_semifinal_picks(picks):
    return {country: bool(value) for country, value in picks.items() if isinstance(value, bool)}


def _clean_final_picks(final):
    return final[:10] if isinstance(final, list) else []


def normalize_prediction_submission(data):
    config = get_prediction_config()
    name = str(data.get("name", "")).strip()[:30] or "Anonymous"
    picks = data.get("picks") or {}
    if not isinstance(picks, dict):
        raise ValueError("picks must be an object")

    normalized_picks = {}
    semi1 = picks.get("semi1")
    semi2 = picks.get("semi2")
    final = picks.get("final")

    if semi1 is not None:
        _validate_semifinal("semi1", semi1, config.get("semi1Acts", []))
        normalized_picks["semi1"] = _clean_semifinal_picks(semi1)
    if semi2 is not None:
        _validate_semifinal("semi2", semi2, config.get("semi2Acts", []))
        normalized_picks["semi2"] = _clean_semifinal_picks(semi2)
    if final is not None and not isinstance(final, list):
        raise ValueError("final must be a list")
    if final is not None:
        normalized_picks["final"] = _clean_final_picks(final)
    if not normalized_picks:
        raise ValueError("at least one semifinal or final pick set is required")

    return {
        "name": name,
        "season": str(config.get("season", data.get("season", "2026"))),
        "picks": normalized_picks,
        "submitted_at": int(time.time()),
    }


def _merge_prediction_picks(existing, incoming):
    merged = dict(existing or {})
    for board in ("semi1", "semi2"):
        if board in incoming:
            merged[board] = incoming[board]
    if "final" in incoming:
        merged["final"] = incoming["final"]
    return merged


def add_prediction_submission(data):
    config = get_prediction_config()
    submission = normalize_prediction_submission(data)

    entries = get_prediction_submissions()
    for idx in range(len(entries) - 1, -1, -1):
        entry = entries[idx]
        if entry.get("season") != submission["season"]:
            continue
        if str(entry.get("name", "")).strip().lower() != submission["name"].lower():
            continue
        merged = dict(entry)
        merged["picks"] = _merge_prediction_picks(entry.get("picks", {}), submission["picks"])
        merged["submitted_at"] = submission["submitted_at"]
        merged["score"] = score_prediction(merged["picks"], config)
        entries[idx] = merged
        save_prediction_submissions(entries)
        return merged

    submission["score"] = score_prediction(submission["picks"], config)
    entries.append(submission)
    entries = entries[-200:]
    save_prediction_submissions(entries)
    return submission


def get_prediction_leaderboard():
    config = get_prediction_config()
    entries = []
    for entry in get_prediction_submissions():
        refreshed = dict(entry)
        refreshed["score"] = score_prediction(refreshed.get("picks", {}), config)
        entries.append(refreshed)
    entries.sort(key=lambda item: item.get("score", {}).get("total", 0), reverse=True)
    return entries[:50]
