import json
import os
import time
from pathlib import Path

import requests

KV_REST_API_URL = os.environ.get("KV_REST_API_URL")
KV_REST_API_TOKEN = os.environ.get("KV_REST_API_TOKEN")
KV_PREDICTIONS_KEY = "hitster_predictions_2026_reset_20260512"
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


def _country_name(entry):
    return entry if isinstance(entry, str) else entry.get("country")


def _final_rank_points(predicted_idx, actual_idx):
    diff = abs(predicted_idx - actual_idx)
    if diff == 0:
        return 12
    if diff == 1:
        return 9
    if diff == 2:
        return 6
    if diff == 3:
        return 3
    return 0


def _score_final(picks, actual_results, results=None):
    if not actual_results:
        return {"points": 0, "top10": 0, "lastPlace": 0, "germanyPlace": 0, "available": False}

    results = results or {}
    actual_countries = [_country_name(entry) for entry in actual_results]
    top10_points = 0
    actual_map = {country: idx for idx, country in enumerate(actual_countries)}
    for idx, pick in enumerate((picks.get("final", []) or [])[:10]):
        if not pick:
            continue
        country = _country_name(pick)
        if country in actual_map:
            top10_points += _final_rank_points(idx, actual_map[country])

    actual_last_place = results.get("finalLastPlace") or actual_countries[-1]
    last_points = 10 if picks.get("lastPlace") and picks.get("lastPlace") == actual_last_place else 0
    germany_place = picks.get("germanyPlace")
    actual_germany_place = results.get("finalGermanyPlace")
    if actual_germany_place is None:
        actual_germany_place = actual_countries.index("Germany") + 1 if "Germany" in actual_countries else None
    try:
        germany_pick = int(germany_place) if germany_place else None
    except (TypeError, ValueError):
        germany_pick = None
    germany_points = 10 if germany_pick and actual_germany_place and germany_pick == actual_germany_place else 0
    total = top10_points + last_points + germany_points
    return {
        "points": total,
        "top10": top10_points,
        "lastPlace": last_points,
        "germanyPlace": germany_points,
        "available": True,
    }


def score_prediction(picks, config=None):
    config = config or get_prediction_config()
    results = config.get("results", {})
    semi1 = _score_semifinal(picks.get("semi1", {}), config.get("semi1Acts", []), results.get("semi1", []))
    semi2 = _score_semifinal(picks.get("semi2", {}), config.get("semi2Acts", []), results.get("semi2", []))
    final = _score_final(picks, results.get("final", []), results)
    semifinal_total = semi1["points"] + semi2["points"]
    total = semifinal_total + final["points"]
    return {"total": total, "semifinal": semifinal_total, "semi1": semi1, "semi2": semi2, "final": final}


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


def _validate_voting_open(config, board):
    if config.get("votingOpen", {}).get(board) is False:
        raise ValueError(f"{board} voting is closed")


def _clean_semifinal_picks(picks):
    return {country: bool(value) for country, value in picks.items() if isinstance(value, bool)}


def _clean_final_picks(final):
    return final[:10] if isinstance(final, list) else []


def _validate_final_country(config, field, country):
    valid = {act.get("country") for act in config.get("qualifiedForFinal", [])}
    if country and country not in valid:
        raise ValueError(f"{field} contains unknown country: {country}")


def _all_prediction_countries(config):
    countries = set()
    for key in ("semi1Acts", "semi2Acts", "qualifiedForFinal"):
        countries.update(act.get("country") for act in config.get(key, []) if act.get("country"))
    return countries


def _validate_favorite_country(config, country):
    valid = _all_prediction_countries(config)
    if country and country not in valid:
        raise ValueError(f"favorite contains unknown country: {country}")


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
    last_place = picks.get("lastPlace")
    germany_place = picks.get("germanyPlace")
    favorite = picks.get("favorite")

    if semi1 is not None:
        _validate_voting_open(config, "semi1")
        _validate_semifinal("semi1", semi1, config.get("semi1Acts", []))
        normalized_picks["semi1"] = _clean_semifinal_picks(semi1)
    if semi2 is not None:
        _validate_voting_open(config, "semi2")
        _validate_semifinal("semi2", semi2, config.get("semi2Acts", []))
        normalized_picks["semi2"] = _clean_semifinal_picks(semi2)
    if final is not None and not isinstance(final, list):
        raise ValueError("final must be a list")
    if final is not None:
        _validate_voting_open(config, "final")
        normalized_picks["final"] = _clean_final_picks(final)
    if last_place:
        _validate_voting_open(config, "final")
        _validate_final_country(config, "lastPlace", last_place)
        normalized_picks["lastPlace"] = str(last_place)
    if germany_place:
        _validate_voting_open(config, "final")
        try:
            place = int(germany_place)
        except (TypeError, ValueError):
            raise ValueError("germanyPlace must be a number")
        finalist_count = len(config.get("qualifiedForFinal", [])) or 25
        if place < 1 or place > finalist_count:
            raise ValueError(f"germanyPlace must be between 1 and {finalist_count}")
        normalized_picks["germanyPlace"] = place
    if favorite:
        _validate_voting_open(config, "final")
        _validate_favorite_country(config, favorite)
        normalized_picks["favorite"] = str(favorite)
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
    for field in ("lastPlace", "germanyPlace", "favorite"):
        if field in incoming:
            merged[field] = incoming[field]
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
    return entries[:200]
