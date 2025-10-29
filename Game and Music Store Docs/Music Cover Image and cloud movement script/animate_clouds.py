from moviepy.editor import ImageClip, CompositeVideoClip, vfx
import numpy as np
from PIL import Image

# === CONFIGURATION ===
input_image = "z4AnyQN.webp"  # your uploaded image
output_video = "clouds_moving_left.mp4"
duration = 480  # 8 minutes
size = (1024, 1024)  # square output

# === LOAD IMAGE ===
img = Image.open(input_image).convert("RGB")
img = img.resize(size, Image.LANCZOS)
img_array = np.array(img)

# === CREATE SKY MASK ===
# Approximate top half (sky region) vs bottom half (grass)
mask = np.linspace(1, 0, size[1])  # gradient top→bottom
mask = np.tile(mask, (size[0], 1)).T  # shape (H, W)
mask = np.expand_dims(mask, axis=2)  # shape (H, W, 1)

# === FUNCTION TO SHIFT CLOUDS ===
def make_frame(t):
    # Speed: shift 1 pixel per second to the left
    shift = int((t * 1) % size[0])
    shifted = np.roll(img_array, -shift, axis=1)

    # Blend sky (shifted) and ground (original)
    frame = (mask * shifted + (1 - mask) * img_array).astype(np.uint8)
    return frame

# === CREATE VIDEO CLIP ===
clip = ImageClip(img_array, duration=duration).fl(make_frame, apply_to=['mask'])

# === EXPORT ===
clip.write_videofile(
    output_video,
    fps=30,
    codec="libx264",
    audio=False,
    preset="medium",
    bitrate="2000k"
)
