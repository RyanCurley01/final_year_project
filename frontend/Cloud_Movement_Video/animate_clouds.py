from moviepy import VideoClip
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
import os
from scipy import ndimage
import cv2

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

# === DETECT CLOUDS BASED ON COLOR ===
def create_cloud_mask(img_array, threshold_brightness=0.65, threshold_saturation=0.3):
    """
    Create a mask that identifies cloud pixels with better detection.
    """
    img_float = img_array.astype(np.float32) / 255.0
    r, g, b = img_float[:,:,0], img_float[:,:,1], img_float[:,:,2]
    
    # Calculate brightness
    brightness = (r + g + b) / 3.0
    
    # Calculate saturation
    max_rgb = np.maximum(np.maximum(r, g), b)
    min_rgb = np.minimum(np.minimum(r, g), b)
    saturation = max_rgb - min_rgb
    
    # Sky region - only top portion
    sky_end = int(size[1] * 0.42)
    sky_region = np.zeros_like(brightness)
    sky_region[:sky_end, :] = 1.0
    
    # Cloud detection: bright and low saturation in sky region
    cloud_mask = (
        (brightness > threshold_brightness) &
        (saturation < threshold_saturation) &
        (sky_region > 0)
    ).astype(np.float32)
    
    # Clean up the mask with morphological operations
    kernel = np.ones((5, 5), np.uint8)
    cloud_mask = cv2.morphologyEx(cloud_mask, cv2.MORPH_CLOSE, kernel)
    cloud_mask = cv2.morphologyEx(cloud_mask, cv2.MORPH_OPEN, kernel)
    
    # Smooth edges
    cloud_mask = ndimage.gaussian_filter(cloud_mask, sigma=4)
    cloud_mask = np.clip(cloud_mask, 0, 1)
    
    return cloud_mask

print("Creating cloud mask...")
cloud_mask = create_cloud_mask(img_array)

# === GET SKY COLORS AT DIFFERENT HEIGHTS (gradient) ===
def get_sky_gradient(img_array, cloud_mask):
    """
    Sample sky colors at different heights to create a gradient.
    """
    sky_end = int(size[1] * 0.42)
    img_float = img_array.astype(np.float32)
    
    # Find non-cloud sky pixels
    r, g, b = img_float[:,:,0]/255, img_float[:,:,1]/255, img_float[:,:,2]/255
    brightness = (r + g + b) / 3.0
    
    is_sky = (cloud_mask < 0.3) & (brightness < 0.8) & (brightness > 0.2)
    
    # Sample at different heights
    sky_colors = []
    for y in range(0, sky_end, 20):
        row_mask = is_sky[y:y+20, :]
        if np.sum(row_mask) > 50:
            sky_r = np.median(img_array[y:y+20, :, 0][row_mask[...]])
            sky_g = np.median(img_array[y:y+20, :, 1][row_mask[...]])
            sky_b = np.median(img_array[y:y+20, :, 2][row_mask[...]])
            sky_colors.append((y + 10, [sky_r, sky_g, sky_b]))
    
    if len(sky_colors) < 2:
        # Fallback
        return np.array([75, 145, 250]), np.array([130, 190, 255])
    
    top_color = np.array(sky_colors[0][1])
    bottom_color = np.array(sky_colors[-1][1])
    
    return top_color, bottom_color

print("Analyzing sky gradient...")
sky_top, sky_bottom = get_sky_gradient(img_array, cloud_mask)
print(f"Sky gradient: top={sky_top.astype(int)}, bottom={sky_bottom.astype(int)}")

