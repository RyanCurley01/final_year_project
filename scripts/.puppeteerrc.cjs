const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Don't download Chrome during npm install
  skipDownload: true,
  
  // Use the system-installed Chrome
  executablePath: '/usr/bin/google-chrome-stable',
  
  // Cache path (optional, but good to specify)
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
