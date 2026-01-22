import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// === 配置与状态 ===
const config = {
    particleCount: 15000,
    particleSize: 0.05,
    color: '#00ffff',
    colorScheme: 'single', // 'single', 'rainbow', 'gradient-y'
    shape: 'saturn'
};

const state = {
    currentScale: 1.0,
    wheelScale: 1.0,
    sliderScale: 1.0, // Scale slider value
    handScale: 1.0,
    gestureEnabled: true, // Master Switch for Hands
    gestureDetected: false,
    rotationSpeed: { x: 0, y: 0.002 }, // Base rotation
    // Hands Separation
    rightHandPosition: { x: -1, y: -1 }, // Normalized 0-1
    rightHandStatus: 'open', // 'open' or 'fist'
    rightHandOpenness: 0, // 0..1
    isRightHandDetected: false,
    selectedLabelIndex: -1, // Currently selected label by Right Hand
    lastClickTime: 0
};

// === Three.js 全局变量 ===
let scene, camera, renderer;
let particles, particleGeometry, particleMaterial;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-999, -999);

// 存储所有的“超链接粒子”对象
// 结构: { position: Vector3, element: HTMLElement, particle: THREE.Sprite, url: string, basePos: Vector3 }
let specialParticles = [];

// 流星雨全局变量
let starGeo, stars, starTrails;
const STAR_COUNT = 10000; // Increased for dense universe field

// 碰撞特效系统
let explosionGeo, explosionParticles;
const EXPLOSION_COUNT = 500;
let explosionData = []; // { velocity: Vector3, age: number, life: number }

let initialPositions = []; // 存储当前形状的目标位置
let currentPositions = []; // 存储当前粒子的实际位置（用于动画过渡）
let time = 0;

// === 初始化 ===
// 仅执行 Intro 初始化，推迟 3D 加载
initIntro();

function startMainApp() {
    if (window.isAppRunning) return;
    window.isAppRunning = true;

    console.log("Starting Main App...");
    initThree();
    initMeteorShower();
    initParticles();
    initExplosionSystem();
    initEvents();
    initMediaPipe();
    animate();
}

function initIntro() {
    // Start Camera immediately for interaction
    initMediaPipe();

    // 强制刷新或首次打开都会完全重加载页面
    // 动画流程完全由 CSS 动画 cinematicSequence 控制 (17秒)
    // 0s-2s: Black Screen
    // 2s: Subtitle Start
    // 3.5s: Title Start
    // 17s: Warp Transition

    const overlay = document.getElementById('intro-overlay');

    // 如果找不到 overlay (比如被意外移除)，直接启动
    if (!overlay) {
        startMainApp();
        return;
    }

    // Inject styles for Star Warp & Flash
    const style = document.createElement('style');
    style.textContent = `
        #star-warp-canvas {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            background: radial-gradient(circle at center, #0b0b2b 0%, #000000 100%);
            opacity: 0;
            transition: opacity 4s ease-in-out;
            cursor: crosshair;
        }
        #white-flash {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            z-index: 10001;
            opacity: 0;
            pointer-events: none;
            transition: opacity 2s ease-out; /* Smooth fade out */
        }
        .warp-hint {
            position: fixed;
            bottom: 50px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255, 255, 255, 0.5);
            font-family: 'Share Tech Mono', monospace;
            z-index: 10002;
            pointer-events: none;
            opacity: 0;
            transition: opacity 1s;
        }
    `;
    document.head.appendChild(style);

    // Audio Setup (Use global element)
    const bgm = document.getElementById('bgm-player');
    bgm.volume = 1.0;

    // Play music immediately (0s)
    // Note: Most browsers block autoplay without user interaction.
    // However, if the user has already interacted with the page, or settings allow, this will work.
    bgm.play().catch(e => {
        console.log("Audio play blocked by policy (will try on click):", e);
        // Fallback: Enable on first click if blocked
        window.addEventListener('click', () => {
            // Only play if not intentionally paused? Or just play.
            // With the global button, we can just let user handle it, but auto-start is nice.
            if (bgm.paused) {
                bgm.play().then(() => updateGlobalBgmBtn(false));
            }
        }, { once: true });
    });

    // Global BGM Button Logic
    const globalBgmBtn = document.getElementById('global-bgm-btn');

    function updateGlobalBgmBtn(isPaused) {
        if (!globalBgmBtn) return;
        if (isPaused) {
            globalBgmBtn.textContent = '🔇 MUSIC: OFF';
            globalBgmBtn.classList.add('off');
        } else {
            globalBgmBtn.textContent = '🎵 MUSIC: ON';
            globalBgmBtn.classList.remove('off');
        }
    }

    if (globalBgmBtn) {
        globalBgmBtn.addEventListener('click', () => {
            if (bgm.paused) {
                bgm.play();
                updateGlobalBgmBtn(false);
            } else {
                bgm.pause();
                updateGlobalBgmBtn(true);
            }
        });

        // Synch initial state
        updateGlobalBgmBtn(bgm.paused);
        bgm.addEventListener('play', () => updateGlobalBgmBtn(false));
        bgm.addEventListener('pause', () => updateGlobalBgmBtn(true));
    }

    // 32s 后启动星际穿梭 (Updated for extended intro timing: 2s + 13s + ...)
    const introTimeout = setTimeout(() => {
        startStarWarp(overlay);
    }, 32000);

    // Skip Button Logic
    const skipBtn = document.getElementById('skip-intro-btn');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            console.log("Skipping Intro...");

            // 1. Cancel pending warp start
            clearTimeout(introTimeout);
            // No need to clear bgmTimeout anymore as it's immediate

            // 2. Keep Music Playing (User request: unified BGM)
            // if (bgm) bgm.currentTime = 0; 

            // 3. Stop warp loop if active
            if (window.stopIntroLoop) {
                window.stopIntroLoop();
                window.stopIntroLoop = null; // Prevent double call
            }

            // 4. Remove Intro UI
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            // Also remove Skip Button
            if (skipBtn.parentNode) skipBtn.parentNode.removeChild(skipBtn);

            // 5. Show Canvas Container explicitly (Instant)
            const container = document.getElementById('canvas-container');
            if (container) {
                // Disable transition for instant appearance
                container.style.transition = 'none';
                container.style.opacity = '1';
                container.classList.add('show-scene');

                // Restore transition (optional, if needed for later fades)
                // setTimeout(() => container.style.transition = '', 100);
            }

            // 6. Start Main App
            // Let startMainApp handle the single-run check internally
            startMainApp();
        });
    }
}

