/**
 * Cloud Animation using Three.js
 * Simpler approach: Static background with scrolling cloud overlay
 * Uses "lighten" blend mode to only show clouds (bright pixels) over the sky
 */

class CloudAnimator {
    constructor(containerId, imagePath) {
        this.container = document.getElementById(containerId);
        this.imagePath = imagePath;
        this.cloudMesh = null;
        this.clock = new THREE.Clock();
        this.cloudSpeed = 0.015; // Speed of cloud movement
        
        this.init();
    }

    async init() {
        // Set up Three.js scene
        this.scene = new THREE.Scene();
        
        // Get container dimensions
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;
        
        // Set up orthographic camera for 2D-like rendering
        this.camera = new THREE.OrthographicCamera(
            -width / 2, width / 2,
            height / 2, -height / 2,
            0.1, 1000
        );
        this.camera.position.z = 10;

        // Set up renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        console.log('Renderer created, size:', width, 'x', height);

        // Load the image and create layers
        await this.loadAndProcessImage();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Start animation loop
        this.animate();
    }

    async loadAndProcessImage() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                console.log('Image loaded:', img.width, 'x', img.height);
                
                const containerWidth = this.container.clientWidth || window.innerWidth;
                const containerHeight = this.container.clientHeight || window.innerHeight;
                
                const imgAspect = img.width / img.height;
                const containerAspect = containerWidth / containerHeight;
                
                let planeWidth, planeHeight;
                if (containerAspect > imgAspect) {
                    planeWidth = containerWidth;
                    planeHeight = containerWidth / imgAspect;
                } else {
                    planeHeight = containerHeight;
                    planeWidth = containerHeight * imgAspect;
                }
                
                // Create clean background (sky gradient only)
                const bgTexture = this.createCleanBackground(img);
                this.createBackgroundLayer(bgTexture, planeWidth, planeHeight);
                
                // Create scrolling clouds layer
                const cloudTexture = new THREE.Texture(img);
                cloudTexture.wrapS = THREE.RepeatWrapping;
                cloudTexture.wrapT = THREE.ClampToEdgeWrapping;
                cloudTexture.minFilter = THREE.LinearFilter;
                cloudTexture.magFilter = THREE.LinearFilter;
                cloudTexture.needsUpdate = true;
                
                this.createCloudLayer(cloudTexture, planeWidth, planeHeight);
                
                // Create grass overlay layer (on top of clouds, hides mountains)
                const grassTexture = new THREE.Texture(img);
                grassTexture.minFilter = THREE.LinearFilter;
                grassTexture.magFilter = THREE.LinearFilter;
                grassTexture.needsUpdate = true;
                
                this.createGrassLayer(grassTexture, planeWidth, planeHeight);
                
