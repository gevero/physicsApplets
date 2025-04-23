// Ensure strict mode and basic error handling
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // Module aliases
    const Engine = Matter.Engine,
          Render = Matter.Render,
          Runner = Matter.Runner,
          Bodies = Matter.Bodies, // Using Bodies.rectangle
          Composite = Matter.Composite,
          Events = Matter.Events,
          Body = Matter.Body,
          World = Matter.World;

    // --- DOM Elements ---
    const themeToggleButton = document.getElementById('themeToggle');
    const canvasContainer = document.getElementById('simulationCanvasContainer');
    const startButton = document.getElementById('startButton'); // Start/Pause button
    const resetButton = document.getElementById('resetButton'); // Reset button
    const mass1Input = document.getElementById('mass1');
    const vel1Input = document.getElementById('vel1');
    const mass2Input = document.getElementById('mass2');
    const vel2Input = document.getElementById('vel2');
    const elasticRadio = document.getElementById('elastic');
    const inelasticRadio = document.getElementById('inelastic');
    const timeScaleSlider = document.getElementById('timeScale');
    const timeScaleValueDisplay = document.getElementById('timeScaleValue');
    // Get references to the data display spans (still needed to update text)
    const timeDisplay = document.getElementById('time');
    const momentumDisplay = document.getElementById('totalMomentum');
    const energyDisplay = document.getElementById('totalEnergy');
     // The dataDisplay div itself is not needed as a JS variable for these changes

    // --- Simulation & State Variables ---
    let engine;
    let render;
    let runner;
    let world;
    let boxA, boxB; // Are rectangles (squares)
    let ground; // Represents the flat plane
    let collisionType = 'elastic';
    let isPaused = true; // START PAUSED
    let currentTimeScale = 1.0;
    let simulationTime = 0;
    let pendingInelasticCollision = null;
    let currentTheme = localStorage.getItem('theme') || 'light';

    // --- Chart Variables ---
    let momentumChart, energyChart;
    let chartData = {
        labels: [], // time (numeric)
        momentum: { p1: [], p2: [], pTotal: [] },
        energy: { ke1: [], ke2: [], keTotal: [] }
    };

    // --- Helper Functions ---
    function getCssVariable(variableName) {
        return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    }

    function applyTheme() {
        document.body.classList.toggle('dark-theme', currentTheme === 'dark');
    }

    // --- Initialization and Reset ---
    function setupSimulation() {
        console.log("Setting up simulation (paused) for theme:", currentTheme);
        applyTheme();

        // Clear previous simulation robustly
        if (runner) Runner.stop(runner); runner = null;
        if (engine) {
             Events.off(engine); World.clear(world); Engine.clear(engine);
             engine = null; world = null;
        }
        if (render) {
            Render.stop(render); if (render.canvas) render.canvas.remove();
             render.textures = {}; render = null;
        }

        // Reset state
        boxA = null;
        boxB = null;
        ground = null;
        simulationTime = 0;
        pendingInelasticCollision = null;
        isPaused = true; // Ensure starts paused
        startButton.textContent = "Start"; // Set button text to Start

        // Reset chart data structure
        chartData = {
            labels: [],
            momentum: { p1: [], p2: [], pTotal: [] },
            energy: { ke1: [], ke2: [], keTotal: [] }
        };

        // Setup or Clear Charts
        setupCharts(); // Will read current theme vars

        // Create engine & world
        engine = Engine.create();
        world = engine.world;
        engine.gravity.y = 0; // Still no gravity in the y direction
        engine.timing.timeScale = currentTimeScale;

        // Create renderer (MUST run to show initial state)
        const canvasWidth = canvasContainer.clientWidth > 0 ? canvasContainer.clientWidth : 600;
        const canvasHeight = canvasContainer.clientHeight > 0 ? canvasContainer.clientHeight : 120;
         render = Render.create({
            element: canvasContainer, engine: engine,
            options: { width: canvasWidth, height: canvasHeight, wireframes: false, background: getCssVariable('--canvas-bg-color'), showAngleIndicator: false }
        });
        Render.run(render); // Start renderer loop

        // Create runner (but don't start it yet)
        runner = Runner.create();

        // Get parameters
        const m1 = Math.max(1, parseFloat(mass1Input.value) || 1);
        const v1 = parseFloat(vel1Input.value) || 0;
        const m2 = Math.max(1, parseFloat(mass2Input.value) || 1);
        const v2 = parseFloat(vel2Input.value) || 0;
        collisionType = inelasticRadio.checked ? 'inelastic' : 'elastic';
        const restitutionVal = collisionType === 'elastic' ? 1.0 : 0.0;

        // Define the y position for the ground and bodies to sit on
        const groundHeight = 20;
        const groundY = canvasHeight - groundHeight / 2; // Position for the ground line (center of the ground rectangle)
        const boxSize = 40; // Size of the square bodies
        const bodyY = groundY - groundHeight / 2 - boxSize / 2; // Bodies sit on top of the ground


        const colorA = getCssVariable('--color-body-a');
        const colorB = getCssVariable('--color-body-b');

        // Create Bodies (Rectangles for squares)
        boxA = Bodies.rectangle(canvasWidth * 0.25, bodyY, boxSize, boxSize, { label: "boxA", restitution: restitutionVal, friction: 0, frictionAir: 0, frictionStatic: 0, inertia: Infinity, inverseInertia: 0, mass: m1, render: { fillStyle: colorA } });
        Body.setVelocity(boxA, { x: v1, y: 0 }); // Set initial velocity state

        boxB = Bodies.rectangle(canvasWidth * 0.75, bodyY, boxSize, boxSize, { label: "boxB", restitution: restitutionVal, friction: 0, frictionAir: 0, frictionStatic: 0, inertia: Infinity, inverseInertia: 0, mass: m2, render: { fillStyle: colorB } });
        Body.setVelocity(boxB, { x: v2, y: 0 }); // Set initial velocity state

        // Create the ground (flat plane)
        ground = Bodies.rectangle(canvasWidth / 2, groundY, canvasWidth, groundHeight, {
            isStatic: true, // Make it static so it doesn't move
            render: {
                fillStyle: '#666' // Color of the ground
            }
        });


        // Add bodies and ground
        Composite.add(world, [boxA, boxB, ground]);

        // Setup Event Listeners
        setupEventListeners();

        // Initial display state
        updateDataDisplay(0); // Show 0 time, initial calculated E/P might be non-zero
        calculateAndRecordData(0); // Calculate initial data point for graphs


        console.log("Setup Complete. Initial state rendered. Engine Paused.");

    } // End setupSimulation


    // --- Event Handling Setup ---
    function setupEventListeners() {
        if (!engine) return;

        Events.on(engine, 'beforeUpdate', (event) => {
            if (!engine || isPaused) return; // Skip updates if paused
            simulationTime = (engine.timing.timestamp / 1000);
            // Keep bodies on the ground plane and prevent rotation
             const groundHeight = 20; // Match ground height
             const bodySize = 40; // Match body size
             const groundY = render ? render.options.height - groundHeight / 2 : 100 - groundHeight / 2;
             const bodyY = groundY - groundHeight / 2 - bodySize / 2;

            if (boxA) { Body.setPosition(boxA, { x: boxA.position.x, y: bodyY }); Body.setVelocity(boxA, { x: boxA.velocity.x, y: 0 }); Body.setAngularVelocity(boxA, 0); Body.setAngle(boxA, 0); }
            if (boxB) { Body.setPosition(boxB, { x: boxB.position.x, y: bodyY }); Body.setVelocity(boxB, { x: boxB.velocity.x, y: 0 }); Body.setAngularVelocity(boxB, 0); Body.setAngle(boxB, 0); }
            calculateAndRecordData(simulationTime);
        });

        Events.on(engine, 'collisionStart', (event) => {
            if (isPaused || pendingInelasticCollision) return;
            const pairs = event.pairs;
            for (let i = 0; i < pairs.length; i++) {
                 // ... (inelastic collision flagging logic remains the same) ...
                 const pair = pairs[i];
                 // Ensure the collision is between boxA and boxB, and not with the ground
                 const isTargetCollision = boxA && boxB && ((pair.bodyA === boxA && pair.bodyB === boxB) || (pair.bodyA === boxB && pair.bodyB === boxA));
                 if (isTargetCollision && collisionType === 'inelastic') {
                     const bodyA = boxA; const bodyB = bodyB; const vAx = bodyA.velocity.x; const vBx = bodyB.velocity.x; const mA = bodyA.mass; const mB = bodyB.mass;
                     if (isNaN(mA) || isNaN(mB) || (mA + mB) === 0) continue;
                     const finalVx = (mA * vAx + mB * vBx) / (mA + mB); const totalMass = mA + mB;
                     pendingInelasticCollision = { bodyToKeep: bodyA, bodyToRemove: bodyB, finalVx, totalMass }; break;
                 }
            }
        });

         Events.on(engine, 'afterUpdate', (event) => {
             // ... (inelastic collision processing logic remains the same) ...
             if (pendingInelasticCollision) {
                 const { bodyToKeep, bodyToRemove, finalVx, totalMass } = pendingInelasticCollision;
                 if (World.get(world, bodyToKeep.id, 'body') && World.get(world, bodyToRemove.id, 'body')) {
                     World.remove(world, bodyToRemove); Body.setMass(bodyToKeep, totalMass); Body.setVelocity(bodyToKeep, { x: finalVx, y: 0 });
                     if (bodyToRemove === boxA) boxA = null; if (bodyToRemove === boxB) boxB = null;
                 } else { console.warn("Skipping inelastic process: body missing"); }
                 pendingInelasticCollision = null;
             }
         });
    } // End setupEventListeners


    // --- Physics Calculations & Data Recording ---
    function calculateAndRecordData(time) {
        const numericTime = parseFloat(time); if (isNaN(numericTime)) return;
        let p1 = 0, p2 = 0, ke1 = 0, ke2 = 0;
        // Calculate even if paused for the initial state T=0
        if (boxA) { const v1 = boxA.velocity.x, m1 = boxA.mass; p1 = m1 * v1; ke1 = 0.5 * m1 * v1 * v1; }
        if (boxB) { const v2 = boxB.velocity.x, m2 = boxB.mass; p2 = m2 * v2; ke2 = 0.5 * m2 * v2 * v2; }
        const totalMomentum = p1 + p2; const totalEnergy = ke1 + ke2;
        updateDataDisplay(numericTime, totalMomentum, totalEnergy);

        // Only add data if it's different from the last point or if arrays are empty (for T=0)
        const lastTime = chartData.labels.length > 0 ? parseFloat(chartData.labels[chartData.labels.length - 1]) : -1;
        if (chartData.labels.length === 0 || numericTime > lastTime) {
            chartData.labels.push(numericTime.toFixed(2));
            chartData.momentum.p1.push(p1); chartData.momentum.p2.push(p2); chartData.momentum.pTotal.push(totalMomentum);
            chartData.energy.ke1.push(ke1); chartData.energy.ke2.push(ke2); chartData.energy.keTotal.push(totalEnergy);
            updateCharts(numericTime); // Update charts only when adding data
        }
    }

    // --- Update Live Data Display ---
    function updateDataDisplay(time, momentum = 0, energy = 0) {
         timeDisplay.textContent = time.toFixed(2); momentumDisplay.textContent = momentum.toFixed(2); energyDisplay.textContent = energy.toFixed(2);
    }

    // --- Chart.js Setup ---
    function setupCharts() {
        if (momentumChart) momentumChart.destroy();
        if (energyChart) energyChart.destroy();

        const colorP1 = getCssVariable('--color-line-p1');
        const colorP2 = getCssVariable('--color-line-p2');
        const colorPTotal = getCssVariable('--color-total-mom');
        const colorKE1 = getCssVariable('--color-line-ke1');
        const colorKE2 = getCssVariable('--color-line-ke2');
        const colorKETotal = getCssVariable('--color-total-ke');
        const gridColor = getCssVariable('--chart-grid-color');
        const tickColor = getCssVariable('--chart-tick-color');
        const titleColor = getCssVariable('--chart-title-color');
        const legendColor = tickColor;
        const baseFontSize = 12;
        const largeFontSize = 14;

        // Increased line thickness
        const lineThickness = 2.5;
        const totalLineThickness = 4;


        const chartOptionsBase = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: true, position: 'top', labels: { color: legendColor, font: { size: largeFontSize } } }, tooltip: { enabled: true } }, elements: { point: { radius: 0 }, line: { tension: 0.1 } } }; // Tension moved to here


        const timeScaleOptions = { type: 'linear', title: { display: true, text: 'Time (s)', color: titleColor, font: { size: largeFontSize } }, min: 0, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: baseFontSize }, stepSize: 1 } };
        const yAxisOptions = { title: { display: true, text: 'Value', color: titleColor, font: { size: largeFontSize } }, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: baseFontSize } } };

        const momentumCtx = document.getElementById('momentumChart').getContext('2d');
        momentumChart = new Chart(momentumCtx, {
            type: 'line',
            data: {
                datasets: [
                    { label: 'P1', data: [], borderColor: colorP1, borderWidth: lineThickness }, // Individual line thickness
                    { label: 'P2', data: [], borderColor: colorP2, borderWidth: lineThickness }, // Individual line thickness
                    { label: 'P Total', data: [], borderColor: colorPTotal, borderWidth: totalLineThickness, borderDash: [5, 5] } // Total line thickness
                ]
            },
            options: {
                ...chartOptionsBase,
                scales: { x: timeScaleOptions, y: { ...yAxisOptions, beginAtZero: false, title: { ...yAxisOptions.title, text: 'Momentum (kg m/s)'} } }
            }
        });

        const energyCtx = document.getElementById('energyChart').getContext('2d');
        energyChart = new Chart(energyCtx, {
            type: 'line',
            data: {
                datasets: [
                    { label: 'KE1', data: [], borderColor: colorKE1, borderWidth: lineThickness }, // Individual line thickness
                    { label: 'KE2', data: [], borderColor: colorKE2, borderWidth: lineThickness }, // Individual line thickness
                    { label: 'KE Total', data: [], borderColor: colorKETotal, borderWidth: totalLineThickness, borderDash: [5, 5] } // Total line thickness
                ]
            },
            options: {
                ...chartOptionsBase,
                scales: { x: timeScaleOptions, y: { ...yAxisOptions, beginAtZero: true, title: { ...yAxisOptions.title, text: 'Kinetic Energy (J)'} } }
            }
        });

         mapDataToChartFormat(); // Populate with empty data
         momentumChart.update('none'); energyChart.update('none'); // Initial render
    } // End setupCharts

    // --- Map Data to Chart Format ---
    function mapDataToChartFormat() {
        const mapFn = (value, index) => ({ x: parseFloat(chartData.labels[index] || 0), y: value });
        if (momentumChart) {
            momentumChart.data.datasets[0].data = chartData.momentum.p1.map(mapFn);
            momentumChart.data.datasets[1].data = chartData.momentum.p2.map(mapFn);
            momentumChart.data.datasets[2].data = chartData.momentum.pTotal.map(mapFn);
        }
        if (energyChart) {
            energyChart.data.datasets[0].data = chartData.energy.ke1.map(mapFn);
            energyChart.data.datasets[1].data = chartData.energy.ke2.map(mapFn);
            energyChart.data.datasets[2].data = chartData.energy.keTotal.map(mapFn);
        }
    }

    // --- Update Charts ---
    function updateCharts(currentTime) {
         if (!momentumChart || !energyChart) return;
         mapDataToChartFormat(); // Update data points
         momentumChart.update('none'); energyChart.update('none'); // Redraw
    }

    // --- UI Event Listeners ---

    // START / PAUSE BUTTON
    startButton.addEventListener('click', () => {
        console.log("Start/Pause button clicked");
        if (isPaused) {
            // Start the simulation
            console.log("Starting runner...");
            isPaused = false;
            startButton.textContent = "Pause"; // Change button text to Pause
            engine.timing.timeScale = currentTimeScale; // Ensure correct speed
            Runner.start(runner, engine); // Use Runner.start to begin ticks
        } else {
            // Pause the simulation
            console.log("Pausing runner...");
            isPaused = true;
            startButton.textContent = "Start"; // Change button text to Start
            Runner.stop(runner); // Stop the runner Ticks
        }
    });

    // RESET BUTTON
    resetButton.addEventListener('click', () => {
        console.log("Set/Reset button clicked");
        setupSimulation(); // Call setupSimulation to reset the simulation
        startButton.textContent = "Start"; // Ensure Start button text is 'Start' after reset
    });


    // TIMESCALE SLIDER
     timeScaleSlider.addEventListener('input', (event) => {
        currentTimeScale = parseFloat(event.target.value);
        timeScaleValueDisplay.textContent = `${currentTimeScale.toFixed(1)}x`;
        if (engine) { // Apply immediately if engine exists
             engine.timing.timeScale = currentTimeScale;
        }
    });

    // THEME TOGGLE
    themeToggleButton.addEventListener('click', () => {
        currentTheme = (currentTheme === 'light') ? 'dark' : 'light';
        localStorage.setItem('theme', currentTheme);
        setupSimulation(); // Re-run setup to apply theme and reset (starts paused)
    });

    // --- Initial Load ---
    setupSimulation(); // Setup on load, starts paused

}); // End DOMContentLoaded