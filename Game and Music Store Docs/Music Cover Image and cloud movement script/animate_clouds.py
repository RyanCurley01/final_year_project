from moviepy import VideoClip
import numpy as np
from PIL import Image
import os

# === CONFIGURATION ===
script_dir = os.path.dirname(os.path.abspath(__file__))
input_image = os.path.join(script_dir, "Windows Xp Cover Image.webp")
output_video = os.path.join(script_dir, "album_cover_animated.mp4")
duration = 60  # 60 seconds (loops seamlessly)
size = (1024, 1024)  # square output

# === LOAD IMAGE ===
print(f"Loading image: {input_image}")
img = Image.open(input_image).convert("RGB")
img = img.resize(size, Image.LANCZOS)
img_array = np.array(img)

# === CREATE SKY MASK ===
# Only the top ~40% of the image (sky/clouds) should move
# The bottom 60% (grass/ground) stays completely static
sky_end = int(size[1] * 0.4)  # Sky ends at 40% from top
transition_zone = int(size[1] * 0.1)  # 10% transition for smooth blend

mask = np.zeros(size[1])
# Top portion: fully animated (1.0)
mask[:sky_end] = 1.0
# Transition zone: gradient from 1.0 to 0.0
if transition_zone > 0:
    mask[sky_end:sky_end + transition_zone] = np.linspace(1, 0, transition_zone)
# Bottom portion: static (0.0) - already zeros

mask = np.tile(mask, (size[0], 1)).T  # shape (H, W)
mask = np.expand_dims(mask, axis=2)  # shape (H, W, 1)

# === FUNCTION TO SHIFT CLOUDS ===
def make_frame(t):
    # Speed: shift 20 pixels per second to the left (visible effect)
    shift = int((t * 20) % size[0])
    shifted = np.roll(img_array, -shift, axis=1)

    # Blend sky (shifted) and ground (original)
    frame = (mask * shifted + (1 - mask) * img_array).astype(np.uint8)
    return frame

# === CREATE VIDEO CLIP ===
print("Creating video clip...")
clip = VideoClip(make_frame, duration=duration)

# === EXPORT ===
print(f"Exporting video to: {output_video}")
clip.write_videofile(
    output_video,
    fps=24,
    codec="libx264",
    audio=False,
    preset="medium",
    bitrate="2000k"
)
print(f"Video created successfully: {output_video}")
