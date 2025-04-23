import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration ---
const TEXTURE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-day.jpg';
const INITIAL_ROTATION_SPEED_VISUAL = 0.002; // Initial visual rotation speed
const MAX_ROTATION_SPEED_VISUAL = 0.01;     // Maximum visual rotation speed

// Actual Earth's angular velocity (radians per second)
const EARTH_ANGULAR_VELOCITY = 7.292115e-5; // rad/s

// --- Coriolis Visualization Config ---
const GLOBE_OPACITY = 0.85; // Make globe transparent (0 to 1)

// Base visual lengths for arrows (will be scaled)
const OMEGA_BASE_LENGTH_VISUAL = 0.25;

// Arrow scaling parameters - adjusted for better visual proportionality
const VELOCITY_ARROW_SCALE_FACTOR = 0.03; // Multiplier for velocity magnitude
const CORIOLIS_ARROW_SCALE_FACTOR = 5000; // Multiplier for acceleration magnitude (tuned for m/s^2)

// Minimum and Maximum arrow body length to control visibility and prevent gigantism
const MIN_ARROW_BODY_LENGTH = 0.01;
const MAX_ARROW_BODY_LENGTH = 0.5;


// Adjusted Arrow Visuals - Fixed dimensions for head and body radius
const ARROW_BODY_RADIUS = 0.008;
const ARROW_HEAD_RADIUS = 0.025;
const ARROW_HEAD_LENGTH = 0.05;


// --- State Variables ---
let scene, camera, renderer, globeMesh, controls;
let isRotating = true;
let visualRotationSpeed = INITIAL_ROTATION_SPEED_VISUAL; // Use visual speed for animation
let isDarkMode = true; // Default to dark mode

// --- Coriolis Variables ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionLocal = null; // Store intersection point in GLOBE'S LOCAL coordinates
// Use the actual Earth's angular velocity for calculation
const omegaLocalVector = new THREE.Vector3(0, EARTH_ANGULAR_VELOCITY, 0); // Omega in Globe's local frame (aligned with local Y)
const arrowObjects = { velocity: null, omega: null, coriolis: null }; // Use Object3D for custom arrows

// --- DOM Elements ---
const container = document.getElementById('globe-container');
const toggleRotationBtn = document.getElementById('toggleRotation');
const speedSlider = document.getElementById('speedSlider');
const speedValueSpan = document.getElementById('speedValue');
const toggleThemeBtn = document.getElementById('toggleTheme');
// Removed mass input
const v_ns_input = document.getElementById('v_ns');
const v_ew_input = document.getElementById('v_ew');
const coriolisAccelerationMagnitudeDisplay = document.getElementById('coriolisAccelerationMagnitude'); // Changed ID

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 2.5; // Move camera slightly closer for smaller arrows

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    // Globe Geometry and Material
    const geometry = new THREE.SphereGeometry(1, 64, 32); // Radius 1 meter (scale factor)
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(TEXTURE_URL, undefined, undefined, (err) => {
        console.error('Error loading texture:', err);
        globeMesh.material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true });
    });

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        metalness: 0.1, // Keep some definition
        roughness: 0.8,
        transparent: true, // Enable transparency
        opacity: GLOBE_OPACITY, // Set opacity level
        // depthWrite: false // Consider adding if transparency causes render issues with arrows
    });
    globeMesh = new THREE.Mesh(geometry, material);
    scene.add(globeMesh); // Add globe to the main scene

    // Controls (OrbitControls)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 1.2; // Adjust min distance
    controls.maxDistance = 10;
    controls.rotateSpeed = 0.3;

    // --- Event Listeners ---
    window.addEventListener('resize', onWindowResize, false);
    renderer.domElement.addEventListener('dblclick', onDoubleClick, false);
    toggleRotationBtn.addEventListener('click', toggleRotation);
    speedSlider.addEventListener('input', handleSpeedChange);
    toggleThemeBtn.addEventListener('click', toggleTheme);
    v_ns_input.addEventListener('input', onVectorInputChange);
    v_ew_input.addEventListener('input', onVectorInputChange);

    // --- Initial UI Setup ---
    updateRotationButtonText();
    updateThemeButtonText(); // Reflects initial dark mode state
    updateSpeedSliderDisplay();
    // No need to explicitly explicitly add 'dark-theme' class here, it's done in HTML
}

