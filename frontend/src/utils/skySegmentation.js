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
   * Process video frame with sky color change
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
    
    // First, draw the video frame to canvas
    ctx.drawImage(videoElement, 0, 0, width, height);
    
    // Simple color overlay on top portion (simplified sky effect)
    const skyHeight = Math.floor(height * 0.4); // Top 40% of image
    
    // Create gradient from color to transparent
    const gradient = ctx.createLinearGradient(0, 0, 0, skyHeight);
    gradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.5)`);
    gradient.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
    
    // Apply the gradient overlay
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, skyHeight);
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
