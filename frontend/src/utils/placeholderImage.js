/**
 * Generates a data URI for a placeholder image
 */

export const generatePlaceholderImage = (width, height, text = 'No Image') => {
  // Create a canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Fill background with gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#4a5568');
  gradient.addColorStop(1, '#2d3748');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add text
  ctx.fillStyle = '#cbd5e0';
  ctx.font = `${Math.min(width, height) / 8}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  
  // Return data URI
  return canvas.toDataURL('image/png');
};

// Pre-generated placeholder data URIs
export const placeholders = {
  small: null,
  medium: null,
  large: null,
};

// Generate placeholders on module load
if (typeof document !== 'undefined') {
  placeholders.small = generatePlaceholderImage(80, 80, 'No Image');
  placeholders.medium = generatePlaceholderImage(160, 160, 'No Image');
  placeholders.large = generatePlaceholderImage(250, 224, 'No Image');
}

export default placeholders;