function startStarWarp(overlay) {
    const canvas = document.createElement('canvas');
    canvas.id = 'star-warp-canvas';
    document.body.appendChild(canvas);

    const flash = document.createElement('div');
    flash.id = 'white-flash';
    document.body.appendChild(flash);

    const hint = document.createElement('div');
    hint.className = 'warp-hint';
    hint.innerHTML = 'HOLD [LMB] OR [OPEN HAND] 🖐 TO WARP<br>MOVE [HAND] ✋ TO STEER';
    document.body.appendChild(hint);

    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // Small delay to ensure browser registers initial opacity: 0 state
    // for a smooth CSS transition
    setTimeout(() => {
        canvas.style.opacity = 1;
        // hint.style.opacity = 1; // Removed: handled by CSS animation (.warp-hint)
    }, 100);

    // 3D Star System
    const stars = [];
    const numStars = 3000;
    // Authentic Star Colors
    const starColors = ['255, 255, 255', '200, 220, 255', '255, 240, 200', '255, 200, 200'];

    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: (Math.random() - 0.5) * width * 10, // Massive universe
            y: (Math.random() - 0.5) * height * 10,
            z: Math.random() * 4000,
            size: 1.0 + Math.random() * 2.5, // Increase base size (1.0 - 3.5)
            color: starColors[Math.floor(Math.random() * starColors.length)],
            winkOffset: Math.random() * 100
        });
    }

    // State
    let speed = 0.5; // Default slow drift
    let isAccelerating = false;
    let holdStartTime = 0; // Track when hold started
    let isWarping = true;
    let maxSpeedTime = 0; // Track how long we've been at max speed
    let animationId;
    let time = 0;

    // Interaction
    const startAccel = (e) => {
        if (e.button === 0) {
            isAccelerating = true;
            holdStartTime = time; // Mark start time
        }
    };
    const stopAccel = () => {
        isAccelerating = false;
    };

    window.addEventListener('mousedown', startAccel);
    window.addEventListener('mouseup', stopAccel);

    // Camera / Perspective
    let mouseX = width / 2;
    let mouseY = height / 2;
    let camX = 0;
    let camY = 0;

    const onMove = (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    };
    window.addEventListener('mousemove', onMove);

    // Expose cleanup function for Skip button
    window.stopIntroLoop = () => {
        isWarping = false;
        cancelAnimationFrame(animationId);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mousedown', startAccel);
        window.removeEventListener('mouseup', stopAccel);

        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (flash.parentNode) flash.parentNode.removeChild(flash);
        if (hint.parentNode) hint.parentNode.removeChild(hint);
    };

    function loop() {
        if (!isWarping) return;
        time++;

        // Nebula Background with trail clearing (Motion Blur effect)
        // At high speeds, we clear less to create trails
        const clearAlpha = Math.max(0.1, 0.3 - speed * 0.002);
        ctx.fillStyle = `rgba(5, 5, 20, ${clearAlpha})`;
        ctx.fillRect(0, 0, width, height);

        // Update Camera Position (Parallax)
        // Hand Control Overlay
        if (state.isRightHandDetected) {
            // Map NDC (-1..1) to Screen Coords (0..width)
            // Note: mouse.y in state is inverted by MediaPipe logic? 
            // In initMediaPipe: mouse.y = -(handY * 2) + 1; (Maps 0..1 to 1..-1)
            // Here we want 0..height.
            // 1 -> 0, -1 -> height implies: (1 - y) / 2 * height ? No.
            // Let's reverse: mouse.y is 1 (top) to -1 (bottom)
            // We want y=0 (top) to y=height (bottom)
            // normalizedTop = (1 - mouse.y) / 2
            mouseX = (mouse.x * 0.5 + 0.5) * width;
            mouseY = (1 - mouse.y) * 0.5 * height;

            // Acceleration Control (Open Hand)
            // state.rightHandOpenness: 0 (Fist/Flat) -> 1 (Spread)
            // Gesture logic is now pre-processed in initMediaPipe
            if (state.rightHandOpenness > 0.5) {
                if (!isAccelerating) {
                    isAccelerating = true;
                    // Only reset start time if we were fully stopped/idle to prevent jitter
                    // But here logic is simple boolean
                    holdStartTime = time;
                }
            } else {
                isAccelerating = false;
            }
        }

        // Enhanced Parallax (User Request: "Visual hierarchy difference more obvious")
        // Increased multiplier from 5 to 15
        const targetCamX = (mouseX - width / 2) * 15;
        const targetCamY = (mouseY - height / 2) * 15;
        camX += (targetCamX - camX) * 0.05;
        camY += (targetCamY - camY) * 0.05;

        // Physics: Acceleration (Exponential Warp)
        const maxSpeed = 250;
        const idleSpeed = 0.5;

        if (isAccelerating) {
            // Calculate how long we've been holding (frames / 60)
            const chargeDuration = 60 * 12; // 12 seconds
            const holdProgress = Math.min(1, (time - holdStartTime) / chargeDuration);

            if (holdProgress < 0.5) {
                // Phase 1: Slow Inertia Build-up (0-6s)
                // Speed: 0.5 -> 20
                // Gentle curve
                const progress = holdProgress / 0.5;
                const target = 0.5 + 19.5 * (progress * progress);
                speed += (target - speed) * 0.05;
            } else if (holdProgress < 0.9) {
                // Phase 2: Thrusters Engage (6s-10.8s)
                // Speed: 20 -> 100
                // Notable acceleration
                const progress = (holdProgress - 0.5) / 0.4;
                const target = 20 + 80 * (progress * progress * progress);
                speed += (target - speed) * 0.1;
            } else {
                // Phase 3: Hyperdrive Injection (10.8s-12s+)
                // Speed: 100 -> 250 (Max)
                // Intense spike
                speed = speed * 1.1 + 1.0;
                if (speed > maxSpeed) speed = maxSpeed;
            }
        } else {
            holdStartTime = time; // Reset hold timer

            // Rapid deceleration / Spool down
            speed = speed * 0.95;
            if (speed < idleSpeed) speed = idleSpeed;
        }

        // Draw Stars
        // ctx.lineWidth is now dynamic per star

        const cx = width / 2;
        const cy = height / 2;
        const fov = 400;

        stars.forEach(star => {
            star.z -= speed;

            // Infinite Universe Loop (Z-Axis)
            if (star.z <= 10) {
                star.z = 4000;
                // Spawn relative to camera so we always fly into new stars
                star.x = camX + (Math.random() - 0.5) * width * 10;
                star.y = camY + (Math.random() - 0.5) * height * 10;
            }

            // Infinite Universe Loop (Lateral X/Y)
            // If camera moves too far, wrap stars around to stay populated
            const fieldW = width * 10;
            const fieldH = height * 10;

            // Wrap X
            let dx = star.x - camX;
            if (dx > fieldW / 2) star.x -= fieldW;
            else if (dx < -fieldW / 2) star.x += fieldW;

            // Wrap Y
            let dy = star.y - camY;
            if (dy > fieldH / 2) star.y -= fieldH;
            else if (dy < -fieldH / 2) star.y += fieldH;

            // 3D Perspective Projection
            // Interactive 3D Camera System
            const rx = star.x - camX;
            const ry = star.y - camY;

            const scale = fov / (star.z);
            const x2d = cx + rx * scale;
            const y2d = cy + ry * scale;

            // Base star size (Min size pushed to 1.5px for visibility)
            const starSize = Math.max(1.5, star.size * scale);

            // Trail / Streak Calculation
            let x2dOld = x2d;
            let y2dOld = y2d;
            let zTrail = 0;

            // Only show trails at higher speeds
            const trailThreshold = 20.0;

            if (speed > trailThreshold) {
                // Smoothly ramp up trail length
                // Transition over 30 units of speed (20->50)
                const ramp = Math.min(1, (speed - trailThreshold) / 30.0);
                const targetZ = speed * (1.0 + (speed - trailThreshold) * 0.05);
                zTrail = targetZ * ramp;
            }

            if (zTrail > 0.1) {
                const oldScale = fov / (star.z + zTrail);
                x2dOld = cx + rx * oldScale;
                y2dOld = cy + ry * oldScale;
            } else {
                x2dOld = x2d;
            }

            // Alpha & Twinkle
            let alpha = Math.min(1, (4000 - star.z) / 1000 + 0.3); // Boost visibility

            // Smooth Twinkle Transition
            // Twinkle fades out linearly as speed goes from 0 to 15
            const twinkleCutoff = 15.0;
            if (speed < twinkleCutoff) {
                const twinkleFactor = 1.0 - (speed / twinkleCutoff);
                // Variation depth scales with twinkleFactor
                const variation = 0.3 * twinkleFactor;
                // Base brightness + sine wave overlay
                // At max twinkle: varies +/- 0.3
                // At zero twinkle: stable at 1.0
                alpha *= (1.0 - variation) + variation * Math.sin(time * 0.1 + star.winkOffset);
            }

            let color = star.color;
            // Blue shift at warp
            if (speed > 100) color = '150, 240, 255';

            // calculate dynamic linewidth to prevent "fat star" jump
            // Target width at high speed
            const speedWidth = Math.max(1, speed * 0.2);
            let drawWidth = starSize;

            if (speed > trailThreshold) {
                // Blend from natural size to speed width
                const widthRamp = Math.min(1, (speed - trailThreshold) / 40.0);
                drawWidth = starSize * (1 - widthRamp) + speedWidth * widthRamp;
            }

            ctx.lineWidth = drawWidth;
            ctx.lineCap = 'round';
            ctx.strokeStyle = `rgba(${color}, ${alpha})`;
            ctx.fillStyle = `rgba(${color}, ${alpha})`;

            ctx.beginPath();
            // Unified drawing: always use line
            ctx.moveTo(x2dOld, y2dOld);
            ctx.lineTo(x2d, y2d);
            ctx.stroke();

        });

        // Trigger Transition w/ Delay
        if (speed >= maxSpeed * 0.99) {
            maxSpeedTime++;

            // === Shock Effect Phase (Final 0.5s) ===
            // 1. Extreme Screen Shake
            const shakeIntensity = Math.pow(maxSpeedTime / 30, 2) * 20; // 0 -> 20px
            const shakeX = (Math.random() - 0.5) * shakeIntensity;
            const shakeY = (Math.random() - 0.5) * shakeIntensity;

            // Apply simple cam shake visual by shifting next frame's clear rect or canvas
            // We can cheat by moving the canvas DOM element itself for "screen shake"
            canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;

            // 2. Washout to White (Additive Exposure)
            // Instead of drawing black background next frame, we draw white overlay
            // We do this by filling a white rect with increasing alpha
            const exposure = Math.pow(maxSpeedTime / 30, 3); // Exponential blow out
            ctx.fillStyle = `rgba(255, 255, 255, ${exposure})`;
            ctx.fillRect(0, 0, width, height);

            // Wait approx 0.5 second (30 frames) at max speed before warp
            if (maxSpeedTime > 30) {
                isWarping = false;
                hint.style.opacity = 0;
                finishWarp();
                return;
            }
        } else {
            maxSpeedTime = 0; // Reset counter if speed drops
            // Reset shake
            if (canvas.style.transform !== '') canvas.style.transform = '';
        }

        animationId = requestAnimationFrame(loop);
    }

    function finishWarp() {
        cancelAnimationFrame(animationId);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mousedown', startAccel);
        window.removeEventListener('mouseup', stopAccel);

        // 1. Flash White Screen (The Jump)
        // Force instant opacity change by disabling transition temporarily if needed, 
        // but since we want a "pop", we rely on the fact that it was 0.
        // We override the transition to be instant for the appearing phase.
        flash.style.opacity = 1;
        // Apply instant zoom shock to body
        document.body.style.transition = 'transform 0.1s ease-out';
        document.body.style.transform = 'scale(1.02)';

        setTimeout(() => document.body.style.transform = 'scale(1.0)', 100);

        // 2. Prepare Scene behind the flash
        // Wait for flash to fully cover
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            if (hint.parentNode) hint.parentNode.removeChild(hint);

            // Allow Skip button to be removed if it exists
            const skipBtn = document.getElementById('skip-intro-btn');
            if (skipBtn && skipBtn.parentNode) skipBtn.parentNode.removeChild(skipBtn);

            const container = document.getElementById('canvas-container');
            container.style.opacity = '1';
            container.classList.add('show-scene');

            // Start the actual 3D content
            startMainApp();

            // 3. Smooth Fade Out to reveal Saturn
            // Set transition back to slow for the fade out
            flash.style.transition = 'opacity 3s ease-in';
            // Force reflow to ensure transition update applies before opacity change
            void flash.offsetWidth;
            flash.style.opacity = 0;

            setTimeout(() => {
                if (flash.parentNode) flash.parentNode.removeChild(flash);
            }, 3000); // Wait for fade out

        }, 200); // Extremely short hold, just enough to register the flash (200ms)
    }

    loop();
}

