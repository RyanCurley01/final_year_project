/**
 * Downloads a file from a URL by creating a temporary anchor element
 * @param {string} url - The file URL to download
 * @param {string} filename - The filename to save as
 */
export const downloadFile = (url, filename) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'download';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  
  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Downloads multiple files sequentially with a delay between each
 * @param {Array} files - Array of {url, filename} objects
 * @param {number} delay - Delay in milliseconds between downloads (default 500ms)
 */
export const downloadMultipleFiles = async (files, delay = 500) => {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    downloadFile(file.url, file.filename);
    
    // Add delay between downloads to prevent browser blocking
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Extracts filename from URL or generates one based on product info
 * @param {Object} product - Product object with title and file info
 * @param {string} url - File URL
 * @returns {string} - Generated filename
 */
export const generateFilename = (product, url) => {
  const productName = product.albumTitle;
  
  // Try to extract extension from URL
  let extension = '';
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot !== -1) {
      extension = pathname.substring(lastDot);
    }
  } catch (e) {
    // If URL parsing fails, default extension
    extension = '.wav';
  }
  
  // Sanitize filename
  const sanitized = productName
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
  
  return `${sanitized}${extension}`;
};
