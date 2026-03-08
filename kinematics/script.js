const T_MAX = 10;
const DT = 0.02;
const NUM_POINTS = Math.floor(T_MAX / DT) + 1;

let timeData = [];
let posData = [];
let velData = [];
let accData = [];

// Initialize arrays
for (let i = 0; i < NUM_POINTS; i++) {
    timeData.push(i * DT);
    posData.push(0);
    velData.push(0);
    accData.push(0);
}

let mode = 'freehand'; // 'freehand', 'line', 'quad'
let clicks = []; 
let isDrawing = false;
let lastDrawPoint = null;

let isPlaying = false;
let playbackTime = 0;
let lastTime = 0;

class Chart {
    constructor(canvasId, yMin, yMax, color, labelY, units) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.yMin = yMin;
        this.yMax = yMax;
        this.color = color;
        this.labelY = labelY;
        this.units = units || '';
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
        this.draw();
    }

    tToX(t) { return (t / T_MAX) * this.width; }
    xToT(px) { return (px / this.width) * T_MAX; }
    
    valToY(val) {
        const range = this.yMax - this.yMin;
        return this.height - ((val - this.yMin) / range) * this.height;
    }
    
    yToVal(py) {
        const range = this.yMax - this.yMin;
        return this.yMin + ((this.height - py) / this.height) * range;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Grid/axes
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        const zeroY = this.valToY(0);
        this.ctx.moveTo(0, zeroY);
        this.ctx.lineTo(this.width, zeroY);
        this.ctx.stroke();
        
        for(let t=0; t<=T_MAX; t++) {
            const x = this.tToX(t);
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }

        // Draw Y-axis labels
        this.ctx.fillStyle = '#888';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.font = '12px sans-serif';
        const numLabels = 4;
        for(let i=0; i<=numLabels; i++) {
            const val = this.yMin + (this.yMax - this.yMin) * (i / numLabels);
            const y = this.valToY(val);
            const labelText = `${val.toFixed(1)} ${this.units}`;
            this.ctx.fillText(labelText, 5, y === this.height ? y - 15 : y + 2);
        }
        
        if(!this.data || this.data.length === 0) return;
        
        // Draw main line with glow
        this.ctx.strokeStyle = this.color;
        this.ctx.shadowColor = this.color;
        this.ctx.shadowBlur = 8;
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();
        for(let i=0; i<NUM_POINTS; i++) {
            const x = this.tToX(timeData[i]);
            const y = this.valToY(this.data[i]);
            if(i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
        this.ctx.shadowBlur = 0; // Reset
        
        // Draw clicks in line/quad mode
        if (this === posChart && clicks.length > 0) {
            this.ctx.fillStyle = '#ffffff';
            for (let p of clicks) {
                const cx = this.tToX(p.t);
                const cy = this.valToY(p.val);
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, 5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        
        // Draw playback scrubber
        if (isPlaying || playbackTime > 0) {
            const px = this.tToX(playbackTime);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.height);
            this.ctx.stroke();
        }
    }
}

let posChart, velChart, accChart;

function init() {
    posChart = new Chart('canvas-pos', -10, 10, '#58C4DD', 'x(t)', 'm');
    posChart.data = posData;
    
    velChart = new Chart('canvas-vel', -10, 10, '#83C167', 'v(t)', 'm/s');
    velChart.data = velData;
    
    accChart = new Chart('canvas-acc', -10, 10, '#FC6255', 'a(t)', 'm/s²');
    accChart.data = accData;
    
    setupPosInteraction();
    setupControls();
    
    updateAll();
}

function setupPosInteraction() {
    const posCanvasEl = document.getElementById('canvas-pos');

    function getMousePos(evt) {
        const rect = posCanvasEl.getBoundingClientRect();
        let clientX = evt.clientX;
        let clientY = evt.clientY;
        if(evt.touches && evt.touches.length > 0) {
            clientX = evt.touches[0].clientX;
            clientY = evt.touches[0].clientY;
        }
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    posCanvasEl.addEventListener('mousedown', handlePointerDown);
    posCanvasEl.addEventListener('touchstart', handlePointerDown, {passive: false});

    posCanvasEl.addEventListener('mousemove', handlePointerMove);
    posCanvasEl.addEventListener('touchmove', handlePointerMove, {passive: false});

    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchend', handlePointerUp);

    function handlePointerDown(e) {
        if(e.type === 'touchstart') e.preventDefault();
        const pos = getMousePos(e);
        const t = posChart.xToT(pos.x);
        const val = posChart.yToVal(pos.y);
        
        if(mode === 'freehand') {
            isDrawing = true;
            updatePosData(t, val);
            lastDrawPoint = {t, val};
        } else if (mode === 'line') {
            clicks.push({t, val});
            if(clicks.length === 2) {
                fitLine(clicks[0], clicks[1]);
                clicks = [];
            } else {
                updateAll();
            }
        } else if (mode === 'quad') {
            clicks.push({t, val});
            if(clicks.length === 3) {
                fitQuad(clicks[0], clicks[1], clicks[2]);
                clicks = [];
            } else {
                updateAll();
            }
        } else if (mode === 'cubic') {
            clicks.push({t, val});
            if(clicks.length === 4) {
                fitCubic(clicks[0], clicks[1], clicks[2], clicks[3]);
                clicks = [];
            } else {
                updateAll();
            }
        }
    }

    function handlePointerMove(e) {
        if(!isDrawing || mode !== 'freehand') return;
        if(e.type === 'touchmove') e.preventDefault();
        
        const pos = getMousePos(e);
        const t = posChart.xToT(pos.x);
        const val = posChart.yToVal(pos.y);
        
        if(lastDrawPoint) {
            const t1 = lastDrawPoint.t;
            const v1 = lastDrawPoint.val;
            const t2 = t;
            const v2 = val;
            
            const minT = Math.min(t1, t2);
            const maxT = Math.max(t1, t2);
            
            for(let i=0; i<NUM_POINTS; i++) {
                const ti = timeData[i];
                if(ti >= minT && ti <= maxT) {
                    let f = (ti - t1) / (t2 - t1);
                    if(t2 === t1) f = 0;
                    posData[i] = v1 + f * (v2 - v1);
                }
            }
        }
        
        lastDrawPoint = {t, val};
        updateAll();
    }

    function handlePointerUp() {
        if(isDrawing) {
            isDrawing = false;
            lastDrawPoint = null;
            smoothPosData();
            updateAll();
        }
    }
}

function setupControls() {
    document.getElementById('btn-freehand').addEventListener('click', (e) => setMode('freehand', e.target));
    document.getElementById('btn-line').addEventListener('click', (e) => setMode('line', e.target));
    document.getElementById('btn-quad').addEventListener('click', (e) => setMode('quad', e.target));
    document.getElementById('btn-cubic').addEventListener('click', (e) => setMode('cubic', e.target));
    
    document.getElementById('btn-clear').addEventListener('click', () => {
        for(let i=0; i<NUM_POINTS; i++) posData[i] = 0;
        playbackTime = 0;
        isPlaying = false;
        document.getElementById('btn-play').textContent = 'Play';
        clicks = [];
        updateAll();
    });

    document.getElementById('btn-play').addEventListener('click', () => {
        isPlaying = !isPlaying;
        if (isPlaying) {
            if(playbackTime >= T_MAX) playbackTime = 0;
            lastTime = performance.now();
            requestAnimationFrame(animLoop);
            document.getElementById('btn-play').textContent = 'Stop';
        } else {
            document.getElementById('btn-play').textContent = 'Play';
            updateAll(); 
        }
    });
}

function updatePosData(t, val) {
    const idx = Math.floor(t / DT);
    if(idx >= 0 && idx < NUM_POINTS) {
        posData[idx] = val;
    }
    updateAll();
}

function fitLine(p1, p2) {
    if(p1.t === p2.t) return;
    const m = (p2.val - p1.val) / (p2.t - p1.t);
    const c = p1.val - m * p1.t;
    for(let i=0; i<NUM_POINTS; i++) posData[i] = m * timeData[i] + c;
    updateAll();
}

function fitQuad(p1, p2, p3) {
    const t1 = p1.t, y1 = p1.val;
    const t2 = p2.t, y2 = p2.val;
    const t3 = p3.t, y3 = p3.val;
    
    const denom = (t1-t2)*(t1-t3)*(t2-t3);
    if(Math.abs(denom) < 1e-6) return;
    
    const a = (t3*(y2-y1) + t2*(y1-y3) + t1*(y3-y2)) / denom;
    const b = (t3*t3*(y1-y2) + t2*t2*(y3-y1) + t1*t1*(y2-y3)) / denom;
    const c = (t2*t3*(t2-t3)*y1 + t3*t1*(t3-t1)*y2 + t1*t2*(t1-t2)*y3) / denom;
    
    for(let i=0; i<NUM_POINTS; i++) {
        const t = timeData[i];
        posData[i] = a*t*t + b*t + c;
    }
    updateAll();
}

function fitCubic(p1, p2, p3, p4) {
    // Solve linear system for cubic coefficients: y = at^3 + bt^2 + ct + d
    // Using simple Gaussian elimination/Cramer's rule for a 4x4 matrix
    const pts = [p1, p2, p3, p4];
    
    // Sort points by t to prevent singular matrices if user clicked out of order
    pts.sort((a,b) => a.t - b.t);
    
    // Check if points are distinct enough in t
    for(let i=0; i<3; i++) {
        if(Math.abs(pts[i+1].t - pts[i].t) < 1e-6) return;
    }
    
    let matrix = [];
    for(let i=0; i<4; i++) {
        let t = pts[i].t;
        matrix.push([t*t*t, t*t, t, 1, pts[i].val]);
    }
    
    // Row reduction
    for(let i=0; i<4; i++) {
        // Find pivot
        let maxEl = Math.abs(matrix[i][i]);
        let maxRow = i;
        for(let k=i+1; k<4; k++) {
            if(Math.abs(matrix[k][i]) > maxEl) {
                maxEl = Math.abs(matrix[k][i]);
                maxRow = k;
            }
        }
        
        // Swap
        let tmp = matrix[maxRow];
        matrix[maxRow] = matrix[i];
        matrix[i] = tmp;
        
        // Eliminate
        for(let k=i+1; k<4; k++) {
            let c = -matrix[k][i] / matrix[i][i];
            for(let j=i; j<5; j++) {
                if(i===j) matrix[k][j] = 0;
                else matrix[k][j] += c * matrix[i][j];
            }
        }
    }
    
    // Back substitution
    let x = [0,0,0,0];
    for(let i=3; i>=0; i--) {
        x[i] = matrix[i][4] / matrix[i][i];
        for(let k=i-1; k>=0; k--) {
            matrix[k][4] -= matrix[k][i] * x[i];
        }
    }
    
    const [a, b, c, d] = x;
    
    for(let i=0; i<NUM_POINTS; i++) {
        const t = timeData[i];
        posData[i] = a*t*t*t + b*t*t + c*t + d;
    }
    updateAll();
}

function smoothPosData() {
    const passes = 8;
    const windowSize = 4; 
    for(let p=0; p<passes; p++) {
        let temp = [...posData];
        for(let i=0; i<NUM_POINTS; i++) {
            let sum = 0, count = 0;
            for(let j=i-windowSize; j<=i+windowSize; j++) {
                let idx = Math.max(0, Math.min(NUM_POINTS - 1, j));
                sum += posData[idx]; 
                count++;
            }
            temp[i] = sum / count;
        }
        posData = temp;
    }
}

function computeDerivatives() {
    // Velocity
    for(let i=1; i<NUM_POINTS-1; i++) {
        velData[i] = (posData[i+1] - posData[i-1]) / (2 * DT);
    }
    // 2nd-order forward/backward differences for edges
    velData[0] = (-3 * posData[0] + 4 * posData[1] - posData[2]) / (2 * DT);
    velData[NUM_POINTS-1] = (3 * posData[NUM_POINTS-1] - 4 * posData[NUM_POINTS-2] + posData[NUM_POINTS-3]) / (2 * DT);
    
    // Smooth velocity only for freehand
    if (mode === 'freehand') {
        let smoothVel = [...velData];
        for(let p=0; p<2; p++) {
            let temp = [...smoothVel];
            for(let i=0; i<NUM_POINTS; i++) {
                let sum=0, count=0;
                for(let j=i-2; j<=i+2; j++) {
                    let idx = Math.max(0, Math.min(NUM_POINTS - 1, j));
                    sum += smoothVel[idx]; 
                    count++; 
                }
                temp[i] = sum/count;
            }
            smoothVel = temp;
        }
        velData = smoothVel;
    }
    
    // Acceleration
    for(let i=1; i<NUM_POINTS-1; i++) {
        accData[i] = (velData[i+1] - velData[i-1]) / (2 * DT);
    }
    // 2nd-order forward/backward differences for edges
    accData[0] = (-3 * velData[0] + 4 * velData[1] - velData[2]) / (2 * DT);
    accData[NUM_POINTS-1] = (3 * velData[NUM_POINTS-1] - 4 * velData[NUM_POINTS-2] + velData[NUM_POINTS-3]) / (2 * DT);
    
    // Smooth acceleration only for freehand
    if (mode === 'freehand') {
        let tempAcc = [...accData];
        for(let p=0; p<3; p++) {
            let temp = [...tempAcc];
            for(let i=0; i<NUM_POINTS; i++) {
                let sum=0, count=0;
                for(let j=i-4; j<=i+4; j++){
                    let idx = Math.max(0, Math.min(NUM_POINTS - 1, j));
                    sum += tempAcc[idx]; 
                    count++; 
                }
                temp[i] = sum/count;
            }
            tempAcc = temp;
        }
        accData = tempAcc;
    }
}

function setMode(newMode, btn) {
    mode = newMode;
    clicks = [];
    document.querySelectorAll('.tools button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateAll();
}

function updateAll() {
    computeDerivatives();
    
    // Auto-scale velocity
    let maxVel = 0;
    for(let i=0; i<NUM_POINTS; i++) maxVel = Math.max(maxVel, Math.abs(velData[i]));
    maxVel = Math.max(1, maxVel * 1.2); 
    velChart.yMax = maxVel;
    velChart.yMin = -maxVel;

    // Auto-scale acceleration
    let maxAcc = 0;
    for(let i=0; i<NUM_POINTS; i++) maxAcc = Math.max(maxAcc, Math.abs(accData[i]));
    maxAcc = Math.max(1, maxAcc * 1.2); 
    accChart.yMax = maxAcc;
    accChart.yMin = -maxAcc;

    posChart.data = posData;
    velChart.data = velData;
    accChart.data = accData;
    posChart.draw();
    velChart.draw();
    accChart.draw();
    drawAnimation();
}

function animLoop(time) {
    if(!isPlaying) return;
    const dt = (time - lastTime) / 1000;
    lastTime = time;
    
    playbackTime += dt;
    if(playbackTime > T_MAX) {
        isPlaying = false;
        playbackTime = T_MAX;
        document.getElementById('btn-play').textContent = 'Play';
    }
    
    updateAll(); 
    
    if(isPlaying) requestAnimationFrame(animLoop);
}

// --- Animation Canvas ---
const animCanvas = document.getElementById('canvas-anim');
const animCtx = animCanvas.getContext('2d');

function drawAnimation() {
    const rect = animCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if(animCanvas.width !== rect.width * dpr || animCanvas.height !== rect.height * dpr) {
        animCanvas.width = rect.width * dpr;
        animCanvas.height = rect.height * dpr;
        animCtx.scale(dpr, dpr);
    }
    const width = rect.width;
    const height = rect.height;
    
    animCtx.clearRect(0, 0, width, height);
    
    const centerY = height / 2;
    animCtx.strokeStyle = '#555';
    animCtx.lineWidth = 2;
    animCtx.beginPath();
    animCtx.moveTo(0, centerY);
    animCtx.lineTo(width, centerY);
    animCtx.stroke();
    
    function mapX(xVal) { return ((xVal - (-10)) / 20) * width; }
    
    animCtx.fillStyle = '#888';
    animCtx.textAlign = 'center';
    animCtx.textBaseline = 'top';
    animCtx.font = '12px sans-serif';
    for(let x=-10; x<=10; x+=2) {
        const px = mapX(x);
        animCtx.beginPath();
        animCtx.moveTo(px, centerY - 5);
        animCtx.lineTo(px, centerY + 5);
        animCtx.stroke();
        animCtx.fillText(x.toString(), px, centerY + 8);
    }
    
    const idx = Math.min(NUM_POINTS - 1, Math.max(0, Math.floor(playbackTime / DT)));
    const xVal = posData[idx];
    const vVal = velData[idx];
    const aVal = accData[idx];
    
    const objX = mapX(xVal);
    const velArrowScale = 20;
    const accArrowScale = 15;
    const dotRadius = 8;
    
    if(Math.abs(aVal) > 0.05) {
        const sign = Math.sign(aVal);
        const startX = objX + sign * dotRadius;
        drawArrow(animCtx, startX, centerY - 15, startX + aVal * accArrowScale, centerY - 15, '#FC6255', 3);
    }
    if(Math.abs(vVal) > 0.05) {
        const sign = Math.sign(vVal);
        const startX = objX + sign * dotRadius;
        drawArrow(animCtx, startX, centerY, startX + vVal * velArrowScale, centerY, '#83C167', 3);
    }
    
    // Draw dot with glow
    animCtx.shadowColor = '#58C4DD';
    animCtx.shadowBlur = 10;
    animCtx.fillStyle = '#58C4DD';
    animCtx.beginPath();
    animCtx.arc(objX, centerY, 8, 0, Math.PI * 2);
    animCtx.fill();
    animCtx.shadowBlur = 0;
    animCtx.strokeStyle = '#fff';
    animCtx.lineWidth = 1.5;
    animCtx.stroke();
}

function drawArrow(ctx, fromX, fromY, toX, toY, color, width) {
    const headlen = 10; 
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.lineTo(toX, toY);
    ctx.fill();
    ctx.shadowBlur = 0;
}

window.onload = init;