function initThree() {
    const container = document.getElementById('canvas-container');

    // 场景
    scene = new THREE.Scene();
    // 增加一点雾效做深度感 - 深邃黑
    scene.fog = new THREE.FogExp2(0x000000, 0.002); // Reduced density for clearer distance

    // 相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000); // Further view
    camera.position.z = 5;

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 响应窗口大小变化
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createRoundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Soft glow gradient
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    return new THREE.CanvasTexture(canvas);
}

// === 背景流星雨 ===
function initMeteorShower() {
    starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starVelocities = []; // Store velocities for animation

    for (let i = 0; i < STAR_COUNT; i++) {
        // Spread stars widely - Vast Universe
        starPositions[i * 3] = (Math.random() - 0.5) * 2000; // x: wider range
        starPositions[i * 3 + 1] = (Math.random() - 0.5) * 2000; // y
        starPositions[i * 3 + 2] = (Math.random() - 0.5) * 2000 - 500; // z depth

        starVelocities.push({
            speed: 0.2 + Math.random() * 0.5,
            angle: Math.PI / 4 + (Math.random() - 0.5) * 0.2 // Diagonal movement
        });
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

    // Create a simple streak texture or just use points
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.5, // Slightly larger to account for soft texture
        map: createRoundTexture(), // Use Round Texture
        transparent: true,
        opacity: 0.8,
        depthWrite: false, // Prevent z-fighting with trails
        blending: THREE.AdditiveBlending
    });

    stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);

    // --- Trails (LineSegments) ---
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(STAR_COUNT * 6); // 2 vertices per star * 3 coords
    // Init all to 0
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));

    // Trail Material: Fade out at tail? 
    // LineBasicMaterial doesn't support vertex alpha easily without vertex colors.
    // Let's use simple opacity.
    const trailMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });

    starTrails = new THREE.LineSegments(trailGeo, trailMaterial);
    scene.add(starTrails);
    starTrails.visible = false; // Hidden by default until speed picks up
}

function animateMeteors() {
    if (!stars) return;

    // Calculate dynamic speed based on time
    // Combines slow waves and fast jitters for "arbitrary" feel
    // base speed + slow variation + fast variation
    // Using Math.pow to make "fast" moments more intense (warp speed effect)
    const wave1 = Math.sin(time * 0.5); // Slow cycle
    const wave2 = Math.sin(time * 3.0); // Fast cycle

    // Map -1..1 to something positive. 
    // We want speed to fluctuate between say 0.5 (slow drift) and 2.0 (moderate rush)
    // Removed extreme multipliers
    let speedMultiplier = 1.0 + wave1 * 0.3 + wave2 * 0.2;

    // Occasional boost, but capped
    if (Math.sin(time * 0.2) > 0.8) {
        speedMultiplier *= 2.0;
    }

    let currentSpeed = 5.0 * speedMultiplier; // Base 5
    // Hard cap at 20.0 as requested
    if (currentSpeed > 20.0) currentSpeed = 20.0;

    const positions = starGeo.attributes.position.array;
    // Check if trails exist (legacy safety)
    const hasTrails = starTrails && starTrails.geometry && starTrails.geometry.attributes.position;
    const trailPositions = hasTrails ? starTrails.geometry.attributes.position.array : null;

    // Toggle Trails visibility based on speed
    // Adjusted threshold since max speed is now lower (20)
    // Trails start appearing at speed > 10
    if (hasTrails) {
        if (currentSpeed > 10.0) {
            starTrails.visible = true;
            // Modulate opacity based on speed (10 to 20 range)
            state.trailOpacity = (currentSpeed - 10.0) / 10.0; // 0.0 to 1.0
            starTrails.material.opacity = Math.min(0.5, state.trailOpacity);
        } else {
            starTrails.visible = false;
        }
    }

    for (let i = 0; i < STAR_COUNT; i++) {
        // Simple meteor shower movement: Z axis or Diagonal
        // Let's make them move towards camera for a "warp speed" feel or diagonally for "shower"

        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        let z = positions[i * 3 + 2];

        // Z movement (Warp speed style)
        z += currentSpeed; // Move towards camera

        // Reset if passed camera (+ a buffer behind camera)
        if (z > 200) {
            positions[i * 3] = (Math.random() - 0.5) * 2000;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
            z = -1800; // Reset far back
        } else {
            // Collision Detection (Approximate)
            if (currentSpeed > 5.0 && Math.abs(z) < currentSpeed * 2) {
                // Only check when meteor is near Z=0 plane (where particles mostly are)
                // Bounds check (X/Y) - Optimization
                if (Math.abs(x) < 20 && Math.abs(y) < 20) {
                    // Loop through a SUBSET or ALL Saturn particles?
                    // Collision Radius: 0.5
                    const searchRadiusSq = 0.25;

                    for (let j = 0; j < config.particleCount; j += 5) { // Skip steps for performance
                        const cp = currentPositions[j];
                        const dx = x - cp.x;
                        const dy = y - cp.y;

                        // Simple distance check (ignoring precise Z, assuming projected impact)
                        if (dx * dx + dy * dy < searchRadiusSq) {
                            // HIT!
                            spawnExplosion(cp.x, cp.y, cp.z, { r: 0, g: 1, b: 1 }); // Cyan burst

                            // Physics Knockback
                            cp.vx += (Math.random() - 0.5) * 0.5;
                            cp.vy += (Math.random() - 0.5) * 0.5;
                            cp.vz += (Math.random() - 0.5) * 0.5 + currentSpeed * 0.05; // Push forward mostly

                            // Don't hit multiple particles with one meteor to save fps
                            break;
                        }
                    }
                }
            }
        }

        positions[i * 3 + 2] = z;

        // Update Trails
        // Trail: Vertex 1 = Head (Star Pos), Vertex 2 = Tail (Star Pos - Length)
        if (hasTrails && starTrails.visible) {
            // Trail Length depends on speed
            const trailLen = currentSpeed * 3.0;

            // Vertex 1: Current Pos
            trailPositions[i * 6] = x;
            trailPositions[i * 6 + 1] = y;
            trailPositions[i * 6 + 2] = z;

            // Vertex 2: Tail Pos
            trailPositions[i * 6 + 3] = x;
            trailPositions[i * 6 + 4] = y;
            trailPositions[i * 6 + 5] = z - trailLen;
        }
    }
    starGeo.attributes.position.needsUpdate = true;
    if (hasTrails && starTrails.visible) {
        starTrails.geometry.attributes.position.needsUpdate = true;
    }

    stars.rotation.z -= 0.0002; // Very slow spin of the universe
    if (hasTrails) starTrails.rotation.z = stars.rotation.z; // Sync rotation
}

function createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Core
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);

    // Parse color for gradient steps
    // Subtle glow instead of intense burst
    gradient.addColorStop(0, 'rgba(200, 255, 255, 1)'); // Brighter core
    gradient.addColorStop(0.2, 'rgba(0, 255, 255, 0.8)'); // Strong cyan inner ring
    gradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function initExplosionSystem() {
    explosionGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(EXPLOSION_COUNT * 3);
    const colors = new Float32Array(EXPLOSION_COUNT * 3);
    const sizes = new Float32Array(EXPLOSION_COUNT);

    // Init off-screen
    for (let i = 0; i < EXPLOSION_COUNT; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 99999;
        positions[i * 3 + 2] = 0;

        // Data
        explosionData.push({
            vx: 0, vy: 0, vz: 0,
            age: 0, life: 0,
            active: false
        });
    }

    explosionGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    explosionGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    explosionGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        size: 0.5,
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: createRoundTexture()
    });

    explosionParticles = new THREE.Points(explosionGeo, material);
    scene.add(explosionParticles);
}

function spawnExplosion(x, y, z, color = { r: 1, g: 1, b: 1 }) {
    // Find inactive particles
    let count = 0;
    const spawnAmount = 15; // particles per explosion

    for (let i = 0; i < EXPLOSION_COUNT; i++) {
        if (!explosionData[i].active) {
            explosionData[i].active = true;
            explosionData[i].age = 0;
            explosionData[i].life = 30 + Math.random() * 20; // frames

            const posAttr = explosionGeo.attributes.position.array;
            posAttr[i * 3] = x;
            posAttr[i * 3 + 1] = y;
            posAttr[i * 3 + 2] = z;

            // Varied velocity (Burst)
            const speed = 0.2 + Math.random() * 0.5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;

            explosionData[i].vx = speed * Math.sin(phi) * Math.cos(theta);
            explosionData[i].vy = speed * Math.sin(phi) * Math.sin(theta);
            explosionData[i].vz = speed * Math.cos(phi);

            // Color
            const colAttr = explosionGeo.attributes.color.array;
            colAttr[i * 3] = color.r;
            colAttr[i * 3 + 1] = color.g;
            colAttr[i * 3 + 2] = color.b;

            // Size
            explosionGeo.attributes.size.array[i] = 0.5 + Math.random() * 1.0;

            count++;
            if (count >= spawnAmount) break;
        }
    }
}

function updateExplosions() {
    if (!explosionParticles) return;

    const positions = explosionGeo.attributes.position.array;
    const sizes = explosionGeo.attributes.size.array;
    let needsUpdate = false;

    for (let i = 0; i < EXPLOSION_COUNT; i++) {
        if (explosionData[i].active) {
            const p = explosionData[i];
            p.age++;

            if (p.age > p.life) {
                p.active = false;
                positions[i * 3 + 1] = 99999; // Hide
                needsUpdate = true;
                continue;
            }

            // Move
            positions[i * 3] += p.vx;
            positions[i * 3 + 1] += p.vy;
            positions[i * 3 + 2] += p.vz;

            // Drag
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.vz *= 0.95;

            // Shrink
            const lifeRatio = 1.0 - (p.age / p.life);
            sizes[i] = lifeRatio * 1.5;

            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        explosionGeo.attributes.position.needsUpdate = true;
        explosionGeo.attributes.size.needsUpdate = true;
    }
}

// === 粒子系统 ===
function initParticles() {
    particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(config.particleCount * 3);

    // 初始位置：随机分布在球体内
    for (let i = 0; i < config.particleCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const r = Math.cbrt(Math.random()) * 2; // 球体均匀分布

        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        currentPositions.push({
            x: positions[i * 3],
            y: positions[i * 3 + 1],
            z: positions[i * 3 + 2],
            vx: 0, vy: 0, vz: 0
        });
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Colors attribute (for rainbow/gradient support)
    const colors = new Float32Array(config.particleCount * 3);
    for (let i = 0; i < config.particleCount; i++) {
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
    }
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Material
    const sprite = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');

    particleMaterial = new THREE.PointsMaterial({
        color: config.color,
        size: config.particleSize,
        map: sprite,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true // Enable vertex colors
    });

    particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // 清理旧的特殊粒子
    if (specialParticles && specialParticles.length > 0) {
        specialParticles.forEach(sp => {
            scene.remove(sp.particle);
            if (sp.element && sp.element.parentNode) sp.element.parentNode.removeChild(sp.element);
        });
    }
    specialParticles = [];

    // List of targets to generate
    const targets = [
        { name: 'Stephen Monkey', url: 'http://ssg-inner-aishow.seasungames.cn:3000/ssg_show_hk/01/index.html' },
        { name: 'LEON ZHANG', url: 'https://ssg-inner-aishow.seasungame.com/ssg_show_zzy/01/index.html' },
        { name: 'DGDTS DU', url: 'https://ssg-inner-aishow.seasungame.com/ssg_show_djy/01/index.html' },
        { name: 'Allen', url: '#' },
        { name: 'Chengguang', url: '#' }
    ];

    const container = document.getElementById('tech-labels-container');
    const glowTexture = createGlowTexture();
    const specialMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x00ffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false
    });

    targets.forEach((target, index) => {
        // 使用 Fibonacci Sphere 分布来防止位置重叠
        // 索引加个偏移量防止每次都在同一点
        const k = index + 0.5;
        const total = targets.length;
        const phi = Math.acos(1 - 2 * k / total); // 0 到 PI
        const theta = Math.PI * (1 + Math.sqrt(5)) * k; // 黄金角

        // 随机半径，保持在土星球体内部 (Radius ~1.0)
        // 0.4 ~ 0.8 范围，避免太靠近核心也避免溢出
        const r = 0.4 + Math.random() * 0.4;

        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi);

        // 第一个是史蒂芬猴，强制稍微居中一点但不要完全在正中心
        if (index === 0) {
            x *= 0.2; y *= 0.2; z *= 0.2;
        }

        const basePos = new THREE.Vector3(x, y, z);

        // 创建 Sprite
        const sprite = new THREE.Sprite(specialMaterial.clone());
        sprite.position.copy(basePos);
        sprite.scale.set(0.15, 0.15, 0.15); // Default small size
        sprite.visible = false;
        scene.add(sprite);

        // 创建 DOM
        const div = document.createElement('div');
        div.className = 'tech-label';
        // 使用更简洁的 HTML 结构，添加 data-text 属性用于乱码还原
        div.innerHTML = `<span class="label-content" data-text="${target.name}">${target.name}</span>`;

        // 点击事件绑定
        const link = div.querySelector('.label-content');

        // 乱码效果逻辑
        link.addEventListener('mouseenter', (e) => {
            const targetEl = e.target;
            const originalText = targetEl.getAttribute('data-text');
            const possibleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
            let iterations = 0;

            // 清除可能存在的旧 Interval
            if (targetEl.interval) clearInterval(targetEl.interval);

            targetEl.interval = setInterval(() => {
                targetEl.innerText = originalText
                    .split('')
                    .map((letter, index) => {
                        if (index < iterations) {
                            return originalText[index];
                        }
                        return possibleChars[Math.floor(Math.random() * possibleChars.length)];
                    })
                    .join('');

                if (iterations >= originalText.length) {
                    clearInterval(targetEl.interval);
                }

                iterations += 1 / 3; // 速度控制
            }, 30);
        });

        link.addEventListener('click', (e) => {
            e.stopPropagation();
            if (target.url && target.url !== '#') {
                window.open(target.url, '_blank');
            } else {
                alert(`Opening ${target.name} in a new window`);
            }
        });

        // 允许穿透点击（如果点到文字间隙）
        // style.css 已经设置 tech-label point-events: none, .label-content: auto

        container.appendChild(div);

        specialParticles.push({
            basePos: basePos,
            particle: sprite,
            element: div,
            url: target.url
        });
    });

    // 生成初始形状目标
    updateShapeTarget(config.shape);
    // Initial colors update
    updateColors();
}

