/**
 * Sky Segmentation using TensorFlow.js
 * Detects and segments sky regions in video frames
 */

import * as tf from '@tensorflow/tfjs';

class SkySegmentation {
  constructor() {
    this.model = null;
    this.isInitialized = false;
  }
  
  /**
   * Initialize TensorFlow.js and load model
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Set backend (WebGL is faster for image processing)
      await tf.setBackend('webgl');
      await tf.ready();
      
      this.isInitialized = true;
      console.log('Sky segmentation initialized');
    } catch (error) {
      console.error('Failed to initialize TensorFlow.js:', error);
      throw error;
    }
  }
  
  /**
   * Simple sky detection using color and position heuristics
   * Sky typically: blue/cyan colors, upper portion of image
   */
  detectSky(videoElement, width, height) {
    return tf.tidy(() => {
      // Convert video frame directly to tensor
      const imageTensor = tf.browser.fromPixels(videoElement);
      
      // Normalize to [0, 1]
      const normalized = imageTensor.div(255.0);
      
      // Extract RGB channels
      const [r, g, b] = tf.split(normalized, 3, 2);
      
      // Sky detection heuristics:
      // 1. Blue channel is high
      // 2. Blue > Red (more blue than red for sky)
      // 3. Upper portion of image (position-based weight)
      
      // Color-based detection
      const blueStrength = b.squeeze();
      const blueOverRed = b.sub(r).squeeze();
      
      // Position-based weight (top of image = more likely sky)
      const yCoords = tf.linspace(0, 1, height).expandDims(1).tile([1, width]);
      const positionWeight = tf.scalar(1.0).sub(yCoords); // 1 at top, 0 at bottom
      
      // Combine factors with stricter weights
      let skyMask = blueStrength
        .mul(2.0)
        .add(blueOverRed.mul(7.0))
        .add(positionWeight.mul(4.5));
      
      // Threshold and normalize
      skyMask = skyMask.clipByValue(0, 1);
      
      // Apply lower threshold for more visible effect
      const threshold = 1.2; // Lowered from 1.8 to detect more sky
      skyMask = skyMask.greater(threshold).toFloat();
      
      return skyMask;
    });
  }
  
  /**
   * Apply color filter to sky regions
   */
  applySkyColor(videoElement, skyMask, color) {
    return tf.tidy(() => {
      const imageTensor = tf.browser.fromPixels(videoElement);
      const normalized = imageTensor.div(255.0);
      
      // Create color overlay tensor
      const [r, g, b] = color;
      const colorTensor = tf.stack([
        tf.fill([skyMask.shape[0], skyMask.shape[1]], r / 255.0),
        tf.fill([skyMask.shape[0], skyMask.shape[1]], g / 255.0),
        tf.fill([skyMask.shape[0], skyMask.shape[1]], b / 255.0)
      ], 2);
      
      // Expand mask to 3 channels
      const maskExpanded = tf.stack([skyMask, skyMask, skyMask], 2);
      
      // Blend original image with colored sky
      const blendFactor = 0.6; // Increased from 0.3 for more visible effect
      const blended = normalized
        .mul(tf.scalar(1.0).sub(maskExpanded.mul(blendFactor)))
        .add(colorTensor.mul(maskExpanded.mul(blendFactor)));
      
      // Return normalized tensor [0, 1] for tf.browser.toPixels
      return blended;
    });
  }
  
  /**
   * Process video frame with sky color change (detects blue sky, excludes clouds)
   */
  async processFrame(videoElement, canvas, color) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;
    
    if (width === 0 || height === 0) return;
    
    // Set canvas size to match video
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    
    // Draw video frame to canvas
    ctx.drawImage(videoElement, 0, 0, width, height);
    
    // Get pixel data for sky detection
    // Wrap in try-catch for CORS errors
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (e) {
      // CORS error - canvas is tainted, just show the video without processing
      return;
    }
    const data = imageData.data;
    
    // Create overlay for sky pixels only
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Detect blue sky pixels (excluding white/gray clouds)
      // Balanced detection - not too strict, not too loose
      
      const isBlueDominant = b > r && b > g;
      const blueStrength = b - Math.max(r, g); // How much more blue than others
      const brightness = (r + g + b) / 3;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      
      // Balanced cloud filtering:
      // - Allow brighter sky (higher brightness threshold)
      // - Still require some saturation (clouds are white/gray)
      // - Blue must be dominant but not extremely so
      const isNotTooWhite = brightness < 210; // Allow lighter sky, exclude very bright clouds
      const hasSomeSaturation = saturation > 40; // Clouds are desaturated (white/gray)
      const hasGoodBlue = blueStrength > 25; // Blue should be noticeably higher
      
      // Basic checks:
      const redIsReasonable = r < 200; // Not too red (clouds are whiter)
      const greenIsReasonable = g < 210; // Not too green
      const isBlueish = b > 100 && b > r * 1.15 && b > g * 1.1; // Blue 15% higher than red
      
      // Check if this pixel is blue sky (not cloud)
      const isSky = isBlueDominant && hasGoodBlue && isNotTooWhite && hasSomeSaturation && 
                    redIsReasonable && greenIsReasonable && isBlueish;
      
      if (isSky) {
        // Blend the sky pixel with the target color
        const blendFactor = 0.6;
        data[i] = Math.round(r * (1 - blendFactor) + color[0] * blendFactor);
        data[i + 1] = Math.round(g * (1 - blendFactor) + color[1] * blendFactor);
        data[i + 2] = Math.round(b * (1 - blendFactor) + color[2] * blendFactor);
      }
    }
    
    // Put the modified image data back
    ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Cleanup resources
   */
  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.isInitialized = false;
  }
}

export default SkySegmentation;
