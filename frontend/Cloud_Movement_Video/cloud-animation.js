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
                
                // Create clean background (ground + sky gradient, no clouds)
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
        
        // Draw original image
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Find the horizon line (where green starts)
        let horizonY = canvas.height;
        for (let y = canvas.height - 1; y >= 0; y--) {
            let greenCount = 0;
            for (let x = 0; x < canvas.width; x += 10) {
                const i = (y * canvas.width + x) * 4;
                const r = data[i], g = data[i+1], b = data[i+2];
                if (g > r && g > b * 0.9) greenCount++;
            }
            if (greenCount < canvas.width / 30) {
                horizonY = y;
                break;
            }
        }
        
        console.log('Detected horizon at y:', horizonY, '/', canvas.height);
        
        // Replace everything above horizon with sky gradient
        for (let y = 0; y < horizonY; y++) {
            // Calculate gradient (0 at horizon, 1 at top)
            const t = 1 - (y / horizonY);
            
            // Sky gradient colors
            const r = Math.floor(135 + (64 - 135) * t);  // 135 -> 64
            const g = Math.floor(184 + (120 - 184) * t); // 184 -> 120
            const b = Math.floor(235 + (210 - 235) * t); // 235 -> 210
            
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        
        console.log('Clean background created');
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
        // Shader that scrolls the texture and only shows bright cloud pixels
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uOffset: { value: 0 },
                uHorizon: { value: 0.38 } // Normalized horizon position
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
                    
                    // Calculate "whiteness" - clouds are white (r≈g≈b and bright)
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
