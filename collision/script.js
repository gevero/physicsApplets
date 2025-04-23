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
        // Set isStatic: false for dynamic bodies
        boxA = Bodies.rectangle(canvasWidth * 0.25, bodyY, boxSize, boxSize, { label: "boxA", restitution: restitutionVal, friction: 0, frictionAir: 0, frictionStatic: 0, inertia: Infinity, inverseInertia: 0, mass: m1, render: { fillStyle: colorA }, isStatic: false });
        Body.setVelocity(boxA, { x: v1, y: 0 }); // Set initial velocity state

        boxB = Bodies.rectangle(canvasWidth * 0.75, bodyY, boxSize, boxSize, { label: "boxB", restitution: restitutionVal, friction: 0, frictionAir: 0, frictionStatic: 0, inertia: Infinity, inverseInertia: 0, mass: m2, render: { fillStyle: colorB }, isStatic: false });
        Body.setVelocity(boxB, { x: v2, y: 0 }); // Set initial velocity state

        // Create the ground (flat plane) - Keep this static
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
            // Calculate simulation time based on engine timestamp
            simulationTime = (engine.timing.timestamp / 1000);

            // *** REMOVED: Manual position, velocity, and angle correction. ***
            // *** Matter.js physics engine should handle these based on static ground and collision response. ***
            // if (boxA) { Body.setPosition(boxA, { x: boxA.position.x, y: bodyY }); Body.setVelocity(boxA, { x: boxA.velocity.x, y: 0 }); Body.setAngularVelocity(boxA, 0); Body.setAngle(boxA, 0); }
            // if (boxB) { Body.setPosition(boxB, { x: boxB.position.x, y: bodyY }); Body.setVelocity(boxB, { x: boxB.velocity.x, y: 0 }); Body.setAngularVelocity(boxB, 0); Body.setAngle(boxB, 0); }

            // Record data for charts and display
            calculateAndRecordData(simulationTime);
        });

        Events.on(engine, 'collisionStart', (event) => {
            if (isPaused || pendingInelasticCollision) return;
            const pairs = event.pairs;
            for (let i = 0; i < pairs.length; i++) {
                 const pair = pairs[i];
                 // Ensure the collision is between boxA and boxB, and not with the ground
                 // Also ensure both bodies still exist before processing
                 const isTargetCollision = boxA && boxB && ((pair.bodyA === boxA && pair.bodyB === boxB) || (pair.bodyA === bodyB && pair.bodyB === boxA));

                 if (isTargetCollision && collisionType === 'inelastic') {
                     // Get the bodies involved in the collision pair
                     const bodyA = pair.bodyA;
                     const bodyB = pair.bodyB;

                     // Ensure we are using the correct boxA/boxB references in case one was removed
                     const currentBoxA = World.get(world, boxA.id, 'body');
                     const currentBoxB = World.get(world, boxB.id, 'body');

                     // Check if the colliding bodies are the current boxA and boxB
                     const isCurrentCollision = (currentBoxA === bodyA && currentBoxB === bodyB) || (currentBoxA === bodyB && currentBoxB === bodyA);

                     if (isCurrentCollision) {
                         const vAx = bodyA.velocity.x;
                         const vBx = bodyB.velocity.x;
                         const mA = bodyA.mass;
                         const mB = bodyB.mass;

                         // Prevent division by zero or invalid mass
                         if (isNaN(mA) || isNaN(mB) || (mA + mB) === 0) {
                             console.warn("Invalid mass detected during inelastic collision calculation.");
                             continue; // Skip this collision
                         }

                         // Calculate final velocity using momentum conservation
                         const finalVx = (mA * vAx + mB * vBx) / (mA + mB);
                         const totalMass = mA + mB;

                         // Flag the collision for processing in afterUpdate
                         // Determine which body to keep (arbitrarily keep bodyA from the pair)
                         pendingInelasticCollision = { bodyToKeep: bodyA, bodyToRemove: bodyB, finalVx, totalMass };

                         // Stop processing further pairs for this collision event
                         break;
                     }
                 }
            }
        });

         Events.on(engine, 'afterUpdate', (event) => {
             // Process pending inelastic collision after the engine update
             if (pendingInelasticCollision) {
                 const { bodyToKeep, bodyToRemove, finalVx, totalMass } = pendingInelasticCollision;

                 // Ensure both bodies still exist in the world before attempting to modify
                 const bodyToKeepExists = World.get(world, bodyToKeep.id, 'body');
                 const bodyToRemoveExists = World.get(world, bodyToRemove.id, 'body');

                 if (bodyToKeepExists && bodyToRemoveExists) {
                     // Remove the body that is being absorbed
                     World.remove(world, bodyToRemove);

                     // Update the mass and velocity of the remaining body
                     Body.setMass(bodyToKeep, totalMass);
                     Body.setVelocity(bodyToKeep, { x: finalVx, y: 0 });

                     // Update the global boxA/boxB references if one was removed
                     if (bodyToRemove === boxA) boxA = null;
                     if (bodyToRemove === boxB) boxB = null;

                 } else {
                     console.warn("Skipping inelastic process: one or both bodies missing from world.");
                 }

                 // Clear the pending collision flag
                 pendingInelasticCollision = null;
             }
         });
    } // End setupEventListeners


    // --- Physics Calculations & Data Recording ---
    function calculateAndRecordData(time) {
        const numericTime = parseFloat(time);
        if (isNaN(numericTime)) return;

        let p1 = 0, p2 = 0, ke1 = 0, ke2 = 0;

        // Calculate even if paused for the initial state T=0
        if (boxA) {
            const v1 = boxA.velocity.x;
            const m1 = boxA.mass;
            p1 = m1 * v1;
            ke1 = 0.5 * m1 * v1 * v1;
        }
        if (boxB) {
            const v2 = boxB.velocity.x;
            const m2 = boxB.mass;
            p2 = m2 * v2;
            ke2 = 0.5 * m2 * v2 * v2;
        }

        const totalMomentum = p1 + p2;
        const totalEnergy = ke1 + ke2;

        // Update the live data display
        updateDataDisplay(numericTime, totalMomentum, totalEnergy);

        // Only add data if it's different from the last point or if arrays are empty (for T=0)
        // This prevents adding duplicate data points if the engine updates rapidly but time doesn't change significantly
        const lastTime = chartData.labels.length > 0 ? parseFloat(chartData.labels[chartData.labels.length - 1]) : -1;

        // Add data point if time has advanced or if it's the very first data point
        if (chartData.labels.length === 0 || numericTime > lastTime) {
            chartData.labels.push(numericTime.toFixed(2)); // Store time as string for chart labels
            chartData.momentum.p1.push(p1);
            chartData.momentum.p2.push(p2);
            chartData.momentum.pTotal.push(totalMomentum);
            chartData.energy.ke1.push(ke1);
            chartData.energy.ke2.push(ke2);
            chartData.energy.keTotal.push(totalEnergy);

            // Update charts only when new data is added
            updateCharts(numericTime);
        }
    }

    // --- Update Live Data Display ---
    function updateDataDisplay(time, momentum = 0, energy = 0) {
         timeDisplay.textContent = time.toFixed(2);
         momentumDisplay.textContent = momentum.toFixed(2);
         energyDisplay.textContent = energy.toFixed(2);
    }

    // --- Chart.js Setup ---
    function setupCharts() {
        // Destroy existing charts if they exist
        if (momentumChart) momentumChart.destroy();
        if (energyChart) energyChart.destroy();

        // Get theme-dependent colors
        const colorP1 = getCssVariable('--color-line-p1');
        const colorP2 = getCssVariable('--color-line-p2');
        const colorPTotal = getCssVariable('--color-total-mom');
        const colorKE1 = getCssVariable('--color-line-ke1');
        const colorKE2 = getCssVariable('--color-line-ke2');
        const colorKETotal = getCssVariable('--color-total-ke');
        const gridColor = getCssVariable('--chart-grid-color');
        const tickColor = getCssVariable('--chart-tick-color');
        const titleColor = getCssVariable('--chart-title-color');
        const legendColor = tickColor; // Use tick color for legend text
        const baseFontSize = 12;
        const largeFontSize = 14;

        // Define line thickness for charts
        const lineThickness = 2.5;
        const totalLineThickness = 4; // Thicker line for total values

        // Base options common to both charts
        const chartOptionsBase = {
            responsive: true, // Charts are responsive
            maintainAspectRatio: false, // Allows setting height via CSS
            animation: false, // Disable Chart.js animation for real-time data
            plugins: {
                legend: { // Legend configuration
                    display: true,
                    position: 'top',
                    labels: {
                        color: legendColor, // Legend text color
                        font: { size: largeFontSize } // Legend font size
                    }
                },
                tooltip: {
                    enabled: true // Enable tooltips on hover
                }
            },
            elements: {
                point: { radius: 0 }, // No data points shown on lines
                line: { tension: 0.1 } // Slight curve to lines
            }
        };

        // X-axis (Time) options
        const timeScaleOptions = {
            type: 'linear', // Use linear scale for time
            title: {
                display: true,
                text: 'Time (s)', // Axis title
                color: titleColor, // Title color
                font: { size: largeFontSize } // Title font size
            },
            min: 0, // Start time at 0
            grid: { color: gridColor }, // Grid line color
            ticks: {
                color: tickColor, // Tick label color
                font: { size: baseFontSize }, // Tick label font size
                stepSize: 1 // Suggest tick step size
            }
        };

        // Base Y-axis options
        const yAxisOptions = {
            title: {
                display: true,
                text: 'Value', // Default title, overridden below
                color: titleColor,
                font: { size: largeFontSize }
            },
            grid: { color: gridColor },
            ticks: {
                color: tickColor,
                font: { size: baseFontSize }
            }
        };

        // Momentum Chart Setup
        const momentumCtx = document.getElementById('momentumChart').getContext('2d');
        momentumChart = new Chart(momentumCtx, {
            type: 'line',
            data: {
                labels: chartData.labels, // Use time labels
                datasets: [
                    { label: 'P1', data: chartData.momentum.p1, borderColor: colorP1, borderWidth: lineThickness, fill: false }, // Data for momentum of body A
                    { label: 'P2', data: chartData.momentum.p2, borderColor: colorP2, borderWidth: lineThickness, fill: false }, // Data for momentum of body B
                    { label: 'P Total', data: chartData.momentum.pTotal, borderColor: colorPTotal, borderWidth: totalLineThickness, borderDash: [5, 5], fill: false } // Data for total momentum
                ]
            },
            options: {
                ...chartOptionsBase, // Apply base options
                scales: {
                    x: timeScaleOptions, // Apply time scale options to x-axis
                    y: {
                        ...yAxisOptions, // Apply base y-axis options
                        beginAtZero: false, // Momentum can be negative
                        title: { ...yAxisOptions.title, text: 'Momentum (kg m/s)'} // Specific y-axis title
                    }
                }
            }
        });

        // Kinetic Energy Chart Setup
        const energyCtx = document.getElementById('energyChart').getContext('2d');
        energyChart = new Chart(energyCtx, {
            type: 'line',
            data: {
                labels: chartData.labels, // Use time labels
                datasets: [
                    { label: 'KE1', data: chartData.energy.ke1, borderColor: colorKE1, borderWidth: lineThickness, fill: false }, // Data for KE of body A
                    { label: 'KE2', data: chartData.energy.ke2, borderColor: colorKE2, borderWidth: lineThickness, fill: false }, // Data for KE of body B
                    { label: 'KE Total', data: chartData.energy.keTotal, borderColor: colorKETotal, borderWidth: totalLineThickness, borderDash: [5, 5], fill: false } // Data for total KE
                ]
            },
            options: {
                ...chartOptionsBase, // Apply base options
                scales: {
                    x: timeScaleOptions, // Apply time scale options to x-axis
                    y: {
                         ...yAxisOptions, // Apply base y-axis options
                        beginAtZero: true, // Kinetic energy is always non-negative
                        title: { ...yAxisOptions.title, text: 'Kinetic Energy (J)'} // Specific y-axis title
                    }
                }
            }
        });

         // Initial update to render empty charts with axes and labels
         mapDataToChartFormat(); // Populate with empty data initially
         momentumChart.update('none');
         energyChart.update('none');
    } // End setupCharts

    // --- Map Data to Chart Format ---
    // Converts the raw data arrays into the format Chart.js expects for line charts ({x, y})
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
            chartData.energy.keTotal.forEach((val, index) => {
                 // Ensure KE Total is calculated correctly even if one body is null after inelastic collision
                 const ke1 = chartData.energy.ke1[index] || 0;
                 const ke2 = chartData.energy.ke2[index] || 0;
                 chartData.energy.keTotal[index] = ke1 + ke2;
            });
            energyChart.data.datasets[2].data = chartData.energy.keTotal.map(mapFn);
        }
    }

    // --- Update Charts ---
    // Updates the chart data and redraws the charts
    function updateCharts(currentTime) {
         if (!momentumChart || !energyChart) return;

         mapDataToChartFormat(); // Update data points in the chart objects

         // Update charts without animation
         momentumChart.update('none');
         energyChart.update('none');
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
            // Ensure the engine's time scale is set before starting the runner
            if (engine) engine.timing.timeScale = currentTimeScale;
            // Start the Matter.js runner to begin the simulation ticks
            if (runner && engine) Runner.start(runner, engine);
        } else {
            // Pause the simulation
            console.log("Pausing runner...");
            isPaused = true;
            startButton.textContent = "Start"; // Change button text to Start
            // Stop the Matter.js runner to pause the simulation ticks
            if (runner) Runner.stop(runner);
        }
    });

    // RESET BUTTON
    resetButton.addEventListener('click', () => {
        console.log("Set/Reset button clicked");
        // Reset the simulation and UI to the initial state
        setupSimulation();
        // Ensure the Start button text is 'Start' after reset
        startButton.textContent = "Start";
    });


    // TIMESCALE SLIDER
     timeScaleSlider.addEventListener('input', (event) => {
        // Update the current time scale based on the slider value
        currentTimeScale = parseFloat(event.target.value);
        // Update the displayed value next to the slider
        timeScaleValueDisplay.textContent = `${currentTimeScale.toFixed(1)}x`;
        // Apply the new time scale to the Matter.js engine immediately
        if (engine) {
             engine.timing.timeScale = currentTimeScale;
        }
    });

    // THEME TOGGLE
    themeToggleButton.addEventListener('click', () => {
        // Toggle between 'light' and 'dark' themes
        currentTheme = (currentTheme === 'light') ? 'dark' : 'light';
        // Save the selected theme to local storage
        localStorage.setItem('theme', currentTheme);
        // Re-setup the simulation to apply the new theme and reset the state
        // setupSimulation also ensures the simulation starts paused after theme change
        setupSimulation();
    });

    // --- Initial Load ---
    // Setup the simulation when the DOM is fully loaded.
    // The simulation starts paused by default as per the isPaused variable initialization.
    setupSimulation();

}); // End DOMContentLoaded