                resolve();
            };
            
            img.onerror = (err) => {
                console.error('Failed to load image:', err);
                reject(err);
            };
            
            img.src = this.imagePath;
        });
    }

    createCleanBackground(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw original image first
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Use a fixed horizon ratio for sky gradient
        // This is where we cut off the sky in the background
        const horizonRatio = 0.75;
        const horizonY = Math.floor(canvas.height * horizonRatio);
        
        // Grass ratio - how much of the image height the grass layer covers
        // 0.66 = grass layer extends to match the exact height in the reference
        this.grassRatio = 0.66; // Fixed grass height matching the screenshot
        
        console.log('Using horizon at y:', horizonY, '/', canvas.height);
        
        // Replace EVERYTHING above horizon with sky gradient - no exceptions
        for (let y = 0; y < horizonY; y++) {
            // Calculate gradient (0 at top, 1 at horizon)
            const t = y / horizonY;
            
            // Sky gradient colors (top = darker blue, horizon = lighter blue)
            const r = Math.floor(64 + (135 - 64) * t);   // 64 -> 135
            const g = Math.floor(120 + (184 - 120) * t); // 120 -> 184
            const b = Math.floor(210 + (235 - 210) * t); // 210 -> 235
            
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
                // Alpha stays 255
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        
        // Store horizon ratio for cloud layer
        this.horizonRatio = horizonRatio;
        
        console.log('Clean background created with pure sky gradient');
        return texture;
    }

    createBackgroundLayer(texture, width, height) {
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const geometry = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = 0;
        this.scene.add(mesh);
        console.log('Background layer added');
    }

    createCloudLayer(texture, width, height) {
        // Use the horizon ratio from background processing
        const horizonUv = 1.0 - (this.horizonRatio || 0.62); // Convert to UV space (flipped)
        
        // Shader that scrolls the texture and only shows bright cloud pixels
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uOffset: { value: 0 },
                uHorizon: { value: horizonUv }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                uniform float uOffset;
                uniform float uHorizon;
                varying vec2 vUv;
                
                void main() {
                    // Don't render below horizon
                    if (vUv.y < uHorizon) {
                        discard;
                    }
                    
                    // Scroll the texture horizontally
                    vec2 scrolledUv = vec2(fract(vUv.x + uOffset), vUv.y);
                    vec4 texColor = texture2D(uTexture, scrolledUv);
                    
                    // Calculate brightness
                    float brightness = (texColor.r + texColor.g + texColor.b) / 3.0;
                    
                    // Calculate saturation - clouds are low saturation (whitish)
                    float maxC = max(max(texColor.r, texColor.g), texColor.b);
                    float minC = min(min(texColor.r, texColor.g), texColor.b);
                    float saturation = (maxC - minC) / (maxC + 0.001);
                    
                    // Cloud mask: bright + low saturation = white cloud
                    float cloudMask = smoothstep(0.55, 0.70, brightness) * (1.0 - smoothstep(0.0, 0.35, saturation));
                    
                    // Also catch very bright pixels
                    cloudMask = max(cloudMask, smoothstep(0.72, 0.82, brightness));
                    
                    // Fade at edges to hide seam
                    float edgeFade = smoothstep(0.0, 0.08, scrolledUv.x) * smoothstep(1.0, 0.92, scrolledUv.x);
                    cloudMask *= edgeFade;
                    
                    // Fade near horizon
                    float horizonFade = smoothstep(uHorizon, uHorizon + 0.12, vUv.y);
                    cloudMask *= horizonFade;
                    
                    gl_FragColor = vec4(texColor.rgb, cloudMask);
                }
            `,
            transparent: true,
            depthWrite: false
        });
        
        const geometry = new THREE.PlaneGeometry(width, height);
        this.cloudMesh = new THREE.Mesh(geometry, material);
        this.cloudMesh.position.z = 1;
        this.scene.add(this.cloudMesh);
        console.log('Cloud layer added');
    }

    createGrassLayer(texture, width, height) {
        // This layer duplicates the grass from the bottom of the original image
        // and tiles it upward to cover the mountains in both original and scrolling images
        const grassCutoff = 1.0 - (this.grassRatio || 0.5); // Convert to UV space (0.5 = halfway up)
        
        // The original grass in the image is in the bottom ~15% (UV 0 to 0.15)
        // We sample from within this area, avoiding the very edge to prevent seams
        const originalGrassHeight = 0.12; // Height of original grass area to sample from
        const grassOffset = 0.02; // Offset from bottom to avoid edge artifacts
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uGrassCutoff: { value: grassCutoff },
                uOriginalGrassHeight: { value: originalGrassHeight },
                uGrassOffset: { value: grassOffset }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                uniform float uGrassCutoff;
                uniform float uOriginalGrassHeight;
                uniform float uGrassOffset;
                varying vec2 vUv;
                
                void main() {
                    // Only render below grass cutoff line (bottom half of image)
                    if (vUv.y > uGrassCutoff) {
                        discard;
                    }
                    
                    // Sample from the original grass area at the bottom
                    // Use a mirrored/ping-pong pattern to avoid seams when tiling
                    float normalizedY = vUv.y / uOriginalGrassHeight;
                    float tileIndex = floor(normalizedY);
                    float withinTile = fract(normalizedY);
                    
                    // Mirror every other tile to hide seams
                    if (mod(tileIndex, 2.0) >= 1.0) {
                        withinTile = 1.0 - withinTile;
                    }
                    
                    // Map back to the grass sample area, with offset to avoid bottom edge
                    float sampleY = uGrassOffset + withinTile * uOriginalGrassHeight;
                    vec2 grassUv = vec2(vUv.x, sampleY);
                    
                    vec4 texColor = texture2D(uTexture, grassUv);
                    
                    // Full opacity for the duplicated grass
                    float alpha = 1.0;
                    
                    // Add dark border line at the top of grass (like YouTube reference)
                    float borderWidth = 0.008;
                    float borderStart = uGrassCutoff - borderWidth;
                    if (vUv.y > borderStart && vUv.y <= uGrassCutoff) {
                        // Dark green/black border line
                        float borderBlend = smoothstep(borderStart, uGrassCutoff, vUv.y);
                        vec3 borderColor = vec3(0.05, 0.15, 0.05); // Dark green border
                        texColor.rgb = mix(texColor.rgb, borderColor, borderBlend * 0.9);
                    }
                    
                    // Very slight fade at top edge for smoother transition
                    float edgeFade = smoothstep(uGrassCutoff, uGrassCutoff - 0.02, vUv.y);
                    alpha *= edgeFade;
                    
                    gl_FragColor = vec4(texColor.rgb, alpha);
                }
            `,
            transparent: true,
            depthWrite: false
        });
        
        const geometry = new THREE.PlaneGeometry(width, height);
        this.grassMesh = new THREE.Mesh(geometry, material);
        this.grassMesh.position.z = 2; // On top of clouds
        this.scene.add(this.grassMesh);
        console.log('Grass layer added - duplicating bottom grass up to UV:', grassCutoff);
    }

    onWindowResize() {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        this.camera.left = -width / 2;
        this.camera.right = width / 2;
        this.camera.top = height / 2;
        this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const elapsed = this.clock.getElapsedTime();
        
        // Update cloud scroll offset
        if (this.cloudMesh) {
            this.cloudMesh.material.uniforms.uOffset.value = elapsed * this.cloudSpeed;
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    setCloudSpeed(speed) {
        this.cloudSpeed = speed;
    }

    setGrassRatio(ratio) {
        this.grassRatio = ratio;
        // Update the grass layer shader uniform if it exists
        if (this.grassMesh) {
            this.grassMesh.material.uniforms.uGrassCutoff.value = 1.0 - ratio;
        }
    }

    dispose() {
        this.renderer.dispose();
        this.scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (object.material.map) object.material.map.dispose();
                if (object.material.uniforms?.uTexture) {
                    object.material.uniforms.uTexture.value.dispose();
                }
                object.material.dispose();
            }
        });
        this.container.removeChild(this.renderer.domElement);
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CloudAnimator;
}
