import json
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List

import requests
from flask import Flask, abort, jsonify, render_template

BASE_DIR = Path(__file__).parent
COMMENTS_PATH = BASE_DIR / "comments.json"
REDDIT_URL = "https://www.reddit.com/r/SoccerBetting/comments/1q19f1t/daily_picks_thread_friday_2nd_january_2026/.json"

app = Flask(__name__)


def scrape_reddit():
    """Fetch latest comments from Reddit and save to comments.json."""
    try:
        r = requests.get(REDDIT_URL, headers={"User-Agent": "SoccerApp/1.0"})
        r.raise_for_status()
        data = r.json()
        
        with COMMENTS_PATH.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        return True
    except Exception as e:
        print(f"Scraping error: {e}")
        return False


def _parse_listing(listing: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Recursively extract Reddit comments from a listing payload."""
    children = listing.get("data", {}).get("children", [])
    parsed: List[Dict[str, Any]] = []

    for child in children:
        if child.get("kind") != "t1":
            # Skip non-comment items like the submission itself.
            continue

        data = child.get("data", {})
        replies = data.get("replies")
        body = data.get("body") or ""
        
        # Extract picks and notes from comment body
        picks, notes = extract_picks_and_notes(body)
        
        # Skip comments without clear betting picks
        if not picks:
            continue

        parsed.append(
            {
                "id": data.get("id"),
                "author": data.get("author") or "[deleted]",
                "body": body,
                "picks": picks,
                "notes": notes,
                "ups": data.get("ups", 0),
                "downs": data.get("downs", 0),
                "replies": _parse_listing(replies) if isinstance(replies, dict) else [],
            }
        )

    return parsed


def extract_picks_and_notes(body: str) -> tuple[str, str]:
    """
    Extract betting picks from comment body using regex patterns.
    Returns (picks, notes) tuple.
    """
    if not body:
        return "", ""
    
    lines = body.split('\n')
    extracted_picks: List[str] = []
    note_lines: List[str] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Extract structured pick fragments (short form) from the line
        picks_in_line = extract_bet_segments(line)

        if picks_in_line:
            extracted_picks.extend(picks_in_line)
            # Keep the original line in notes for context/expand view
            note_lines.append(line)
        else:
            note_lines.append(line)

    # Deduplicate while preserving order
    seen = set()
    unique_picks = []
    for p in extracted_picks:
        if p not in seen:
            seen.add(p)
            unique_picks.append(p)

    picks = '\n'.join(unique_picks)
    notes = '\n'.join(note_lines)

    return picks, notes


def extract_bet_segments(line: str) -> List[str]:
    """
    Extract individual betting picks from a line.
    Examples: 
    - "Al Nassr ML" 
    - "Sporting ML @ 2.38"
    - "Arsenal vs Chelsea - BTTS"
    """
    segments: List[str] = []

    # Comprehensive pattern provided (covers: Team vs Team - Bet @ odds, Team ML, Over/Under)
    combined_pattern = r'(?:([A-Z][A-Za-z\s]+?)(?:\s+(?:vs?\.?|v)\s+([A-Z][A-Za-z\s]+?))?\s*[-–,]?\s*)?((?:[A-Z][A-Za-z\s]+?\s+)?(?:ML|BTTS|(?:Over|Under)\s+[+\-]?[\d.]+(?:\s+goals?)?))(?:\s*@\s*([\d.]+))?'

    for match in re.finditer(combined_pattern, line, re.IGNORECASE):
        team1 = (match.group(1) or '').strip()
        team2 = (match.group(2) or '').strip()
        bet = (match.group(3) or '').strip()
        odds = (match.group(4) or '').strip()

        pick = ''
        if team1 and team2:
            pick = f"{team1} vs {team2} - {bet}"
        elif team1:
            pick = f"{team1} {bet}"
        else:
            pick = bet

        if odds:
            pick = f"{pick} @ {odds}"

        if pick.strip():
            segments.append(pick.strip())

    # Fallback patterns (team ML, vs BTTS, generic odds with bet keyword)
    if not segments:
        fallback_patterns = [
            r'([A-Z][A-Za-z\s]+?)\s+ML(?:\s*@\s*([\d.]+))?',
            r'([A-Z][A-Za-z\s]+?)\s+(?:vs?\.?|v)\s+([A-Z][A-Za-z\s]+?)\s*[-–]\s*([A-Za-z\s]+?)(?:\s*@\s*([\d.]+))?',
            r'(?:Over|Under)\s+[+\-]?[\d.]+(?:\s+goals?)?',
        ]

        for pattern in fallback_patterns:
            for match in re.finditer(pattern, line, re.IGNORECASE):
                parts = [g for g in match.groups() if g]
                pick = ' '.join(parts).strip()
                if pick:
                    segments.append(pick)

    # Deduplicate while preserving order
    seen = set()
    unique_segments = []
    for seg in segments:
        if seg not in seen:
            seen.add(seg)
            unique_segments.append(seg)

    return unique_segments


def load_comments() -> List[Dict[str, Any]]:
    if not COMMENTS_PATH.exists():
        return []

    with COMMENTS_PATH.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)

    listings = raw if isinstance(raw, list) else [raw]
    comments: List[Dict[str, Any]] = []

    for listing in listings:
        comments.extend(_parse_listing(listing))

    return comments


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/comments")
def api_comments():
    try:
        comments = load_comments()
    except (OSError, json.JSONDecodeError):
        abort(500, description="Unable to read comments.json")

    return jsonify({"comments": comments})


def background_scraper():
    """Background thread that scrapes Reddit every 2 minutes."""
    while True:
        try:
            print("[Auto-scraper] Fetching latest comments from Reddit...")
            if scrape_reddit():
                print("[Auto-scraper] Comments updated successfully")
            else:
                print("[Auto-scraper] Failed to update comments")
        except Exception as e:
            print(f"[Auto-scraper] Error: {e}")
        
        # Wait 2 minutes (120 seconds)
        time.sleep(120)


if __name__ == "__main__":
    # Start background scraper thread
    scraper_thread = threading.Thread(target=background_scraper, daemon=True)
    scraper_thread.start()
    print("[Flask] Background scraper started (refreshes every 2 minutes)")
    
    app.run(debug=True)