// --- Custom Arrow Function ---
function createCustomArrow(direction, origin, bodyLength, color, headLength, headRadius, bodyRadius) {
    // Ensure direction is normalized
    direction.normalize();

    // Create the arrow body (Cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyLength, 8);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

    // Position the body so its base is at the origin (temporarily)
    body.position.y = bodyLength / 2;

    // Create the arrow head (Cone)
    const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 8);
    const headMaterial = new THREE.MeshBasicMaterial({ color: color });
    const head = new THREE.Mesh(headGeometry, headMaterial);

    // Position the head at the end of the body
    head.position.y = bodyLength + headLength / 2;

    // Create a group to hold the body and head
    const arrow = new THREE.Group();
    arrow.add(body);
    arrow.add(head);

    // Set the arrow's origin
    arrow.position.copy(origin);

    // Orient the arrow to the direction vector
    // Default cylinder/cone is along the Y axis, so we need to rotate to the desired direction
    const up = new THREE.Vector3(0, 1, 0);
    arrow.quaternion.setFromUnitVectors(up, direction);

    return arrow;
}


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Globe rotation is handled by Three.js hierarchy since arrows are children now
    if (isRotating) {
         // We rotate the globe mesh itself using the visual speed
         globeMesh.rotation.y += visualRotationSpeed;
    }

    renderer.render(scene, camera);
}

// --- Event Handlers ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onDoubleClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Intersect with the globeMesh
    const intersects = raycaster.intersectObject(globeMesh);

    if (intersects.length > 0) {
        // Get intersection point in WORLD coordinates
        const intersectionWorld = intersects[0].point;
        // Convert the WORLD intersection point to the GLOBE's LOCAL coordinate system
        intersectionLocal = globeMesh.worldToLocal(intersectionWorld.clone());
        console.log("Intersection Local:", intersectionLocal);
        updateVectors(); // Draw and calculate vectors at the new local point
    }
}

// Combined input change handler for velocity
function onVectorInputChange() {
    if (intersectionLocal) {
        updateVectors();
    }
}


function toggleRotation() {
    isRotating = !isRotating;
    updateRotationButtonText();
}

function handleSpeedChange() {
    const sliderValue = parseFloat(speedSlider.value);
    // The slider controls the VISUAL rotation speed, not the physics calculation
    visualRotationSpeed = (sliderValue / 100) * MAX_ROTATION_SPEED_VISUAL;
    updateSpeedSliderDisplay();
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-theme');
    updateThemeButtonText();
}

// --- Vector Visualization & Calculation ---

function clearVectors() {
    // Remove velocity and coriolis arrows from the GLOBE MESH
    if (arrowObjects.velocity) globeMesh.remove(arrowObjects.velocity);
    if (arrowObjects.coriolis) globeMesh.remove(arrowObjects.coriolis);
    // Keep the Omega arrow for now as it's always shown and repositioned
    arrowObjects.velocity = null;
    arrowObjects.coriolis = null;
}

