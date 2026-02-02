
import requests
import json

url = "http://localhost:5000/api/audio/unified-recommendations"

payload = {
  "source": "search_component",
  "current_product_id": "db-6",
  "preview_url": "https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%E2%80%99s%20Awakening.wav?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260202T203036Z&X-Amz-SignedHeaders=host&X-Amz-Expires=3600&X-Amz-Credential=AKIA35JZMVQNDQ3HS7X6%2F20260202%2Feu-west-1%2Fs3%2Faws4_request&X-Amz-Signature=d9c6dd1ceb3d7b215c5e697471d763e2e0d557bd973c97b2adb2e1869f23870a",
  "audio_features": {
    "tempo": 86,
    "energy": 0.064,
    "valence": 0.14,
    "danceability": 0.249,
    "acousticness": 1,
    "effective_tempo": 86,
    "playback_rate": 1
  },
  "limit": 5,
  "candidates": [
    {
      "trackId": "db-4",
      "trackName": "Ted Chilling",
      "artistName": "Unknown Artist",
      "collectionName": "Ted Chilling",
      "artworkUrl100": "https://game-and-music-files.s3.eu-west-1.amazonaws.com/cloud-animation.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260202T203036Z&X-Amz-SignedHeaders=host&X-Amz-Expires=3600&X-Amz-Credential=AKIA35JZMVQNDQ3HS7X6%2F20260202%2Feu-west-1%2Fs3%2Faws4_request&X-Amz-Signature=add2a83d525d611ebf69edb0cd7cd81205666547eadbe29be586c9e448aa1ec0",
      "previewUrl": "https://game-and-music-files.s3.eu-west-1.amazonaws.com/songs/Ted%20Chilling.wav?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260202T203036Z&X-Amz-SignedHeaders=host&X-Amz-Expires=3600&X-Amz-Credential=AKIA35JZMVQNDQ3HS7X6%2F20260202%2Feu-west-1%2Fs3%2Faws4_request&X-Amz-Signature=596fd2ccc194ecace1405252266cae298f43ff1d69d2cbadc9de82454dd6ab69",
      "trackPrice": 1.29,
      "primaryGenreName": "Electronic",
      "trackTimeMillis": None
    },
    {
      "trackId": 281116033,
      "trackName": "Telephasic Workshop",
      "artistName": "Boards of Canada",
      "collectionName": "Music Has the Right to Children",
      "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Features125/v4/b5/4c/c2/b54cc20d-03f5-f2c4-4a0d-9b51ad65af89/dj.txuslqgv.jpg/100x100bb.jpg",
      "previewUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/34/42/48/34424847-6456-c1c7-36d6-cdd5c3346c59/mzaf_11947430325803537898.plus.aac.p.m4a",
      "trackPrice": 0.99,
      "primaryGenreName": "Electronic",
      "trackTimeMillis": 395480
    }
  ]
}

try:
    response = requests.post(url, json=payload, headers={'Content-Type': 'application/json'})
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