// 生成不同形状的坐标
function getShapePositions(shapeType) {
    const positions = [];
    const count = config.particleCount;

    for (let i = 0; i < count; i++) {
        let x, y, z;
        const idx = i / count; // 0 到 1

        // 随机种子
        const r1 = Math.random();
        const r2 = Math.random();
        const r3 = Math.random();

        switch (shapeType) {
            case 'heart':
                // 心形公式
                // x = 16sin^3(t)
                // y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
                // 这是一个2D心形，我们需要把它扩展成3D
                const t = r1 * Math.PI * 2;
                const h_r = r2; // 内部填充

                // 3D 心形变体
                x = 16 * Math.pow(Math.sin(t), 3);
                y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
                z = (r3 - 0.5) * 5; // 厚度

                // 简单的缩放
                x *= 0.1; y *= 0.1; z *= 0.1;
                break;

            case 'flower':
                // 极坐标玫瑰线 r = cos(k*theta)
                const k = 4; // 花瓣数
                const theta_f = r1 * Math.PI * 2;
                const rad_f = Math.cos(k * theta_f) + 0.5; // 半径
                const phi_f = (r2 - 0.5) * Math.PI; // 3D 偏移

                x = rad_f * Math.cos(theta_f) * 2;
                y = rad_f * Math.sin(theta_f) * 2;
                z = r3 * Math.cos(k * theta_f) * 0.5; // 稍微有些波动的厚度
                break;

            case 'saturn':
                // 土星：球体 + 环
                if (i < count * 0.3) {
                    // 主体球
                    const theta_s = Math.random() * Math.PI * 2;
                    const phi_s = Math.acos((Math.random() * 2) - 1);
                    const rad_s = 1.0;
                    x = rad_s * Math.sin(phi_s) * Math.cos(theta_s);
                    y = rad_s * Math.sin(phi_s) * Math.sin(theta_s);
                    z = rad_s * Math.cos(phi_s);
                } else {
                    // Ring
                    const theta_r = Math.random() * Math.PI * 2;

                    // Dense inner ring, sparse outer ring
                    // Using power function to skew distribution towards smaller radius offset
                    // rad varies from 1.5 to 4.0
                    const rad_r = 1.5 + Math.pow(Math.random(), 2) * 2.5;

                    x = rad_r * Math.cos(theta_r);
                    y = (Math.random() - 0.5) * 0.1; // Thin ring
                    z = rad_r * Math.sin(theta_r);

                    // Tilt the ring
                    const tilt = Math.PI / 6;
                    const tempY = y * Math.cos(tilt) - z * Math.sin(tilt);
                    const tempZ = y * Math.sin(tilt) + z * Math.cos(tilt);
                    y = tempY;
                    z = tempZ;
                }
                break;

            case 'buddha':
                // 抽象佛像：身(球) + 头(球) + 腿(扁球)
                const choice = Math.random();
                if (choice < 0.2) {
                    // 头
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos((Math.random() * 2) - 1);
                    const r = 0.5;
                    x = r * Math.sin(phi) * Math.cos(theta);
                    y = r * Math.sin(phi) * Math.sin(theta) + 1.2;
                    z = r * Math.cos(phi);
                } else if (choice < 0.6) {
                    // 躯干
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos((Math.random() * 2) - 1);
                    const r = 0.8;
                    x = r * Math.sin(phi) * Math.cos(theta) * 1.2;
                    y = r * Math.sin(phi) * Math.sin(theta);
                    z = r * Math.cos(phi) * 0.8;
                } else {
                    // 盘腿 (扁椭圆)
                    const theta = Math.random() * Math.PI * 2;
                    const r = 1.5 * Math.sqrt(Math.random());
                    x = r * Math.cos(theta);
                    y = (Math.random() - 0.5) * 0.5 - 0.8;
                    z = r * Math.sin(theta);
                }
                break;

            case 'fireworks':
                // 爆炸发散状
                const theta_fw = Math.random() * Math.PI * 2;
                const phi_fw = Math.acos((Math.random() * 2) - 1);
                const r_fw = Math.random() * 3 + 0.1; // 随机半径
                x = r_fw * Math.sin(phi_fw) * Math.cos(theta_fw);
                y = r_fw * Math.sin(phi_fw) * Math.sin(theta_fw);
                z = r_fw * Math.cos(phi_fw);
                break;

            case 'tornado':
                // Vortex / Tornado
                const y_t = (Math.random() - 0.5) * 6; // -3 to 3
                // Base radius funnel
                let r_t = 0.2 + 0.15 * Math.pow((y_t + 3), 1.8);
                // Scatter
                r_t += Math.random() * 0.5 * (1 + (y_t + 3) / 6);

                const theta_t = Math.random() * Math.PI * 2;
                x = r_t * Math.cos(theta_t);
                y = y_t;
                z = r_t * Math.sin(theta_t);

                // Debris (5%)
                if (Math.random() < 0.05) {
                    x *= 1.5 + Math.random();
                    z *= 1.5 + Math.random();
                    y += (Math.random() - 0.5);
                }
                break;

            default:
                x = (r1 - 0.5) * 2;
                y = (r2 - 0.5) * 2;
                z = (r3 - 0.5) * 2;
                break;
        }

        positions.push({ x, y, z });
    }
    return positions;
}

function updateShapeTarget(shapeType) {
    initialPositions = getShapePositions(shapeType);
}