function updateVectors() {
    if (!intersectionLocal) return; // No point selected

    clearVectors(); // Remove previous Velocity and Coriolis arrows

    // 1. Get User Velocity Input
    const v_ns_val = parseFloat(v_ns_input.value) || 0; // Velocity North/South (m/s)
    const v_ew_val = parseFloat(v_ew_input.value) || 0; // Velocity East/West (m/s)

    // 2. Define Local Coordinate System at the LOCAL Intersection Point
    const point = intersectionLocal;
    const up = point.clone().normalize(); // Radial vector from globe center to point (local)

    let east, north;
    const poleThreshold = 0.99;
    if (Math.abs(up.y) > poleThreshold) { // Near North or South Pole (local Y)
        east = new THREE.Vector3(1, 0, 0); // Use global X as East in local frame at poles
        north = new THREE.Vector3().crossVectors(up, east).normalize();
    } else {
        // Local East is perpendicular to local Up and local rotation axis (0,1,0)
        east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up).normalize();
        // Local North is perpendicular to local Up and local East
        north = new THREE.Vector3().crossVectors(up, east).normalize();
    }

    // 3. Calculate Relative Velocity Vector (vRel) in LOCAL Coordinates (in m/s)
    const vRel = new THREE.Vector3();
    vRel.addScaledVector(north, v_ns_val);
    vRel.addScaledVector(east, v_ew_val);

    const vRelMagnitude = vRel.length(); // Magnitude of relative velocity in m/s

    // 4. Calculate Coriolis Acceleration Vector in LOCAL Coordinates (in m/s^2)
    // aCoriolis = -2 * (Omega_local x vRel_local)
    const aCoriolisVector = new THREE.Vector3()
        .crossVectors(omegaLocalVector, vRel) // Use actual Omega vector
        .multiplyScalar(-2); // Multiply by -2

    const aCoriolisMagnitude = aCoriolisVector.length(); // Magnitude of Coriolis acceleration in m/s^2

    // 5. Update Coriolis Acceleration Display (using scientific notation)
     coriolisAccelerationMagnitudeDisplay.textContent = aCoriolisMagnitude.toExponential(2); // Display in m/s^2 with 2 decimal places in exponent

    // 6. Create Custom Arrow objects in LOCAL coordinates and add to GLOBE MESH

    // Determine visual arrow lengths based on magnitude and scaling factors, with min/max limits
    // Apply linear scaling with a minimum and maximum length
    const vRelBodyLength = Math.min(MAX_ARROW_BODY_LENGTH, Math.max(MIN_ARROW_BODY_LENGTH, vRelMagnitude * VELOCITY_ARROW_SCALE_FACTOR));
    const aCoriolisBodyLength = Math.min(MAX_ARROW_BODY_LENGTH, Math.max(MIN_ARROW_BODY_LENGTH, aCoriolisMagnitude * CORIOLIS_ARROW_SCALE_FACTOR));


    // Only draw velocity and Coriolis arrows if magnitude is non-zero (or above a very small threshold)
    if (vRelMagnitude > 1e-9) { // Use a small threshold for non-zero velocity

        // Velocity Arrow (Red)
        arrowObjects.velocity = createCustomArrow(
            vRel.clone().normalize(),  // Direction (local)
            point,                     // Origin (local)
            vRelBodyLength,            // Body Length (scaled)
            0xff0000,                  // Color (Red)
            ARROW_HEAD_LENGTH,         // Head Length (fixed)
            ARROW_HEAD_RADIUS,         // Head Radius (fixed)
            ARROW_BODY_RADIUS          // Body Radius (fixed)
        );
        globeMesh.add(arrowObjects.velocity); // Add to Globe

        // Coriolis Arrow (Blue) - Only if magnitude is significant
        if (aCoriolisMagnitude > 1e-12) { // Use a small threshold for non-negligible acceleration

            arrowObjects.coriolis = createCustomArrow(
                aCoriolisVector.clone().normalize(), // Direction (local)
                point,                         // Origin (local)
                aCoriolisBodyLength,           // Body Length (scaled)
                0x0000ff,                      // Color (Blue)
                ARROW_HEAD_LENGTH,
                ARROW_HEAD_RADIUS,
                ARROW_BODY_RADIUS
            );
            globeMesh.add(arrowObjects.coriolis); // Add to Globe
        }
    }

    // Omega Arrow (Green) - Always show at the point, aligned with local Y
    // This arrow's length is fixed and doesn't scale with other magnitudes
     const omegaBodyLength = OMEGA_BASE_LENGTH_VISUAL - ARROW_HEAD_LENGTH;
     if (!arrowObjects.omega) { // Only create Omega arrow once
         arrowObjects.omega = createCustomArrow(
             new THREE.Vector3(0, 1, 0), // Direction (always local Y up)
             point,                      // Origin (local)
             omegaBodyLength,             // Body Length (fixed)
             0x00ff00,                   // Color (Lime Green)
             ARROW_HEAD_LENGTH,          // Head Length (fixed)
             ARROW_HEAD_RADIUS,
             ARROW_BODY_RADIUS
         );
         globeMesh.add(arrowObjects.omega); // Add to Globe
     } else {
         // If it exists, just update its position to the new intersection point
         arrowObjects.omega.position.copy(point);
     }

     // After updating/adding MathJax content, tell MathJax to typeset it
     if (window.MathJax) {
         MathJax.typesetPromise([coriolisAccelerationMagnitudeDisplay.parentElement]);
     }
}


// --- UI Update Functions ---
function updateRotationButtonText() {
    toggleRotationBtn.textContent = `Toggle Rotation (${isRotating ? 'ON' : 'OFF'})`;
}

function updateThemeButtonText() {
    // Text depends on the CURRENT state of isDarkMode
    toggleThemeBtn.textContent = `Toggle Theme (${isDarkMode ? 'Dark' : 'Light'})`;
}

function updateSpeedSliderDisplay() {
     // Display the visual speed value
     speedValueSpan.textContent = visualRotationSpeed.toFixed(4);
}


// --- Start the application ---
init();
animate();