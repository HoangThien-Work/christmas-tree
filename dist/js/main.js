(function(){
    // Read assets provided by the template
    const MUSIC_URL = (typeof ASSETS !== 'undefined' && ASSETS.music) ? ASSETS.music : './audio.mp3';
    const photoFiles = (typeof ASSETS !== 'undefined' && ASSETS.photos && ASSETS.photos.length>0) ? ASSETS.photos : ['./img/image1.jpeg','./img/image2.jpeg','./img/image3.jpeg','./img/image4.jpeg','./img/image5.jpeg'];

    let bgMusic = new Audio(MUSIC_URL);
    bgMusic.loop = true; bgMusic.volume = 1.0;

    const loader = new THREE.TextureLoader();
    const photoTextures = [];
    photoFiles.forEach((f, i) => photoTextures[i] = loader.load(f));

    function createCustomTexture(type) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const cx = 64, cy = 64;
        if (type === 'gold_glow') {
            const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
            grd.addColorStop(0, '#FFFFFF'); grd.addColorStop(0.2, '#FFFFE0'); grd.addColorStop(0.5, '#FFD700'); grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd; ctx.fillRect(0,0,128,128);
        } else if (type === 'red_light') {
            const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50);
            grd.addColorStop(0, '#FFAAAA'); grd.addColorStop(0.3, '#FF0000'); grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd; ctx.fillRect(0,0,128,128);
        } else if (type === 'gift_red') {
            ctx.fillStyle = '#D32F2F'; ctx.fillRect(20, 20, 88, 88);
            ctx.fillStyle = '#FFD700'; ctx.fillRect(54, 20, 20, 88); ctx.fillRect(20, 54, 88, 20);
            ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth=2; ctx.strokeRect(20,20,88,88);
        }
        return new THREE.CanvasTexture(canvas);
    }

    const textures = {
        gold: createCustomTexture('gold_glow'),
        red: createCustomTexture('red_light'),
        gift: createCustomTexture('gift_red')
    };

    const CONFIG = { goldCount: 2000, redCount: 300, giftCount: 150, explodeRadius: 65, photoOrbitRadius: 25, treeHeight: 70, treeBaseRadius: 35,
        // OK-gesture thresholds (tweak these if OK isn't detected reliably)
        okPinchThreshold: 0.06, // max distance thumb-index for OK
        okOtherExtThreshold: 0.22, // min average distance of other fingers from wrist
        debug: false };

    let scene, camera, renderer;
    let groupGold, groupRed, groupGift;
    let photoMeshes = []; let titleMesh, starMesh, loveMesh;
    let state = 'TREE'; let selectedIndex = 0; let handX = 0.5;
    // photo zoom toggle controlled by OK gesture
    let photoZoom = false;
    let prevOk = false;
    let requestZoom = false; // (kept for compatibility)
    let lastOkMs = 0;
    let holdOk = false; // true while OK gesture is held
    let requestHold = false; // request to engage hold-mode (captured in animate)
    let requestRelease = false; // request to release hold-mode
    let holdSelectedIndex = null; // index locked while holding OK
    let prevStateForHold = null; // remember state so we can restore on release

    function init3D() {
        const container = document.getElementById('canvas-container');
        scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, 0.002);
        camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000); camera.position.z = 100;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); container.appendChild(renderer.domElement);

        groupGold = createParticleSystem('gold', CONFIG.goldCount, 2.0);
        groupRed = createParticleSystem('red', CONFIG.redCount, 3.5);
        groupGift = createParticleSystem('gift', CONFIG.giftCount, 3.0);

        createPhotos(); createDecorations(); animate();
    }

    // Small on-screen debug overlay to help tune gesture thresholds
    let debugEl = null;
    function createDebugOverlay(){
        if(!CONFIG.debug) return;
        debugEl = document.createElement('div');
        debugEl.style.position = 'fixed'; debugEl.style.left = '8px'; debugEl.style.bottom = '8px';
        debugEl.style.padding = '8px 10px'; debugEl.style.background = 'rgba(0,0,0,0.6)'; debugEl.style.color = '#fff';
        debugEl.style.fontFamily = 'monospace'; debugEl.style.fontSize = '12px'; debugEl.style.zIndex = 2000; debugEl.style.borderRadius = '6px';
        debugEl.style.pointerEvents = 'none'; debugEl.innerText = 'debug...'; document.body.appendChild(debugEl);
    }
    function updateDebug(pinchDist, avgOtherExt, okNow, selIdx){ if(!CONFIG.debug || !debugEl) return; debugEl.innerText = `pinch:${pinchDist.toFixed(3)}\notherAvg:${avgOtherExt.toFixed(3)}\nOK:${okNow}\nsel:${selIdx}`; }

    // Compute the best photo index independent of current state
    function computeBestIndex(){
        if(photoMeshes.length===0) return 0;
        let bestIdx = 0; let bestZ = -Infinity;
        const tmp = new THREE.Vector3();
        for(let i=0;i<photoMeshes.length;i++){
            const m = photoMeshes[i];
            m.getWorldPosition(tmp);
            if(tmp.z > bestZ){ bestZ = tmp.z; bestIdx = i; }
        }
        return bestIdx;
    }

    function createParticleSystem(type, count, size) {
        const pPositions = []; const pExplodeTargets = []; const pTreeTargets = []; const pHeartTargets = []; const sizes = []; const phases = [];
        for(let i=0;i<count;i++){
            const h = Math.random()*CONFIG.treeHeight; const y = h - CONFIG.treeHeight/2;
            let radiusRatio = (type==='gold')?Math.sqrt(Math.random()):0.9+Math.random()*0.1;
            const maxR = (1 - (h/CONFIG.treeHeight)) * CONFIG.treeBaseRadius; const r = maxR * radiusRatio; const theta = Math.random()*Math.PI*2;
            pTreeTargets.push(r*Math.cos(theta), y, r*Math.sin(theta));

            const u=Math.random(), v=Math.random(), phi=Math.acos(2*v-1), lam=2*Math.PI*u; let radMult=(type==='gift')?1.2:1.0; const rad=CONFIG.explodeRadius*Math.cbrt(Math.random())*radMult;
            pExplodeTargets.push(rad*Math.sin(phi)*Math.cos(lam), rad*Math.sin(phi)*Math.sin(lam), rad*Math.cos(phi));

            const tHeart=Math.random()*Math.PI*2; let hx=16*Math.pow(Math.sin(tHeart),3); let hy=13*Math.cos(tHeart)-5*Math.cos(2*tHeart)-2*Math.cos(3*tHeart)-Math.cos(4*tHeart);
            const rFill=Math.pow(Math.random(),0.3); hx*=rFill; hy*=rFill; let hz=(Math.random()-0.5)*8*rFill; const noise=1.0; hx += (Math.random()-0.5)*noise; hy += (Math.random()-0.5)*noise; hz += (Math.random()-0.5)*noise;
            const scaleH=2.2; pHeartTargets.push(hx*scaleH, hy*scaleH+5, hz);

            pPositions.push(pTreeTargets[i*3], pTreeTargets[i*3+1], pTreeTargets[i*3+2]); sizes.push(size); phases.push(Math.random()*Math.PI*2);
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pPositions,3)); geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes,1));
        const colors = new Float32Array(count*3); const baseColor = new THREE.Color(); if(type==='gold') baseColor.setHex(0xFFD700); else if(type==='red') baseColor.setHex(0xFF0000); else baseColor.setHex(0xFFFFFF);
        for(let i=0;i<count;i++){ colors[i*3]=baseColor.r; colors[i*3+1]=baseColor.g; colors[i*3+2]=baseColor.b; }
        geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
        geo.userData = { tree: pTreeTargets, explode: pExplodeTargets, heart: pHeartTargets, phases: phases, baseColor: baseColor, baseSize: size };
        const mat = new THREE.PointsMaterial({ size: size, map: textures[type], transparent: true, opacity:1.0, vertexColors:true, blending: (type==='gift')?THREE.NormalBlending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true });
        const points = new THREE.Points(geo, mat); scene.add(points); return points;
    }

    function createPhotos(){
        const geo = new THREE.PlaneGeometry(8,8); const borderGeo = new THREE.PlaneGeometry(9,9); const borderMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
        for(let i=0;i<photoFiles.length;i++){
            const mat = new THREE.MeshBasicMaterial({ map: photoTextures[i], side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat); const border = new THREE.Mesh(borderGeo, borderMat); border.position.z = -0.1; mesh.add(border); mesh.visible=false; mesh.scale.set(0,0,0); scene.add(mesh); photoMeshes.push(mesh);
        }
    }

    function createDecorations(){
        const canvas = document.createElement('canvas'); canvas.width=1024; canvas.height=256; const ctx = canvas.getContext('2d'); ctx.font='bold italic 90px "Times New Roman"'; ctx.fillStyle='#FFD700'; ctx.textAlign='center'; ctx.shadowColor='#FF0000'; ctx.shadowBlur=40; ctx.fillText('MERRY CHRISTMAS',512,130);
        const tex = new THREE.CanvasTexture(canvas); const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending }); titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(60,15), mat); titleMesh.position.set(0,50,0); scene.add(titleMesh);

        const starCanvas = document.createElement('canvas'); starCanvas.width=128; starCanvas.height=128; const sCtx=starCanvas.getContext('2d'); sCtx.fillStyle='#FFFF00'; sCtx.shadowColor='#FFF'; sCtx.shadowBlur=20; sCtx.beginPath(); const cx=64, cy=64, outer=50, inner=20; for(let i=0;i<5;i++){ sCtx.lineTo(cx+Math.cos((18+i*72)/180*Math.PI)*outer, cy-Math.sin((18+i*72)/180*Math.PI)*outer); sCtx.lineTo(cx+Math.cos((54+i*72)/180*Math.PI)*inner, cy-Math.sin((54+i*72)/180*Math.PI)*inner); } sCtx.closePath(); sCtx.fill(); const starTex = new THREE.CanvasTexture(starCanvas); const starMat = new THREE.MeshBasicMaterial({ map: starTex, transparent:true, blending:THREE.AdditiveBlending }); starMesh = new THREE.Mesh(new THREE.PlaneGeometry(12,12), starMat); starMesh.position.set(0, CONFIG.treeHeight/2 + 2, 0); scene.add(starMesh);

        const loveCanvas = document.createElement('canvas'); loveCanvas.width=1024; loveCanvas.height=256; const lCtx = loveCanvas.getContext('2d'); lCtx.font='bold 120px "Segoe UI", sans-serif'; lCtx.fillStyle='#FF69B4'; lCtx.textAlign='center'; lCtx.shadowColor='#FF1493'; lCtx.shadowBlur=40; lCtx.fillText('I LOVE YOU ❤️',512,130); const loveTex = new THREE.CanvasTexture(loveCanvas); const loveMat = new THREE.MeshBasicMaterial({ map: loveTex, transparent:true, blending:THREE.AdditiveBlending }); loveMesh = new THREE.Mesh(new THREE.PlaneGeometry(70,18), loveMat); loveMesh.position.set(0,0,20); loveMesh.visible=false; scene.add(loveMesh);
    }

    function updateParticleGroup(group, type, targetState, speed, handRotY, time){
        const positions = group.geometry.attributes.position.array; const sizes = group.geometry.attributes.size.array; const colors = group.geometry.attributes.color.array; const phases = group.geometry.userData.phases; const baseColor = group.geometry.userData.baseColor; const baseSize = group.geometry.userData.baseSize;
        const targetKey = (targetState === 'TREE') ? 'tree' : (targetState === 'HEART' ? 'heart' : 'explode');
        const targets = group.geometry.userData[(targetState === 'PHOTO') ? 'explode' : targetKey];
        for(let i=0;i<positions.length;i++){ positions[i] += (targets[i] - positions[i]) * speed; }
        group.geometry.attributes.position.needsUpdate = true;
        const count = positions.length/3;
        if (targetState === 'TREE'){
            group.rotation.y += 0.003;
            for(let i=0;i<count;i++){ sizes[i]=baseSize; let brightness=1.0; if(type==='red'){ brightness = 0.5 + 0.5 * Math.sin(time * 3 + phases[i]); } else if(type==='gold'){ brightness = 0.8 + 0.4 * Math.sin(time * 10 + phases[i]); } colors[i*3]=baseColor.r*brightness; colors[i*3+1]=baseColor.g*brightness; colors[i*3+2]=baseColor.b*brightness; }
            group.geometry.attributes.color.needsUpdate = true; group.geometry.attributes.size.needsUpdate = true;
        } else if (targetState === 'HEART'){
            group.rotation.y = 0; const beatScale = 1 + Math.abs(Math.sin(time * 3)) * 0.15; group.scale.set(beatScale, beatScale, beatScale);
            for(let i=0;i<count;i++){ colors[i*3]=baseColor.r; colors[i*3+1]=baseColor.g; colors[i*3+2]=baseColor.b; if (i%3===0) sizes[i]=baseSize; else sizes[i]=0; }
            group.geometry.attributes.color.needsUpdate = true; group.geometry.attributes.size.needsUpdate = true;
        } else {
            group.scale.set(1,1,1); group.rotation.y += (handRotY - group.rotation.y) * 0.1;
            for(let i=0;i<count;i++){ sizes[i]=baseSize; let brightness=1.0; if(type==='gold' || type==='red'){ brightness = 0.8 + 0.5 * Math.sin(time * 12 + phases[i]); } colors[i*3]=baseColor.r*brightness; colors[i*3+1]=baseColor.g*brightness; colors[i*3+2]=baseColor.b*brightness; }
            group.geometry.attributes.size.needsUpdate = true; group.geometry.attributes.color.needsUpdate = true;
        }
    }

    function animate(){ requestAnimationFrame(animate); const time = Date.now()*0.001; const speed = 0.08; const handRotY = (handX - 0.5) * 4.0;
        // Process hold/release requests early so they apply regardless of current state
        if (requestHold) {
            prevStateForHold = state;
            holdOk = true;
            holdSelectedIndex = (typeof selectedIndex !== 'undefined' && photoMeshes[selectedIndex] && photoMeshes[selectedIndex].visible) ? selectedIndex : computeBestIndex();
            requestHold = false;
            photoZoom = true;
            state = 'PHOTO';
        }
        if (requestRelease) {
            holdOk = false;
            holdSelectedIndex = null;
            requestRelease = false;
            photoZoom = false;
            state = prevStateForHold || 'EXPLODE';
            prevStateForHold = null;
        }
        updateParticleGroup(groupGold, 'gold', state, speed, handRotY, time); updateParticleGroup(groupRed, 'red', state, speed, handRotY, time); updateParticleGroup(groupGift, 'gift', state, speed, handRotY, time);
        photoMeshes.forEach((mesh,i)=>{ if(!mesh.material.map && photoTextures[i]){ mesh.material.map = photoTextures[i]; mesh.material.needsUpdate = true; } });
        if(state==='TREE'){ titleMesh.visible=true; starMesh.visible=true; loveMesh.visible=false; titleMesh.scale.lerp(new THREE.Vector3(1,1,1), 0.1); starMesh.rotation.z -= 0.02; starMesh.material.opacity = 0.7 + 0.3*Math.sin(time*5); photoMeshes.forEach(m=>{ m.scale.lerp(new THREE.Vector3(0,0,0), 0.1); m.visible=false; }); }
        else if(state==='HEART'){ titleMesh.visible=false; starMesh.visible=false; loveMesh.visible=true; photoMeshes.forEach(m=>{ m.visible=false; }); const s = 1 + Math.abs(Math.sin(time*3))*0.1; loveMesh.scale.set(s,s,1); }
        else if(state==='EXPLODE'){ titleMesh.visible=false; starMesh.visible=false; loveMesh.visible=false; const baseAngle = groupGold.rotation.y; const angleStep = (Math.PI*2)/Math.max(1, photoMeshes.length); let bestIdx=0; let maxZ=-999; photoMeshes.forEach((mesh,i)=>{ mesh.visible=true; const angle = baseAngle + i*angleStep; const x = Math.sin(angle)*CONFIG.photoOrbitRadius; const z = Math.cos(angle)*CONFIG.photoOrbitRadius; const y = Math.sin(time + i)*3; mesh.position.lerp(new THREE.Vector3(x,y,z), 0.1); mesh.lookAt(camera.position); if(z>maxZ){ maxZ=z; bestIdx=i; } if(z>5){ const ds = 1.0 + (z/CONFIG.photoOrbitRadius)*0.8; mesh.scale.lerp(new THREE.Vector3(ds,ds,ds), 0.1); } else { mesh.scale.lerp(new THREE.Vector3(0.6,0.6,0.6), 0.1); } }); selectedIndex = bestIdx;
            // selectedIndex already set from orbit computation
        }
        else if(state==='PHOTO'){
            loveMesh.visible=false;
            const idxToShow = (holdOk && holdSelectedIndex !== null) ? holdSelectedIndex : selectedIndex;
            photoMeshes.forEach((mesh,i)=>{
                if(i===idxToShow){
                    // Reduced zoom magnitude by ~30%
                    const targetZ = photoZoom ? 49 : 60;
                    mesh.position.lerp(new THREE.Vector3(0,0,targetZ), 0.35);
                    const targetScale = photoZoom ? 5.25 : 5;
                    mesh.scale.lerp(new THREE.Vector3(targetScale,targetScale,targetScale), 0.35);
                    mesh.lookAt(camera.position);
                    mesh.rotation.z = 0;
                } else {
                    mesh.scale.lerp(new THREE.Vector3(0,0,0), 0.1);
                }
            });
        }
        renderer.render(scene, camera);
    }

        function startSystem(){ document.getElementById('btnStart').style.display='none'; bgMusic.play().catch(e=>console.log(e)); init3D();
                // debug overlay disabled in CONFIG
            const video = document.getElementsByClassName('input_video')[0];
            const canvas = document.getElementById('camera-preview');
            const ctx = canvas.getContext('2d');
            // set nominal canvas drawing size; will be updated when video frames arrive
            canvas.width = 160; canvas.height = 120;
        const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        hands.onResults(results => {
            // Ensure canvas matches aspect ratio of results.image
            if (results.image) {
                const img = results.image;
                // prefer video's intrinsic size when available
                const vw = img.width || video.videoWidth || 320;
                const vh = img.height || video.videoHeight || 240;
                // scale to thumbnail box while keeping aspect
                const outW = canvas.clientWidth;
                const outH = Math.round((vh / vw) * outW);
                canvas.width = outW; canvas.height = outH;
                ctx.clearRect(0,0,canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            } else {
                ctx.clearRect(0,0,canvas.width, canvas.height);
            }
            // holdOk is handled in animate(); we don't early-return here
            if(results.multiHandLandmarks && results.multiHandLandmarks.length === 2){ const h1=results.multiHandLandmarks[0]; const h2=results.multiHandLandmarks[1]; const distIndex=Math.hypot(h1[8].x-h2[8].x, h1[8].y-h2[8].y); const distThumb=Math.hypot(h1[4].x-h2[4].x, h1[4].y-h2[4].y); if(distIndex<0.15 && distThumb<0.15){ state='HEART'; return; } }
            if(results.multiHandLandmarks && results.multiHandLandmarks.length>0){
                const lm = results.multiHandLandmarks[0];
                handX = lm[9].x;
                const tips = [8,12,16,20]; const wrist = lm[0];
                let openDist = 0; tips.forEach(i=> openDist += Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y));
                const avgDist = openDist/4;
                const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);

                // OK gesture: thumb+index touching and other fingers extended
                const otherFingers = [12,16,20];
                let otherExt = 0; otherFingers.forEach(i => otherExt += Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y));
                const avgOtherExt = otherExt / otherFingers.length;
                const okNow = (pinchDist < CONFIG.okPinchThreshold && avgOtherExt > CONFIG.okOtherExtThreshold);

                // Rising edge detection + debounce. Use requestHold/requestRelease
                const nowMs = Date.now();
                if (okNow && !prevOk && (nowMs - lastOkMs) > 300) {
                    requestHold = true; // ask animate() to lock the current selection
                    lastOkMs = nowMs;
                }
                if (!okNow && prevOk) {
                    requestRelease = true; // release when gesture stops
                }
                prevOk = okNow;

                // If we're holding OK (or just detected OK), force PHOTO and skip EXPLODE logic
                if (holdOk || okNow || requestHold) {
                    state = 'PHOTO';
                } else if (avgDist < 0.25) {
                    state = 'TREE';
                } else if (pinchDist < CONFIG.okPinchThreshold && !okNow) {
                    state = 'PHOTO';
                } else {
                    state = 'EXPLODE';
                }
                // Update debug overlay with current values and approximate selected index
                updateDebug(pinchDist, avgOtherExt, okNow, selectedIndex || 0);
            } else { state='TREE'; }
        });
            const cameraUtils = new Camera(video, { onFrame: async () => { await hands.send({image: video}); }, width: 640, height: 480 }); cameraUtils.start();
    }

    window.addEventListener('resize', ()=>{ if(camera){ camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); } });

    // Expose to global so template onclick can call
    window.startSystem = startSystem;
})();
