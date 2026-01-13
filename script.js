import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// === 配置与状态 ===
const config = {
    particleCount: 15000,
    particleSize: 0.05,
    color: '#00ffff',
    shape: 'heart'
};

const state = {
    currentScale: 1.0,
    wheelScale: 1.0,
    handScale: 1.0,
    gestureDetected: false
};

// === Three.js 全局变量 ===
let scene, camera, renderer;
let particles, particleGeometry, particleMaterial;
let initialPositions = []; // 存储当前形状的目标位置
let currentPositions = []; // 存储当前粒子的实际位置（用于动画过渡）
let time = 0;

// === 初始化 ===
initThree();
initParticles();
initEvents();
initMediaPipe();
animate();

function initThree() {
    const container = document.getElementById('canvas-container');

    // 场景
    scene = new THREE.Scene();
    // 增加一点雾效做深度感
    scene.fog = new THREE.FogExp2(0x050510, 0.02);

    // 相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
            z: positions[i * 3 + 2]
        });
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 材质
    // 创建一个圆形纹理
    const sprite = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');

    particleMaterial = new THREE.PointsMaterial({
        color: config.color,
        size: config.particleSize,
        map: sprite,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // 生成初始形状目标
    updateShapeTarget(config.shape);
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
                    // 环
                    const theta_r = Math.random() * Math.PI * 2;
                    const rad_r = 1.5 + Math.random() * 1.5; // 环半径 1.5 - 3.0
                    x = rad_r * Math.cos(theta_r);
                    y = (Math.random() - 0.5) * 0.1; // 环很薄
                    z = rad_r * Math.sin(theta_r);

                    // 倾斜环
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

// === 交互事件 ===
function initEvents() {
    // 形状选择
    const shapeSelect = document.getElementById('shape-select');
    shapeSelect.addEventListener('change', (e) => {
        config.shape = e.target.value;
        updateShapeTarget(config.shape);
    });

    // 颜色选择
    const colorPicker = document.getElementById('color-picker');
    colorPicker.addEventListener('input', (e) => {
        config.color = e.target.value;
        particleMaterial.color.set(config.color);
    });

    // 鼠标滚轮缩放
    window.addEventListener('wheel', (e) => {
        const speed = 0.001;
        state.wheelScale -= e.deltaY * speed;
        // 限制: 最小 0.1 倍, 最大 5 倍
        state.wheelScale = Math.max(0.1, Math.min(state.wheelScale, 5.0));
    });
}

// === MediaPipe Hands ===
function initMediaPipe() {
    const videoElement = document.getElementById('input-video');
    const canvasElement = document.getElementById('output-canvas');
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
        // 绘制调试视图
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        state.gestureDetected = false;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            state.gestureDetected = true;
            statusDiv.textContent = "🖐️ 手势已识别";
            statusDiv.classList.add('active');

            for (const landmarks of results.multiHandLandmarks) {
                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1 });

                // --- 核心逻辑：计算张合度 ---
                // 计算拇指指尖(4)到食指尖(8)的距离，或者所有指尖到掌心(0)的平均距离
                // 这里使用：所有指尖(4, 8, 12, 16, 20) 到 掌心(0) 的平均距离来判断张开程度
                const palm = landmarks[0];
                const tips = [4, 8, 12, 16, 20];
                let totalDist = 0;

                tips.forEach(idx => {
                    const tip = landmarks[idx];
                    const dist = Math.sqrt(
                        Math.pow(tip.x - palm.x, 2) +
                        Math.pow(tip.y - palm.y, 2) +
                        Math.pow(tip.z - palm.z, 2)
                    );
                    totalDist += dist;
                });

                const avgDist = totalDist / 5;

                // 经验阈值：握拳约 < 0.15, 张开约 > 0.35
                const minOpen = 0.15;
                const maxOpen = 0.4;
                const val = Math.max(minOpen, Math.min(avgDist, maxOpen));
                const normalized = (val - minOpen) / (maxOpen - minOpen); // 0.0 ~ 1.0

                // 映射：张开(1.0) -> Scale 2.0; 握紧(0.0) -> Scale 0.5
                state.handScale = 0.5 + normalized * 1.5;

            }
        } else {
            statusDiv.textContent = "📷 等待手势...";
            statusDiv.classList.remove('active');
            // 平滑复位
            state.handScale += (1.0 - state.handScale) * 0.05;
        }
        canvasCtx.restore();
    });

    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });
    camera.start();
}

// === 动画循环 ===
function animate() {
    requestAnimationFrame(animate);

    time += 0.01;

    // 计算总目标缩放
    const totalTargetScale = state.wheelScale * state.handScale;

    // 1. 平滑更新状态
    state.currentScale += (totalTargetScale - state.currentScale) * 0.1;

    // 2. 更新粒子位置
    const positions = particleGeometry.attributes.position.array;

    for (let i = 0; i < config.particleCount; i++) {
        const target = initialPositions[i];

        // 基础目标位置
        let tx = target.x * state.currentScale;
        let ty = target.y * state.currentScale;
        let tz = target.z * state.currentScale;

        // 动态效果：添加一些基于时间的波动，模拟“呼吸”或“漂浮”
        // 不同形状可以有不同的动态
        if (config.shape === 'fireworks') {
            // 烟花特殊动效：不断向外扩散
            const speed = 1.0 + Math.sin(time) * 0.5;
            tx *= speed; ty *= speed; tz *= speed;
        } else if (config.shape === 'heart') {
            // 心跳
            const beat = 1 + 0.05 * Math.sin(time * 5);
            tx *= beat; ty *= beat; tz *= beat;
        }

        // 粒子平滑移动到目标位置
        // 使用简单的线性插值 (Lerp)
        const current = currentPositions[i];

        current.x += (tx - current.x) * 0.05;
        current.y += (ty - current.y) * 0.05;
        current.z += (tz - current.z) * 0.05;

        // 赋值回 geometry
        positions[i * 3] = current.x;
        positions[i * 3 + 1] = current.y;
        positions[i * 3 + 2] = current.z;
    }

    particleGeometry.attributes.position.needsUpdate = true;

    // 3. 旋转场景
    particles.rotation.y += 0.002;
    // 如果是土星，可以加一点自转
    if (config.shape === 'saturn') {
        particles.rotation.z = 0.2;
    } else {
        particles.rotation.z = 0;
    }

    renderer.render(scene, camera);
}