// Update particle colors based on scheme
function updateColors() {
    const colors = particleGeometry.attributes.color.array;
    const positions = particleGeometry.attributes.position.array;

    // Helper color object
    const c = new THREE.Color();

    for (let i = 0; i < config.particleCount; i++) {
        if (config.colorScheme === 'single') {
            // Single color: Set to config.color
            // Since material.vertexColors is true, we must set these white to use material.color tint,
            // OR set them to the specific color and keep material.color white.
            // Let's set them to white so material.color controls it.
            c.setRGB(1, 1, 1);
        } else if (config.colorScheme === 'rainbow') {
            // Rainbow: HSL based on index
            const hue = i / config.particleCount;
            c.setHSL(hue, 1.0, 0.5);
        } else if (config.colorScheme === 'gradient-y') {
            // Vertical gradient based on Y position
            const y = positions[i * 3 + 1];
            // Normalize approximate y range (-2 to 2) to 0-1
            const normalizedY = (y + 2) / 4;
            c.setHSL(normalizedY, 1.0, 0.5);
        } else if (config.colorScheme === 'tornado-special') {
            // Tornado Special: Cyan-Green with Yellow Debris
            if (Math.random() < 0.05) {
                // Yellow Debris
                c.setHex(0xffdd00);
            } else {
                // Cyan-Green Gradient
                // R=0, G=0.6~1.0, B=0.4~1.0
                c.setRGB(0, 0.6 + Math.random() * 0.4, 0.5 + Math.random() * 0.5);
            }
        }

        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    particleGeometry.attributes.color.needsUpdate = true;

    // If not single, set material color to white to avoid tinting
    if (config.colorScheme !== 'single') {
        particleMaterial.color.setHex(0xffffff);
    } else {
        particleMaterial.color.set(config.color);
    }
}

// === 交互事件 ===
function initEvents() {
    // 形状选择
    const shapeSelect = document.getElementById('shape-select');
    shapeSelect.addEventListener('change', (e) => {
        config.shape = e.target.value;
        updateShapeTarget(config.shape);
        // Special color handling for Tornado
        if (config.shape === 'tornado') {
            config.colorScheme = 'tornado-special'; // Custom internal scheme
        } else {
            // Restore default if switching back, or let user pick. 
            // Better to retain current scheme unless it was tornado's.
            if (config.colorScheme === 'tornado-special') {
                config.colorScheme = 'single'; // Reset to default
            }
        }
        updateColors();
    });

    // 颜色选择
    const colorPicker = document.getElementById('color-picker');
    colorPicker.addEventListener('input', (e) => {
        config.color = e.target.value;
        if (config.colorScheme === 'single') {
            particleMaterial.color.set(config.color);
        }
    });

    // Color Scheme Select
    const schemeSelect = document.getElementById('color-scheme-select');
    if (schemeSelect) {
        schemeSelect.addEventListener('change', (e) => {
            config.colorScheme = e.target.value;
            updateColors();
        });
    }

    // Opacity Slidder
    const opacitySlider = document.getElementById('opacity-slider');
    if (opacitySlider) {
        opacitySlider.addEventListener('input', (e) => {
            particleMaterial.opacity = parseFloat(e.target.value);
        });
    }

    // --- NEW: Gesture Toggle Switch ---
    const gestureBtn = document.getElementById('gesture-toggle-btn');
    if (gestureBtn) {
        gestureBtn.addEventListener('click', () => {
            state.gestureEnabled = !state.gestureEnabled;
            if (state.gestureEnabled) {
                gestureBtn.textContent = "🖐 HANDS: ON";
                gestureBtn.classList.remove('off');
            } else {
                gestureBtn.textContent = "🖐 HANDS: OFF";
                gestureBtn.classList.add('off');
                // Force Reset
                state.isRightHandDetected = false;
                state.gestureDetected = false;
                // state.handScale = 1.0; // Optional: reset size or keep it? User said "hold size", so maybe don't reset scale

                const handCursor = document.getElementById('hand-cursor');
                if (handCursor) handCursor.classList.remove('active');
            }
        });
    }

    // Global BGM Toggle
    const bgmBtn = document.getElementById('global-bgm-btn');
    if (bgmBtn) {
        bgmBtn.addEventListener('click', () => {
            // Find global audio, usually ID 'bgm-player' or dynamically created
            const audio = document.getElementById('global-bgm-audio');
            // If not found, try generic search
            const targetAudio = audio || document.querySelector('audio');

            if (targetAudio) {
                if (targetAudio.paused) {
                    targetAudio.play();
                    bgmBtn.textContent = "🎵 MUSIC: ON";
                    bgmBtn.classList.remove('off');
                } else {
                    targetAudio.pause();
                    bgmBtn.textContent = "🎵 MUSIC: OFF";
                    bgmBtn.classList.add('off');
                }
            }
        });
    }

    // Scale Slider
    const scaleSlider = document.getElementById('scale-slider');
    if (scaleSlider) {
        scaleSlider.addEventListener('input', (e) => {
            state.sliderScale = parseFloat(e.target.value);
        });
    }

    // Tech Label Click (Moved inside initEvents to avoid redeclaring if not careful, but better to just have one place)
    /* REMOVED: key label logic is now dynamic in initParticles */

    // BGM Control - Integrated globally
    // Legacy code removed to prevent double playing
    const bgmPlayer = document.getElementById('bgm-player');

    // UI Toggle
    const uiPanel = document.getElementById('ui-panel');
    const uiToggle = document.getElementById('ui-toggle');
    if (uiToggle) {
        uiToggle.addEventListener('click', () => {
            uiPanel.classList.toggle('closed');
        });
    }

    // 鼠标滚轮缩放
    window.addEventListener('wheel', (e) => {
        const speed = 0.001;
        state.wheelScale -= e.deltaY * speed;
        // 限制: 最小 0.1 倍, 最大 5 倍
        state.wheelScale = Math.max(0.1, Math.min(state.wheelScale, 5.0));
    });

    // 鼠标移动检测
    window.addEventListener('mousemove', (e) => {
        // If right hand is controlling, ignore mouse
        if (state.isRightHandDetected) return;

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
}



// === MediaPipe Hands ===
function initMediaPipe() {
    if (window.isCameraRunning) return;
    window.isCameraRunning = true;

    const videoElement = document.getElementById('input-video');
    let canvasElement = document.getElementById('output-canvas');
    if (!canvasElement) {
        canvasElement = document.createElement('canvas');
        canvasElement.id = 'output-canvas';
        canvasElement.style.display = 'none'; // Hidden by default
        document.body.appendChild(canvasElement);
    }
    const canvasCtx = canvasElement.getContext('2d');
    const statusDiv = document.getElementById('camera-status');

    const hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
        // CHECK MASTER SWITCH
        if (!state.gestureEnabled) {
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            state.gestureDetected = false;
            return;
        }

        // 绘制调试视图
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        state.gestureDetected = false;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            state.gestureDetected = true;
            statusDiv.textContent = "🖐️ Gesture Detected";
            statusDiv.classList.add('active');

            let leftHandFound = false;
            state.isRightHandDetected = false;
            state.selectedLabelIndex = -1; // Reset selection unless right hand confirms it

            // Loop through all hands
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                // MediaPipe 'Left' = Person's Left Hand (usually), 'Right' = Person's Right Hand
                // However, in 'selfie' mode (mirrored), label 'Left' appears on the RIGHT side of the image.
                // We will trust the label if using 'camera_utils' which mirrors by default but labels correctly.
                const classification = results.multiHandedness[i];
                const label = classification.label; // "Left" or "Right"

                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1 });

                // --- Simple Openness Calculation ---
                // Calculate Average Distance from Tips to Wrist (0)
                // Wrist is landmark 0, Tips are 4, 8, 12, 16, 20

                // Normalization Factor: Palm Size (Wrist 0 to Middle Finger MCP 9)
                // This makes the logic scale-invariant (works for far or close hands)
                const wrist = landmarks[0];
                const middleMCP = landmarks[9];
                const palmSize = Math.sqrt(
                    Math.pow(wrist.x - middleMCP.x, 2) +
                    Math.pow(wrist.y - middleMCP.y, 2) +
                    Math.pow(wrist.z - middleMCP.z, 2)
                ) || 1.0; // Avoid div by zero

                const tips = [4, 8, 12, 16, 20];
                let tipDistSum = 0;
                tips.forEach(idx => {
                    const t = landmarks[idx];
                    const d = Math.sqrt(
                        Math.pow(t.x - wrist.x, 2) +
                        Math.pow(t.y - wrist.y, 2) +
                        Math.pow(t.z - wrist.z, 2)
                    );
                    tipDistSum += d;
                });
                const avgTipDist = tipDistSum / 5;
                // Ratio: Open hand ~ 1.5-2.0x palmSize. Fist ~ 0.5-0.8x palmSize.
                // Normalized Extension
                const extensionRatio = avgTipDist / palmSize;

                // --- Spread Calculation (Finger to Finger) ---
                // Calculate distance between adjacent tips
                // 4-8, 8-12, 12-16, 16-20
                let spreadSum = 0;
                const adjacentPairs = [[4, 8], [8, 12], [12, 16], [16, 20]];
                adjacentPairs.forEach(pair => {
                    const p1 = landmarks[pair[0]];
                    const p2 = landmarks[pair[1]];
                    const d = Math.sqrt(
                        Math.pow(p1.x - p2.x, 2) +
                        Math.pow(p1.y - p2.y, 2) +
                        Math.pow(p1.z - p2.z, 2)
                    );
                    spreadSum += d;
                });
                // Normalized Spread
                const spreadRatio = spreadSum / palmSize;

                // Thresholds (Tuned by assumption, need calibration)
                // Extension > 1.3 usually means fingers are out.
                // Spread > 2.0 usually means fingers are splayed.
                // Spread < 1.0 usually means fingers are together.

                // === LOGIC SPLIT ===
                // SWAPPED LOGIC: 'Right' label (Physical Right) -> Scale Control
                if (label === 'Right') {
                    leftHandFound = true; // Maps to "Scale Hand" state

                    // Tuned for easier Max reach (1.8 -> 1.5)
                    const minOpen = 0.8;
                    const maxOpen = 1.5;
                    let openness = (extensionRatio - minOpen) / (maxOpen - minOpen);
                    openness = Math.max(0, Math.min(openness, 1));

                    // Expanded Max Scale to 6.0 for impactful expansion
                    state.handScale = 0.1 + openness * 5.9;

                } else if (label === 'Left') {
                    // SWAPPED LOGIC: 'Left' label (Physical Left) -> Mouse/Interaction Control
                    // IMPORTANT: This block MUST NOT affect state.handScale
                    // This maps to 'state.isRightHandDetected' because the app treats "Right Hand" as the interactor.
                    state.isRightHandDetected = true;

                    // Pointer / Cursor Position (Index Tip 8)
                    const pointer = landmarks[8];

                    // Invert X for mirroring fix: -((x*2)-1)
                    mouse.x = -((pointer.x * 2) - 1);
                    mouse.y = -(pointer.y * 2) + 1;

                    // --- PINCH DETECTION (Click) ---
                    const thumbTip = landmarks[4];
                    const indexTip = landmarks[8];
                    const pinchDist = Math.sqrt(
                        Math.pow(thumbTip.x - indexTip.x, 2) +
                        Math.pow(thumbTip.y - indexTip.y, 2) +
                        Math.pow(thumbTip.z - indexTip.z, 2)
                    );
                    const pinchRatio = pinchDist / palmSize;

                    // Sensitivity: < 0.22 palm size is a pinch (Previously 0.25)
                    const isPinch = pinchRatio < 0.22;

                    // Gesture Recognition Priority: 
                    // 1. Pinch (Click)
                    // 2. Fist (Cancel)
                    // 3. Spread (Accelerate)
                    // 4. Flat (Steer)

                    if (isPinch) {
                        state.rightHandStatus = 'pinch';
                        state.rightHandOpenness = 0;
                    } else {
                        state.pinchConsumed = false; // Reset click status

                        if (extensionRatio < 1.1) {
                            state.rightHandStatus = 'fist';
                            state.rightHandOpenness = 0;
                        } else {
                            // Extended
                            if (spreadRatio > 2.2) {
                                state.rightHandStatus = 'spread';
                                state.rightHandOpenness = 1.0;
                            } else {
                                state.rightHandStatus = 'flat';
                                state.rightHandOpenness = 0;
                            }
                        }
                    }

                    // Debug
                    // console.log(`Gesture: ${state.rightHandStatus} (Pinch: ${pinchRatio.toFixed(2)})`);
                }
            }

            // Smooth Reset Left Hand if lost
            if (!leftHandFound) {
                // state.handScale += (1.0 - state.handScale) * 0.05; // Keep size
            }

        } else {
            statusDiv.textContent = "📷 Waiting for Gesture...";
            statusDiv.classList.remove('active');
            // Smooth reset
            // state.handScale += (1.0 - state.handScale) * 0.05; // Keep size
        }
        canvasCtx.restore();
    });

    /* 
           Replace Google's Camera Utils with custom implementation 
           to prevent built-in alert() on error.
        */
    const startCameraEncoded = async () => {
        try {
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoElement.srcObject = stream;
            // Wait for video to be ready
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    resolve();
                };
            });
            await videoElement.play();

            // Frame Loop
            const frameLoop = async () => {
                // If the app page is closed or context lost, stop? 
                // For now just keep running while window exists
                if (videoElement.paused || videoElement.ended) return;

                await hands.send({ image: videoElement });
                requestAnimationFrame(frameLoop);
            };
            requestAnimationFrame(frameLoop);

        } catch (err) {
            console.warn("Camera init failed or rejected:", err);

            // Show Tech Alert (No confirmation needed, just visual)
            const alertDiv = document.createElement('div');
            alertDiv.className = 'tech-alert';
            alertDiv.innerHTML = `
                <div class="alert-title">⚠ SYSTEM ALERT</div>
                <div class="alert-msg">VISUAL SENSOR OFFLINE</div>
                <div class="alert-sub">Continuing without Hand Tracking...</div>
            `;
            document.body.appendChild(alertDiv);

            // Update Status indicator if exists
            if (statusDiv) {
                statusDiv.textContent = "⚠ Camera Offline";
                statusDiv.style.color = "#ff5555";
            }

            // Auto-remove DOM element after animation (approx 5s safe margin)
            setTimeout(() => {
                if (alertDiv.parentNode) alertDiv.parentNode.removeChild(alertDiv);
            }, 5000);
        }
    };

    startCameraEncoded();
}

