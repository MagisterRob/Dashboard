/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Renders the animated galaxy background used during the login and setup flow.

Key Systems:
- Shared background mode controller
- Canvas 2D fallback renderer
- Three.js galaxy renderer
- Screen-aware camera and zoom transitions

Flow:
- Waits for the auth canvas to exist
- Uses Three.js when available, otherwise falls back to 2D particles
- Exposes `window.galaxyBackground` so UIController can transition it between screens

Design Notes:
- This file is visual polish rather than gameplay logic, but it does a lot of
  heavy lifting for first impressions. Fancy space backdrop, surprisingly serious job.
========================================
*/
(function () {
    // Shared interpolation helper for smooth camera and canvas transitions.
    // Without easing, every screen change feels like the galaxy got yanked by a rope.
    function lerp(current, target, amount) {
        return current + (target - current) * amount;
    }

    // Predefine the camera/background states used by each auth-flow screen.
    function createModeConfig() {
        return {
            "login-screen": {
                progress: 0.02,
                zoom: 1.02,
                tiltX: 0.04,
                tiltZ: 0.0,
                lookY: 0,
                canvasScale: 1.34,
                canvasShiftY: 0
            },
            "difficulty-selection": {
                progress: 0.18,
                zoom: 1.14,
                tiltX: 0.12,
                tiltZ: -0.035,
                lookY: 0.2,
                canvasScale: 1.42,
                canvasShiftY: -6
            },
            "input-mode-selection": {
                progress: 0.34,
                zoom: 1.26,
                tiltX: 0.19,
                tiltZ: 0.045,
                lookY: 0.35,
                canvasScale: 1.48,
                canvasShiftY: -10
            },
            "intro-screen": {
                progress: 0.52,
                zoom: 1.42,
                tiltX: 0.28,
                tiltZ: 0.08,
                lookY: 0.45,
                canvasScale: 1.56,
                canvasShiftY: -15
            }
        };
    }

    // Build a small controller that both renderers can use to share screen-transition behavior.
    function createSharedController(canvas) {
        const modes = createModeConfig();
        const state = {
            hiddenForGame: false,
            currentMode: "login-screen",
            canvasScale: modes["login-screen"].canvasScale,
            targetCanvasScale: modes["login-screen"].canvasScale,
            canvasShiftY: modes["login-screen"].canvasShiftY,
            targetCanvasShiftY: modes["login-screen"].canvasShiftY
        };

        function applyCanvasTransform() {
            canvas.style.transform =
                "translate3d(0, " + state.canvasShiftY.toFixed(2) + "vh, 0) scale(" +
                state.canvasScale.toFixed(3) + ")";
        }

        return {
            getModeConfig: function (mode) {
                return modes[mode] || modes["login-screen"];
            },
            setMode: function (mode) {
                const config = this.getModeConfig(mode);
                state.currentMode = mode;
                state.hiddenForGame = false;
                state.targetCanvasScale = config.canvasScale;
                state.targetCanvasShiftY = config.canvasShiftY;
                canvas.style.display = "block";
                canvas.style.visibility = "visible";
                return config;
            },
            hideForGame: function () {
                state.hiddenForGame = true;
                canvas.style.display = "none";
            },
            showAuthBackground: function (mode) {
                this.setMode(mode || "login-screen");
                applyCanvasTransform();
            },
            updateCanvasState: function () {
                if (state.hiddenForGame) return;
                state.canvasScale = lerp(state.canvasScale, state.targetCanvasScale, 0.035);
                state.canvasShiftY = lerp(state.canvasShiftY, state.targetCanvasShiftY, 0.045);
                applyCanvasTransform();
            }
        };
    }

    // Lightweight 2D fallback for browsers or loads where Three.js is unavailable.
    function runFallback(canvas) {
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        const controller = createSharedController(canvas);
        const stars = [];
        let animationState = {
            progress: 0.02,
            targetProgress: 0.02
        };

        function build() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            stars.length = 0;
            for (let i = 0; i < 1800; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    z: Math.random() * 2 + 0.5,
                    r: Math.random() * 1.6 + 0.2,
                    hue: 28 + Math.random() * 220
                });
            }
        }

        function draw() {
            const t = performance.now() * 0.001;
            animationState.progress = lerp(animationState.progress, animationState.targetProgress, 0.025);
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const verticalDrift = animationState.progress * canvas.height * 0.35;
            const sway = Math.sin(t * 0.16) * 12;

            stars.forEach((star, index) => {
                const depthFactor = 0.5 + animationState.progress * 1.4;
                const x = star.x + sway * star.z * 0.2 + Math.sin(t * 0.3 + index * 0.02) * 2;
                const y = ((star.y + verticalDrift * star.z * 0.03 + t * star.z * 4) % (canvas.height + 10)) - 5;
                const radius = star.r * depthFactor;
                ctx.beginPath();
                ctx.fillStyle = "hsla(" + star.hue + ", 80%, 72%, 0.95)";
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            });

            controller.updateCanvasState();
            requestAnimationFrame(draw);
        }

        function transitionTo(mode) {
            const config = controller.setMode(mode);
            animationState.targetProgress = config.progress;
        }

        build();
        transitionTo("login-screen");
        window.addEventListener("resize", build);
        draw();

        return {
            transitionTo: transitionTo,
            hideForGame: function () {
                controller.hideForGame();
            },
            showAuthBackground: function (mode) {
                transitionTo(mode || "login-screen");
            }
        };
    }

    // Full 3D galaxy renderer used when Three.js is available.
    function runThree(canvas) {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: false
        });

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 1);

        const controller = createSharedController(canvas);
        const galaxy = new THREE.Group();
        scene.add(galaxy);

        const totalStars = 120000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(totalStars * 3);
        const colors = new Float32Array(totalStars * 3);
        const armCount = 3;
        const galaxyRadius = 15;

        for (let i = 0; i < totalStars; i++) {
            const i3 = i * 3;
            const inArm = Math.random() < 0.3;

            if (inArm) {
                const armIndex = i % armCount;
                const armAngle = (armIndex / armCount) * Math.PI * 2;
                const radius = Math.pow(Math.random(), 0.6) * galaxyRadius;
                const spiral = Math.log(radius + 1) * 2.5;
                const angle = armAngle + spiral;
                const armWidth = 0.8;
                const armOffset = (Math.random() - 0.5) * armWidth * (1 + radius * 0.1);

                positions[i3] = Math.cos(angle + armOffset) * radius;
                positions[i3 + 1] = (Math.random() - 0.5) * 0.4;
                positions[i3 + 2] = Math.sin(angle + armOffset) * radius;

                const brightness = 0.6 + Math.random() * 0.3;
                if (radius < 5) {
                    colors[i3] = 0.9 * brightness;
                    colors[i3 + 1] = 0.8 * brightness;
                    colors[i3 + 2] = 0.5 * brightness;
                } else {
                    const armMix = (radius - 5) / 10;
                    colors[i3] = (0.9 - armMix * 0.2) * brightness;
                    colors[i3 + 1] = (0.7 - armMix * 0.3) * brightness;
                    colors[i3 + 2] = (0.3 + armMix * 0.2) * brightness;
                }
            } else {
                const distribution = Math.random();
                if (distribution < 0.7) {
                    const radius = Math.pow(Math.random(), 0.5) * galaxyRadius * 1.2;
                    const angle = Math.random() * Math.PI * 2;
                    const height = (Math.random() - 0.5) * 0.8;
                    positions[i3] = Math.cos(angle) * radius;
                    positions[i3 + 1] = height;
                    positions[i3 + 2] = Math.sin(angle) * radius;
                } else {
                    const radius = Math.random() * galaxyRadius;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
                    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
                    positions[i3 + 2] = radius * Math.cos(phi);
                }

                const colorType = Math.random();
                let r;
                let g;
                let b;
                if (colorType < 0.4) {
                    r = 0.8; g = 0.6; b = 0.3;
                } else if (colorType < 0.7) {
                    r = 0.7; g = 0.4; b = 0.1;
                } else if (colorType < 0.9) {
                    r = 0.6; g = 0.3; b = 0.7;
                } else {
                    r = 0.3; g = 0.5; b = 0.8;
                }

                const brightness = 0.4 + Math.random() * 0.5;
                colors[i3] = r * brightness;
                colors[i3 + 1] = g * brightness;
                colors[i3 + 2] = b * brightness;
            }
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
            size: 0.025,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: false
        }));
        galaxy.add(stars);

        const bgGeometry = new THREE.BufferGeometry();
        const bgPositions = new Float32Array(10000 * 3);
        const bgColors = new Float32Array(10000 * 3);

        for (let i = 0; i < 10000; i++) {
            const i3 = i * 3;
            const radius = 25 + Math.random() * 100;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            bgPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            bgPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            bgPositions[i3 + 2] = radius * Math.cos(phi);

            const brightness = 0.1 + Math.random() * 0.3;
            const blueTint = 0.8 + Math.random() * 0.4;
            bgColors[i3] = brightness * 0.7;
            bgColors[i3 + 1] = brightness * 0.8;
            bgColors[i3 + 2] = brightness * blueTint;
        }

        bgGeometry.setAttribute("position", new THREE.BufferAttribute(bgPositions, 3));
        bgGeometry.setAttribute("color", new THREE.BufferAttribute(bgColors, 3));

        const backgroundStars = new THREE.Points(bgGeometry, new THREE.PointsMaterial({
            size: 0.04,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.5
        }));
        scene.add(backgroundStars);

        const cameraPath = [
            new THREE.Vector3(0, 20, 0.1),
            new THREE.Vector3(0, 15, 5),
            new THREE.Vector3(10, 10, 10),
            new THREE.Vector3(15, 5, 5),
            new THREE.Vector3(18, 0, 0),
            new THREE.Vector3(15, -5, -5),
            new THREE.Vector3(10, -10, -10),
            new THREE.Vector3(0, -15, -5),
            new THREE.Vector3(0, -20, 0.1)
        ];

        const cameraCurve = new THREE.CatmullRomCurve3(cameraPath);
        cameraCurve.curveType = "catmullrom";
        cameraCurve.tension = 0.5;

        const motion = {
            progress: 0.02,
            targetProgress: 0.02,
            zoom: 1.02,
            targetZoom: 1.02,
            tiltX: 0.04,
            targetTiltX: 0.04,
            tiltZ: 0,
            targetTiltZ: 0,
            lookY: 0,
            targetLookY: 0
        };

        function transitionTo(mode) {
            const config = controller.setMode(mode);
            motion.targetProgress = config.progress;
            motion.targetZoom = config.zoom;
            motion.targetTiltX = config.tiltX;
            motion.targetTiltZ = config.tiltZ;
            motion.targetLookY = config.lookY;
        }

        function animate() {
            requestAnimationFrame(animate);

            const time = performance.now() * 0.001;
            motion.progress = lerp(motion.progress, motion.targetProgress, 0.03);
            motion.zoom = lerp(motion.zoom, motion.targetZoom, 0.03);
            motion.tiltX = lerp(motion.tiltX, motion.targetTiltX, 0.028);
            motion.tiltZ = lerp(motion.tiltZ, motion.targetTiltZ, 0.028);
            motion.lookY = lerp(motion.lookY, motion.targetLookY, 0.035);

            const cameraPos = cameraCurve.getPoint(motion.progress).clone().multiplyScalar(motion.zoom);
            cameraPos.x += Math.sin(time * 0.17) * 0.4;
            cameraPos.y += Math.cos(time * 0.13) * 0.35;
            cameraPos.z += Math.sin(time * 0.11) * 0.28;
            camera.position.copy(cameraPos);

            camera.lookAt(
                Math.sin(time * 0.08) * 0.12,
                motion.lookY + Math.cos(time * 0.09) * 0.1,
                0
            );

            galaxy.rotation.y += 0.0002;
            galaxy.rotation.x = lerp(galaxy.rotation.x, motion.tiltX + Math.sin(time * 0.18) * 0.015, 0.035);
            galaxy.rotation.z = lerp(galaxy.rotation.z, motion.tiltZ + Math.cos(time * 0.12) * 0.01, 0.03);

            backgroundStars.rotation.y -= 0.00005;
            backgroundStars.rotation.x = lerp(backgroundStars.rotation.x, motion.tiltX * 0.18, 0.02);
            backgroundStars.rotation.z = lerp(backgroundStars.rotation.z, motion.tiltZ * 0.2, 0.02);

            controller.updateCanvasState();
            renderer.render(scene, camera);
        }

        window.addEventListener("resize", () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        transitionTo("login-screen");
        animate();

        return {
            transitionTo: transitionTo,
            hideForGame: function () {
                controller.hideForGame();
            },
            showAuthBackground: function (mode) {
                transitionTo(mode || "login-screen");
            }
        };
    }

    document.addEventListener("DOMContentLoaded", () => {
        const canvas = document.getElementById("galaxyCanvas");
        if (!canvas) return;

        window.galaxyBackground = window.THREE ? runThree(canvas) : runFallback(canvas);
        if (window.galaxyBackground && typeof window.galaxyBackground.showAuthBackground === "function") {
            window.galaxyBackground.showAuthBackground("login-screen");
        }
    });
})();
