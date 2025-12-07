// --- Matter.js Aliases ---
const Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Events = Matter.Events,
    Body = Matter.Body,
    Vector = Matter.Vector;

// --- Constants & Variables ---
const SCALE = 10; // 10px = 1m
const CAR_MASS = 1000; // kg
const BRAKE_LINE_X = 150; // Screen X position for brake line (moved left to see braking process)

let currentObstacleDistance = 400; // px (40m) from brake line - now variable, default 40m

// Physics Variables (Adjusted for simulation feel)
// Matter.js units are arbitrary, so we map real speeds to internal velocity
const SPEED_MAP = {
    30: 8,   // ~30km/h
    60: 15,  // ~60km/h
    100: 22  // ~100km/h
};

const FRICTION_MAP = {
    sunny: 0.8,
    rainy: 0.4,
    icy: 0.05
};

// Braking force multipliers (higher = stops faster)
// Adjusted to be more realistic - cars need longer stopping distances
const BRAKING_FORCE_MAP = {
    sunny: 0.2,    // Reduced for realism
    rainy: 0.1,    // Reduced for realism
    icy: 0.02      // Very slippery
};

const WEATHER_LABELS = {
    sunny: '☀️ 맑음',
    rainy: '🌧️ 비',
    icy: '❄️ 빙판'
};

let currentSpeed = 30;
let currentWeather = 'sunny';
let lowSpeedCounter = 0; // Counter for how long car has been moving slowly
let hasCrashed = false; // Flag to track if collision occurred
let hasFinished = false; // Flag to prevent multiple finishSimulation calls
let isRunning = false;
let carBody = null;
let engine = null;
let render = null;
let runner = null;
let brakingStarted = false;
let startPos = { x: 50, y: 0 }; // Car starts on-screen (moved from -100 to 50)
let history = [];

// --- Setup ---
function init() {
    // Create Engine
    engine = Engine.create();
    engine.world.gravity.y = 1; // Standard gravity

    // Create Renderer
    const container = document.getElementById('simulation-container');
    render = Render.create({
        element: container,
        engine: engine,
        options: {
            width: window.innerWidth,
            height: 400, // Fixed height for simulation strip
            wireframes: false,
            background: 'transparent',
            showAngleIndicator: false
        }
    });

    // Start Runner
    runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    // Handle Window Resize
    window.addEventListener('resize', () => {
        render.canvas.width = window.innerWidth;
    });

    // Initial World Setup
    resetWorld();

    // Event Loop
    Events.on(engine, 'beforeUpdate', handleUpdate);
    Events.on(engine, 'collisionStart', handleCollision);
    Events.on(render, 'afterRender', drawCar);
}

function resetWorld() {
    Composite.clear(engine.world);
    Engine.clear(engine);

    brakingStarted = false;
    isRunning = false;
    hasCrashed = false;
    hasFinished = false;
    document.getElementById('result-overlay').style.display = 'none';
    document.getElementById('result-overlay').className = '';
    document.getElementById('start-btn').disabled = false;

    const width = render.canvas.width;
    const height = render.canvas.height;
    const groundY = height - 20;

    // 1. Ground
    const groundColor = currentWeather === 'icy' ? '#bae6fd' : '#64748b';
    // Make ground very wide to support long distances (100m = 1000px)
    const groundWidth = Math.max(width * 2, 3000); // At least 3000px wide
    // Position ground so it covers the simulation area well
    const groundCenterX = groundWidth / 2;
    const ground = Bodies.rectangle(groundCenterX, groundY, groundWidth, 40, {
        isStatic: true,
        friction: FRICTION_MAP[currentWeather],
        render: { fillStyle: groundColor }
    });

    // 2. Braking Line (Visual Sensor)
    const brakeLine = Bodies.rectangle(BRAKE_LINE_X, groundY - 100, 5, 200, {
        isStatic: true,
        isSensor: true,
        label: 'brakeLine',
        render: { fillStyle: '#ef4444', opacity: 0.7 }
    });

    // 3. Obstacle (Dummy)
    const obstacleX = BRAKE_LINE_X + currentObstacleDistance;
    const dummy = Bodies.rectangle(obstacleX, groundY - 40, 30, 80, {
        isStatic: true, // Make it static so it doesn't fly away instantly, or could be heavy dynamic
        label: 'dummy',
        render: {
            fillStyle: '#fbbf24',
            sprite: {
                // Simple placeholder texture or just color
            }
        }
    });
    // Add a "head" to the dummy for fun
    const dummyHead = Bodies.circle(obstacleX, groundY - 90, 15, {
        isStatic: true,
        label: 'dummy',
        render: { fillStyle: '#fbbf24' }
    });

    // 4. Car (Start on-screen left)
    // Use invisible box for physics, we'll draw the car manually
    carBody = Bodies.rectangle(startPos.x, groundY - 30, 80, 40, {
        mass: CAR_MASS,
        friction: 0, // Wheels roll, but we simulate engine/braking manually
        frictionAir: 0.01,
        label: 'car',
        render: {
            visible: false // Hide the default rectangle, we'll draw custom car
        }
    });

    Composite.add(engine.world, [ground, brakeLine, dummy, dummyHead, carBody]);

    // Reset camera to initial position - show from x=0
    render.bounds.min.x = 0;
    render.bounds.min.y = 0;
    render.bounds.max.x = render.canvas.width;
    render.bounds.max.y = render.canvas.height;
}