// === 动画循环 ===
function animate() {
    requestAnimationFrame(animate);

    time += 0.01;

    // Update meteors (Background)
    animateMeteors();
    updateExplosions();

    // Calculate total scale including the new slider scale
    const totalTargetScale = state.wheelScale * state.handScale * state.sliderScale;

    // 1. 平滑更新状态
    state.currentScale += (totalTargetScale - state.currentScale) * 0.1;

    const positions = particleGeometry.attributes.position.array;

    // For Color updates in Tornado mode
    const colors = particleGeometry.attributes.color.array;
    let needsColorUpdate = false;

    for (let i = 0; i < config.particleCount; i++) {
        const target = initialPositions[i];

        // 基础目标位置
        let tx = target.x * state.currentScale;
        let ty = target.y * state.currentScale;
        let tz = target.z * state.currentScale;

        const current = currentPositions[i];

        // 动态效果：添加一些基于时间的波动
        if (config.shape === 'fireworks') {
            const speed = 1.0 + Math.sin(time) * 0.5;
            tx *= speed; ty *= speed; tz *= speed;
        } else if (config.shape === 'heart') {
            const beat = 1 + 0.05 * Math.sin(time * 5);
            tx *= beat; ty *= beat; tz *= beat;
        } else if (config.shape === 'saturn') {
            // Gentle floating effect: Asynchronous sine wave for each particle
            // Use index 'i' to offset the phase so they don't move in unison
            // Each particle gets a slightly different speed and phase
            const floatSpeed = 1.5;
            const floatAmp = 0.05;
            const phase = i * 13.0; // Random-ish stride

            // Add vertical float (Y-axis in local space)
            ty += Math.sin(time * floatSpeed + phase) * floatAmp;
        } else if (config.shape === 'tornado') {
            // === Masterpiece Tornado Logic ===
            const noise = (i * 0.123) % 1;
            const yMin = -3;
            const yRange = 6;

            // Reduced speed parameters for slower motion
            const flowSpeed = 0.15 + noise * 0.1; // Slower suction flow
            const phaseOffset = (target.y - yMin) / yRange; // 0..1

            // Flow: Top to Bottom
            let progress = (phaseOffset - time * flowSpeed) % 1;
            if (progress < 0) progress += 1;

            const h = yMin + progress * yRange;

            // Shape
            let r = 0.2 + 0.12 * Math.pow((h + 3.5), 1.8);

            // Debris
            const isDebris = (i % 20 === 0);
            if (isDebris) {
                r *= 1.5 + noise * 1.5;
                r += Math.sin(time * 2 + i) * 0.2; // Slower vibration
            } else {
                r += (noise - 0.5) * 0.3;
            }

            // Rotation - Slower
            const rotSpeed = 0.8 + (3.5 - h) * 0.3;
            const theta = (i * 0.1) - time * rotSpeed;

            tx = r * Math.cos(theta);
            tz = r * Math.sin(theta);
            ty = h;

            tx *= state.currentScale;
            ty *= state.currentScale;
            tz *= state.currentScale;

            // Loop Teleportation
            if (ty - current.y > 2.0 * state.currentScale) {
                current.x = tx;
                current.y = ty;
                current.z = tz;
            }

            // Opacity
            let alpha = 1.0;
            if (progress > 0.85) alpha = (1.0 - progress) / 0.15;
            else if (progress < 0.15) alpha = progress / 0.15;
            alpha = Math.max(0, Math.min(1, alpha));

            // Colors
            needsColorUpdate = true;
            if (isDebris) {
                colors[i * 3] = 1.0 * alpha;     // R
                colors[i * 3 + 1] = 0.8 * alpha; // G
                colors[i * 3 + 2] = 0.0 * alpha; // B
            } else {
                const depth = 0.5 + noise * 0.5;
                colors[i * 3] = 0.0;             // R
                colors[i * 3 + 1] = (0.4 + depth * 0.6) * alpha; // G
                colors[i * 3 + 2] = (0.6 + depth * 0.4) * alpha; // B
            }
        }

        // 粒子平滑移动到目标位置
        // const current = currentPositions[i]; // (Redefined loop var handled above)

        // Mouse interaction: Parallax Effect
        // Slightly displace particles based on mouse position AND depth
        // Only apply if mouse is on screen
        if (mouse.x > -2 && mouse.y > -2) {
            const parallaxX = mouse.x * 0.5; // Factor
            const parallaxY = mouse.y * 0.5;
            tx += parallaxX;
            ty += parallaxY;
        }

        // Apply Forces (Spring + Velocity)
        const springStrength = 0.05;
        const damping = 0.9;

        // Return force towards target
        const fx = (tx - current.x) * springStrength;
        const fy = (ty - current.y) * springStrength;
        const fz = (tz - current.z) * springStrength;

        current.vx += fx;
        current.vy += fy;
        current.vz += fz;

        current.vx *= damping;
        current.vy *= damping;
        current.vz *= damping;

        current.x += current.vx;
        current.y += current.vy;
        current.z += current.vz;

        // 赋值回 geometry
        positions[i * 3] = current.x;
        positions[i * 3 + 1] = current.y;
        positions[i * 3 + 2] = current.z;
    }
    particleGeometry.attributes.position.needsUpdate = true;
    if (needsColorUpdate) {
        particleGeometry.attributes.color.needsUpdate = true;
    }

    // 3. 旋转场景 (Base rotation + Mouse influence)
    particles.rotation.y += state.rotationSpeed.y;

    // Add extra rotation based on mouse x position to simulate "drag" or "look around"
    if (mouse.x > -2) {
        particles.rotation.y += mouse.x * 0.01;
        particles.rotation.x = -mouse.y * 0.01;
    }

    if (config.shape === 'saturn') {
        particles.rotation.z = 0.2;
    } else {
        particles.rotation.z = 0;
    }

    // Update Special Particles & Labels
    const isCorrectShape = config.shape === 'saturn' || config.shape === 'fireworks';

    // Visibility: scale > 1.2 starts showing, 3.5 fully visible
    // Adjusted threshold lower so user can see them easier
    let visibility = 0;
    if (isCorrectShape) {
        visibility = (state.currentScale - 1.2) / 1.5;
        visibility = Math.max(0, Math.min(visibility, 1));
    }

    // Raycast check setup
    // Since special particles are unconnected sprites, we can raycast them.
    raycaster.setFromCamera(mouse, camera);

    specialParticles.forEach((sp, index) => {
        const sprite = sp.particle;
        const div = sp.element;

        if (visibility > 0) {
            sprite.visible = true;
            // Boost opacity so they are definitely seen
            sprite.material.opacity = visibility * 1.0;

            // 1. Update Position first (so raycast/proximity checks are accurate)
            const worldPos = sp.basePos.clone();
            worldPos.applyEuler(particles.rotation);
            worldPos.multiplyScalar(state.currentScale);
            sprite.position.copy(worldPos);

            // 2. Project to Screen/NDC Space
            const vector = worldPos.clone();
            vector.project(camera);

            // 3. Interaction Checks
            let isHovered = false;

            // A. Raycast (Standard Mouse/3D)
            // Note: Raycaster uses 'mouse' vector which is updated by Hand or Mouse
            const intersects = raycaster.intersectObject(sprite);
            if (intersects.length > 0) isHovered = true;

            // B. DOM Hover (Standard Mouse)
            // Works for physical mouse if it's over the div
            try {
                const content = div.querySelector('.label-content');
                if (content && content.matches(':hover')) isHovered = true;
            } catch (e) { }

            // C. Hand Proximity Check (Virtual Cursor)
            // If using Right Hand, check distance in NDC space (-1 to 1)
            if (state.isRightHandDetected && visibility > 0.5) {
                const dx = mouse.x - vector.x;
                const dy = mouse.y - vector.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                // Threshold: 0.15 NDC is roughly 7.5% of screen width. Generous hit area.
                if (dist < 0.15) {
                    isHovered = true;
                }
            }

            // === Right Hand Click (Pinch) ===
            // Trigger: Pinch active + Not consumed yet + Document visible
            if (state.isRightHandDetected && state.rightHandStatus === 'pinch' && !state.pinchConsumed && !document.hidden) {
                if (isHovered) {
                    const now = Date.now();
                    // Basic debounce still good, but 'pinchConsumed' handles the main logic
                    if (now - state.lastClickTime > 500) {
                        state.lastClickTime = now;
                        state.pinchConsumed = true; // Mark this pinch as used

                        const contentEl = div.querySelector('.label-content');

                        // Logic: Use the data directly from the particle object (sp.url)
                        if (sp.url && sp.url !== '#') {
                            // Method 1: Create and click a temporary link
                            const tempLink = document.createElement('a');
                            tempLink.href = sp.url;
                            tempLink.target = '_blank';
                            tempLink.rel = 'noopener noreferrer';
                            document.body.appendChild(tempLink);
                            tempLink.click();
                            document.body.removeChild(tempLink);
                            console.log("Attempted to open: " + sp.url);
                        } else {
                            // Fallback for '#' empty links (Demo mode)
                            if (contentEl) {
                                alert(`Opening ${contentEl.dataset.text || 'Link'} in a new window`);
                            }
                        }

                        // Visual feedback
                        if (contentEl) {
                            contentEl.style.transform = `scale(0.9)`;
                            contentEl.style.color = '#ff00ff';
                            setTimeout(() => {
                                if (contentEl) {
                                    contentEl.style.transform = `scale(1.0)`;
                                    contentEl.style.color = '';
                                }
                            }, 200);
                        }
                    }
                }
            }

            // 4. Visual Updates based on State
            let pScale = 0.2 + 0.05 * Math.sin(time * 3 + sprite.id);

            // Handle Text Scramble Effect
            // Store original text if not already stored
            const contentEl = div.querySelector('.label-content');
            if (contentEl && !sp.originalText) {
                sp.originalText = contentEl.innerText;
                sp.scrambleFrame = 0;
            }

            if (isHovered && visibility > 0.5) {
                // Interactive Scale
                pScale *= 1.5;
                sprite.material.color.set(0xff00ff);
                div.classList.add('hovered');
                document.body.style.cursor = 'pointer';

                // Scramble Logic: Run for first 30 frames (approx 0.5s) of hover
                if (sp.scrambleFrame < 20) {
                    sp.scrambleFrame++;
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
                    // Randomize string length slightly
                    const len = sp.originalText.length;
                    let scrambled = '';
                    for (let k = 0; k < len; k++) {
                        scrambled += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    if (contentEl) contentEl.innerText = scrambled;
                } else {
                    // Restore
                    if (contentEl && contentEl.innerText !== sp.originalText) {
                        contentEl.innerText = sp.originalText;
                    }
                }

            } else {
                // Normal pulsing color
                const flicker = 0.5 + 0.5 * Math.sin(time * 8 + sprite.id);
                sprite.material.color.setHSL(0.5, 1.0, 0.5 + 0.4 * flicker);
                div.classList.remove('hovered');
                if (specialParticles.length === 1) document.body.style.cursor = 'default';

                // Reset Scramble
                if (sp.scrambleFrame > 0) {
                    sp.scrambleFrame = 0;
                    if (contentEl) contentEl.innerText = sp.originalText;
                }
            }

            sprite.scale.set(pScale, pScale, pScale);

            // 5. Update DOM Element Position
            if (vector.z > 1) {
                div.style.opacity = 0;
                div.style.pointerEvents = 'none';
            } else {
                const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;

                div.style.left = `${x}px`;
                div.style.top = `${y}px`;
                div.style.opacity = visibility;
                div.style.pointerEvents = 'auto';

                // Scale content (Hover effect handled by CSS mostly, but base scale here)
                const layoutScale = 0.8 + visibility * 0.4;
                // Add hover scale logic to transform
                const finalScale = isHovered ? layoutScale * 1.3 : layoutScale;

                const content = div.querySelector('.label-content');
                if (content) content.style.transform = `scale(${finalScale})`;
            }

        } else {
            sprite.visible = false;
            div.style.opacity = 0;
            div.style.pointerEvents = 'none';
        }
    });

    // Reset cursor if no hover (simple global reset, might flick, good enough for now)
    // A better way is to track 'anyHovered' flag.

    // Update Cursor Visuals
    const handCursor = document.getElementById('hand-cursor');
    if (handCursor) {
        if (state.isRightHandDetected) {
            handCursor.classList.add('active');
            // Convert Three.js Mouse (-1 to 1) to Screen Coords
            // x: -1 -> 0, 1 -> width
            // y: 1 -> 0, -1 -> height (inverted Y)
            const screenX = (mouse.x * 0.5 + 0.5) * window.innerWidth;
            const screenY = (-(mouse.y * 0.5) + 0.5) * window.innerHeight;

            handCursor.style.left = `${screenX}px`;
            handCursor.style.top = `${screenY}px`;

            if (state.rightHandStatus === 'pinch') {
                handCursor.classList.add('clicking');
            } else {
                handCursor.classList.remove('clicking');
            }
        } else {
            handCursor.classList.remove('active');
        }
    }

    renderer.render(scene, camera);
}
