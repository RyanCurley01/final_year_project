#!/usr/bin/env node
/**
 * Record Cloud Animation as Video
 * 
 * This script uses Puppeteer to record the Three.js cloud animation
 * and saves it as an MP4 video file that can be uploaded to AWS S3.
 * 
 * Requirements:
 * - Node.js
 * - npm install puppeteer @puppeteer/browsers
 * - ffmpeg (for video encoding)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
    width: 960,         // Lower resolution for faster capture (still HD)
    height: 540,
    duration: 30,        // 60 seconds (1 minute) for realistic cloud movement
    fps: 30,             // 30fps for smoother animation
    outputDir: path.join(__dirname, 'recorded_videos'),
    outputFilename: 'cloud-animation.mp4',
    framesDir: path.join(__dirname, 'temp_frames'),
    loopDuration: 30000, // Animation loop duration in ms (60 seconds = 60,000ms)
};

async function recordAnimation() {
    console.log('🎬 Starting Cloud Animation Recording...\n');

    // Create output directories
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    if (!fs.existsSync(CONFIG.framesDir)) {
        fs.mkdirSync(CONFIG.framesDir, { recursive: true });
    }

    // Clean up any existing frames
    const existingFrames = fs.readdirSync(CONFIG.framesDir);
    for (const frame of existingFrames) {
        fs.unlinkSync(path.join(CONFIG.framesDir, frame));
    }

    // Launch browser
    console.log('📦 Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--window-size=${CONFIG.width},${CONFIG.height}`,
            '--disable-web-security',
            '--allow-file-access-from-files',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({
        width: CONFIG.width,
        height: CONFIG.height,
        deviceScaleFactor: 1
    });

    // Load the cloud animation HTML page
    const htmlPath = path.join(__dirname, '..', 'frontend', 'Cloud_Movement_Video', 'index.html');
    console.log(`📂 Loading: ${htmlPath}`);
    
    // Use 'load' instead of 'networkidle0' since Three.js animation keeps running
    await page.goto(`file://${htmlPath}`, {
        waitUntil: 'load',
        timeout: 60000
    });

    // Wait for the animation to initialize (Three.js needs time to set up)
    console.log('⏳ Waiting for animation to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Calculate total frames
    const totalFrames = CONFIG.duration * CONFIG.fps;
    const frameDelay = 1000 / CONFIG.fps; // Time between frames in ms
    
    console.log(`🎥 Recording ${totalFrames} frames (${CONFIG.duration}s at ${CONFIG.fps}fps)...\n`);
    console.log(`   ⏱️  Frame interval: ${frameDelay.toFixed(2)}ms\n`);

    const startTime = Date.now();
    
    // Record frames by just capturing at regular intervals - let the animation loop naturally
    for (let i = 0; i < totalFrames; i++) {
        const framePath = path.join(CONFIG.framesDir, `frame_${String(i).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });
        
        // Wait for next frame timing
        await new Promise(resolve => setTimeout(resolve, frameDelay));
        
        // Progress indicator every 30 frames (1 second of video)
        if (i % CONFIG.fps === 0) {
            const seconds = i / CONFIG.fps;
            const progress = ((i / totalFrames) * 100).toFixed(1);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`   📸 Frame ${i}/${totalFrames} (${progress}%) - ${seconds}s of video - elapsed: ${elapsed}s`);
        }
    }
    
    const captureTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Frame capture complete in ${captureTime}s!`);

    // Close browser
    await browser.close();

    // Encode video using ffmpeg
    const outputPath = path.join(CONFIG.outputDir, CONFIG.outputFilename);
    console.log('\n🎬 Encoding video with ffmpeg (with seamless loop settings)...');
    
    try {
        // Use high quality settings optimized for looping
        const ffmpegCmd = `ffmpeg -y -framerate ${CONFIG.fps} -i "${CONFIG.framesDir}/frame_%06d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -tune animation -movflags +faststart "${outputPath}"`;
        execSync(ffmpegCmd, { stdio: 'inherit' });
        
        console.log(`\n✅ Video saved to: ${outputPath}`);
        console.log(`🔄 Video will loop based on natural animation timing!`);
        
        // Get file size
        const stats = fs.statSync(outputPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`📊 File size: ${fileSizeMB} MB`);
        
    } catch (error) {
        console.error('❌ ffmpeg encoding failed:', error.message);
        console.log('\n💡 Make sure ffmpeg is installed: sudo apt-get install ffmpeg');
        return null;
    }

    // Clean up temp frames
    console.log('\n🧹 Cleaning up temporary frames...');
    const frames = fs.readdirSync(CONFIG.framesDir);
    for (const frame of frames) {
        fs.unlinkSync(path.join(CONFIG.framesDir, frame));
    }
    fs.rmdirSync(CONFIG.framesDir);

    console.log('\n🎉 Recording complete!');
    return outputPath;
}

// Run if called directly
if (require.main === module) {
    recordAnimation()
        .then(outputPath => {
            if (outputPath) {
                console.log(`\n📁 Output: ${outputPath}`);
                console.log('\n🚀 Next step: Run upload_cloud_animation_to_s3.py to upload to AWS S3');
            }
            process.exit(outputPath ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
}

module.exports = { recordAnimation, CONFIG };