function drawCar() {
    if (!carBody) return;

    const ctx = render.context;
    const pos = carBody.position;
    const angle = carBody.angle;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    // Car body (main rectangle)
    ctx.fillStyle = '#3b82f6';
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;

    // Main body
    ctx.fillRect(-40, -20, 80, 25);
    ctx.strokeRect(-40, -20, 80, 25);

    // Car roof/cabin
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(-25, -35, 50, 15);
    ctx.strokeRect(-25, -35, 50, 15);

    // Windows
    ctx.fillStyle = '#bfdbfe';
    ctx.fillRect(-22, -33, 20, 11);
    ctx.fillRect(2, -33, 20, 11);

    // Headlights
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(35, -15, 5, 8);
    ctx.fillRect(35, -5, 5, 8);

    // Wheels
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;

    // Front wheel
    ctx.beginPath();
    ctx.arc(25, 5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Back wheel
    ctx.beginPath();
    ctx.arc(-25, 5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wheel centers (hubcaps)
    ctx.fillStyle = '#6b7280';
    ctx.beginPath();
    ctx.arc(25, 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-25, 5, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function startSimulation() {
    if (isRunning) return;
    isRunning = true;
    lowSpeedCounter = 0; // Reset counter
    hasCrashed = false; // Reset crash flag
    hasFinished = false; // Reset finished flag
    document.getElementById('start-btn').disabled = true;

    // Apply initial velocity
    const velocity = SPEED_MAP[currentSpeed];
    Body.setVelocity(carBody, { x: velocity, y: 0 });

    // Ensure car doesn't have friction initially (engine power overcomes it)
    carBody.friction = 0;
    carBody.frictionAir = 0;
}

function handleUpdate(event) {
    if (!isRunning) return;

    // Camera follows the car
    if (carBody) {
        const carX = carBody.position.x;
        const padding = 200; // Keep car away from screen edges

        // Use Render.lookAt to follow the car
        Matter.Render.lookAt(render, {
            min: { x: carX - padding, y: 0 },
            max: { x: carX + render.options.width - padding, y: render.options.height }
        });
    }

    // Check if passed brake line
    if (!brakingStarted && carBody.position.x >= BRAKE_LINE_X) {
        brakingStarted = true;
    }

    // Keep car moving at constant speed BEFORE braking line (Engine ON)
    if (!brakingStarted) {
        const targetSpeed = SPEED_MAP[currentSpeed];
        if (carBody.velocity.x < targetSpeed) {
            Body.setVelocity(carBody, { x: targetSpeed, y: carBody.velocity.y });
        }
    } else {
        // AFTER braking line: Apply deceleration force based on weather
        // Calculate braking force proportional to current velocity and weather condition
        const brakingForce = BRAKING_FORCE_MAP[currentWeather];
        const currentVelocity = carBody.velocity.x;

        if (currentVelocity > 0.5) {
            // Apply a force opposing the motion
            const force = -currentVelocity * brakingForce * carBody.mass * 0.001;
            Body.applyForce(carBody, carBody.position, { x: force, y: 0 });
        } else if (currentVelocity > 0.01) {
            // When very slow, apply stronger braking to fully stop
            const force = -currentVelocity * brakingForce * carBody.mass * 0.01;
            Body.applyForce(carBody, carBody.position, { x: force, y: 0 });
        }
    }

    // Check if stopped (after braking started)
    // If velocity is very low for several frames, consider it stopped
    // But only if we haven't crashed yet
    if (brakingStarted && !hasCrashed && !hasFinished) {
        // 1. Position-based collision check (Backup for physics engine tunneling)
        // If car front passes dummy front, it's a crash
        const carFrontX = carBody.position.x + 40; // Car width is 80, so +40 from center
        const dummyFrontX = BRAKE_LINE_X + currentObstacleDistance - 15; // Dummy width 30, so -15 from center

        if (carFrontX >= dummyFrontX - 5) { // 5px tolerance for visual alignment
            hasCrashed = true;
            finishSimulation(true);
            return;
        }

        // 2. Stop check
        const speed = Math.abs(carBody.velocity.x);

        if (speed < 0.3) {
            lowSpeedCounter++;

            // If slow for 30 frames (about 0.5 seconds), force stop
            if (lowSpeedCounter > 30 || speed < 0.05) {
                // Final check: Did we stop INSIDE or touching the dummy?
                // Sometimes physics engine doesn't fire collision if we stop exactly at the edge
                const carFrontX = carBody.position.x + 40;
                const dummyFrontX = BRAKE_LINE_X + currentObstacleDistance - 15;

                if (carFrontX >= dummyFrontX - 5) { // 5px tolerance for visual alignment
                    hasCrashed = true;
                    finishSimulation(true);
                    return;
                }

                Body.setVelocity(carBody, { x: 0, y: 0 });
                finishSimulation(false);
            }
        } else {
            lowSpeedCounter = 0;
        }
    }
}

function handleCollision(event) {
    // Allow collision check even if finished/stopped, to catch late crashes
    if (hasCrashed) return;

    // Note: We removed !isRunning and hasFinished checks to allow updating result to CRASH
    // even if the car was considered "stopped" just a moment ago.

    const pairs = event.pairs;
    for (let i = 0; i < pairs.length; i++) {
        const bodyA = pairs[i].bodyA;
        const bodyB = pairs[i].bodyB;

        if ((bodyA.label === 'car' && bodyB.label === 'dummy') ||
            (bodyB.label === 'car' && bodyA.label === 'dummy')) {
            hasCrashed = true; // Mark as crashed
            finishSimulation(true);
            return; // Exit immediately after crash
        }
    }
}

function finishSimulation(crashed) {
    // If we've already finished but now we have a crash, update to crash
    if (hasFinished && crashed && !hasCrashed) {
        hasCrashed = true;
        // Re-show result as crash - use dummy distance
        const dummyDistanceM = (currentObstacleDistance / SCALE).toFixed(1);
        showResult(dummyDistanceM, true);
        return;
    }

    // If already finished, ignore duplicate calls
    if (hasFinished) return;

    // Mark as crashed if this is a crash
    if (crashed) hasCrashed = true;

    hasFinished = true;
    isRunning = false;

    let distanceM;

    if (crashed) {
        // For crash, show the dummy distance (where the obstacle is)
        distanceM = (currentObstacleDistance / SCALE).toFixed(1);
    } else {
        // For safe stop, show the actual stopping distance
        const stopX = carBody.position.x;
        const distancePx = Math.max(0, stopX - BRAKE_LINE_X);
        distanceM = (distancePx / SCALE).toFixed(1);
    }

    // Add to history
    addToHistory(currentSpeed, currentWeather, distanceM, crashed);

    showResult(distanceM, crashed);
}

function addToHistory(speed, weather, distance, crashed) {
    const tbody = document.getElementById('history-body');
    const row = document.createElement('tr');

    const resultText = crashed ? '💥 사고' : '✅ 안전';
    const resultClass = crashed ? 'result-crash' : 'result-safe';

    row.innerHTML = `
        <td>${speed}km/h</td>
        <td>${WEATHER_LABELS[weather]}</td>
        <td>${distance}m</td>
        <td class="${resultClass}">${resultText}</td>
    `;

    // Insert at top
    tbody.insertBefore(row, tbody.firstChild);
}

function showResult(distance, crashed) {
    const overlay = document.getElementById('result-overlay');
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');
    const val = document.getElementById('result-value');

    overlay.style.display = 'block';

    if (crashed) {
        overlay.className = 'crash';
        title.innerText = "사고 발생! (CRASH)";
        msg.innerText = "더미와 충돌했습니다.";
        val.innerText = `제동 거리: ${distance}m (충돌)`;
    } else {
        overlay.className = 'safe';
        title.innerText = "안전 정지";
        msg.innerText = "제동 거리";
        val.innerText = `${distance}m`;
    }
}

window.resetSimulation = function () {
    resetWorld();
};

// --- UI Event Listeners ---
document.getElementById('start-btn').addEventListener('click', startSimulation);

// Speed Selection
document.querySelectorAll('#speed-controls button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (isRunning) return;
        document.querySelectorAll('#speed-controls button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentSpeed = parseInt(e.target.dataset.speed);
        // Reset world to prepare for new run immediately
        resetWorld();
    });
});

// Weather Selection
document.querySelectorAll('#weather-controls button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (isRunning) return;
        document.querySelectorAll('#weather-controls button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentWeather = e.target.dataset.weather;

        // Update Visuals
        document.body.className = currentWeather;
        resetWorld(); // Re-create ground with new friction/color
    });
});

// Dummy Distance Selection
document.querySelectorAll('#dummy-controls button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (isRunning) return;
        document.querySelectorAll('#dummy-controls button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentObstacleDistance = parseInt(e.target.dataset.distance);
        resetWorld();
    });
});

// Start
init();
