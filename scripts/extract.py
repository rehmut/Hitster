import os
import re
import json
import subprocess
import sys
import imageio_ffmpeg

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LINKS_FILE = os.path.join(BASE_DIR, "../links.txt")
OUTPUT_DIR = os.path.join(BASE_DIR, "../public/audio")
DATA_FILE = os.path.join(BASE_DIR, "../public/data.json")
TEMP_DIR = os.path.join(BASE_DIR, "temp_downloads")

# Ensure directories exist
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

def get_ffmpeg_path():
    try:
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        print(f"Could not find ffmpeg: {e}")
        return None

def parse_links_file(filepath):
    songs = []
    current_year = None
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Match Year Header: "### 2024 (Malmö, Sweden)"
        year_match = re.match(r"### (\d{4})", line)
        if year_match:
            current_year = year_match.group(1)
            continue
            
        # Match Song Line: "1.  Switzerland: Nemo – "The Code""
        song_match = re.match(r"\d+\.\s+([^:]+):\s+(.+) [–-] \"(.+)\"", line)
        if song_match and current_year:
            country = song_match.group(1).strip()
            artist = song_match.group(2).strip()
            title = song_match.group(3).strip()
            
            songs.append({
                "year": current_year,
                "country": country,
                "artist": artist,
                "title": title
            })
            
    return songs

def download_and_process(song, ffmpeg_path):
    query = f"{song['artist']} - {song['title']} Eurovision {song['year']}"
    print(f"Processing: {query}")
    
    safe_title = re.sub(r'[\\/*?:"<>|]', "", song['title'])
    safe_artist = re.sub(r'[\\/*?:"<>|]', "", song['artist'])
    filename_base = f"{song['year']}_{song['country']}_{safe_artist}_{safe_title}".replace(" ", "_")
    final_path = os.path.join(OUTPUT_DIR, f"{filename_base}.mp3")
    
    if os.path.exists(final_path):
        print("  Already exists, skipping.")
        return f"audio/{filename_base}.mp3"

    # yt-dlp command
    # Download section 0:45 to 1:15 (30 seconds)
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--ffmpeg-location", ffmpeg_path,
        "--extract-audio",
        "--audio-format", "mp3",
        "--download-sections", "*45-75",
        "--output", os.path.join(OUTPUT_DIR, f"{filename_base}.%(ext)s"),
        f"ytsearch1:{query}"
    ]
    
    try:
        # Run yt-dlp
        subprocess.run(cmd, check=True, capture_output=True)
        return f"audio/{filename_base}.mp3"
    except subprocess.CalledProcessError as e:
        print(f"  Download failed: {e}")
        # print(e.stderr.decode()) # Debug if needed
        return None

def main():
    ffmpeg_path = get_ffmpeg_path()
    if not ffmpeg_path:
        print("CRITICAL: ffmpeg not found.")
        return

    songs = parse_links_file(LINKS_FILE)
    print(f"Found {len(songs)} songs.")
    
    game_data = []
    
    for i, song in enumerate(songs):
        print(f"[{i+1}/{len(songs)}] {song['year']} - {song['title']}")
        audio_path = download_and_process(song, ffmpeg_path)
        
        if audio_path:
            song['audio'] = audio_path
            game_data.append(song)
            
            # Save incrementally
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(game_data, f, indent=2)
                
    print("Done!")

if __name__ == "__main__":
    main()