# === CREATE CLOUD-FREE BASE WITH GRADIENT SKY ===
def create_cloud_free_base_with_inpaint(img_array, cloud_mask, sky_top, sky_bottom):
    """
    Use OpenCV inpainting to remove clouds and fill with plausible sky.
    """
    sky_end = int(size[1] * 0.42)
    base = img_array.copy()
    
    # Create inpainting mask (dilated cloud mask)
    inpaint_mask = (cloud_mask > 0.2).astype(np.uint8) * 255
    inpaint_mask = cv2.dilate(inpaint_mask, np.ones((7, 7), np.uint8), iterations=2)
    
    # Only inpaint in sky region
    inpaint_mask[sky_end:, :] = 0
    
    # Use OpenCV inpainting (Telea algorithm works well for sky)
    if np.sum(inpaint_mask) > 0:
        # First, create a sky gradient base to help inpainting
        for y in range(sky_end):
            t = y / sky_end
            sky_color = (1 - t) * sky_top + t * sky_bottom
            # Only fill where there are clouds
            for x in range(size[0]):
                if inpaint_mask[y, x] > 0:
                    base[y, x] = sky_color.astype(np.uint8)
        
        # Now smooth the transitions using inpainting on the edges
        edge_mask = cv2.Canny(inpaint_mask, 50, 150)
        edge_mask = cv2.dilate(edge_mask, np.ones((5, 5), np.uint8), iterations=1)
        
        base = cv2.inpaint(base, edge_mask, inpaintRadius=5, flags=cv2.INPAINT_TELEA)
    
    return base

print("Creating cloud-free base with inpainting...")
cloud_free_base = create_cloud_free_base_with_inpaint(img_array, cloud_mask, sky_top, sky_bottom)

# === CREATE DOUBLE-WIDTH SEAMLESS CLOUD LAYER ===
def create_seamless_cloud_layer(img_array, cloud_mask, cloud_free_base):
    """
    Create a double-width cloud layer that tiles seamlessly.
    The clouds blend smoothly at the seam.
    """
    h, w = img_array.shape[:2]
    
    # Extract cloud pixels (difference from cloud-free base)
    cloud_only = img_array.astype(np.float32)
    
    # Create double-width arrays
    double_clouds = np.zeros((h, w * 2, 3), dtype=np.float32)
    double_mask = np.zeros((h, w * 2), dtype=np.float32)
    
    # Place original on left half
    double_clouds[:, :w, :] = cloud_only
    double_mask[:, :w] = cloud_mask
    
    # Place copy on right half
    double_clouds[:, w:, :] = cloud_only
    double_mask[:, w:] = cloud_mask
    
    # Blend the seam in the middle
    blend_width = 200
    seam_start = w - blend_width // 2
    seam_end = w + blend_width // 2
    
    for i, x in enumerate(range(seam_start, seam_end)):
        alpha = i / blend_width
        # Blend clouds
        left_x = x % w
        right_x = (x + blend_width) % w
        double_clouds[:, x, :] = (1 - alpha) * cloud_only[:, left_x, :] + alpha * cloud_only[:, right_x, :]
        double_mask[:, x] = (1 - alpha) * cloud_mask[:, left_x] + alpha * cloud_mask[:, right_x]
    
    return double_clouds, double_mask

print("Creating seamless cloud layer...")
cloud_layer_double, cloud_mask_double = create_seamless_cloud_layer(img_array, cloud_mask, cloud_free_base)

# Expand mask for compositing
cloud_mask_double_3d = np.expand_dims(cloud_mask_double, axis=2)

# === FUNCTION TO SHIFT ONLY CLOUDS ===
def make_frame(t):
    h, w = size
    # Speed: shift clouds 12 pixels per second to the left
    shift = int((t * 12) % w)
    
    # Extract the visible window from the double-width layer
    shifted_clouds = cloud_layer_double[:, shift:shift + w, :]
    shifted_mask = cloud_mask_double_3d[:, shift:shift + w, :]
    
    # Composite: cloud-free base + shifted clouds
    frame = (
        shifted_mask * shifted_clouds +
        (1 - shifted_mask) * cloud_free_base.astype(np.float32)
    ).astype(np.uint8)
    
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
