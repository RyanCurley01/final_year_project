import requests

urls = [
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/3d/4c/8d/3d4c8dc2-0e76-1cba-4d67-c80bb12065ad/mzaf_17967237549396325518.plus.aac.p.m4a",
    "http://some-fake-url.com/a.m4a"
]

for u in urls:
    try:
        r = requests.head(u, allow_redirects=True, timeout=5)
        print(f"{u} -> {r.status_code}")
    except Exception as e:
        print(f"{u} -> ERROR: {e}")
