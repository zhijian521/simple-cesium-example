// Cesium Ion Token
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0OTAzZDRkZi00ODkyLTQ5OTUtOGE1MC1jN2JmNjc0ODdiOGUiLCJpZCI6MzMxMzk2LCJpYXQiOjE3NTUwNDgwNTV9.GH-UECFbXsiJip__VTu2oXoBmx8dt61E52q3rBakZyI";

let viewer;
let airplaneEntity;
let pathEntity;
let isCameraLocked = false;
let infoPanelVisible = false;
let airplaneEntities = [];
let pathEntities = [];
let selectedAirplaneIndex = 0;
let cameraDistance = 500;
let cameraHeightOffset = 200;

let particleSystems = [];
let particleEffectKey = "flame";
let particleIntensity = 1.0;
let particleTextures = {};
const particleMatrix3Scratch = new Cesium.Matrix3();
const particleUp = new Cesium.Cartesian3();
const flameBuoyancyScratch = new Cesium.Cartesian3();
const particleForward = new Cesium.Cartesian3();
const particleBackward = new Cesium.Cartesian3();
const particleRight = new Cesium.Cartesian3();
const trailAlignScratch = new Cesium.Cartesian3();
const turbulenceScratch = new Cesium.Cartesian3();
const turbulenceScratch2 = new Cesium.Cartesian3();

const AIRPLANE_MODEL_URL = "../example01/model/shidi/shidi_Animi.gltf";

const LOCATIONS = {
    dongfangmingzhu: { lon: 121.4998, lat: 31.2397, height: 600 },
    dishuihu: { lon: 121.935, lat: 30.9, height: 600 },
    chongmingdao: { lon: 121.75, lat: 31.52, height: 600 }
};

const BUILDING_SHADER = `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
    float height = fsInput.attributes.positionMC.z;
    vec3 baseColor = vec3(0.85, 0.88, 0.92);
    float time = float(czm_frameNumber) * 0.02;
    float scan = 0.0;
    float scanSpeed = 180.0;
    float scanHeight = 600.0;
    float cycle = scanHeight + 200.0;
    float cyclePos = mod(time * scanSpeed, cycle);
    if (height > 50.0 && cyclePos < scanHeight) {
        float dist = abs(height - cyclePos);
        scan = 1.0 - smoothstep(0.0, 10.0, dist);
    }
    vec3 scanColor = vec3(1.0);
    vec3 color = baseColor + scanColor * scan * 0.6;
    material.diffuse = color;
    material.alpha = 0.6;
}
`;

const PARTICLE_PRESETS = {
    flame: {
        imageKey: "flame",
        offset: new Cesium.Cartesian3(-14.5, 0, -0.5),
        variants: [
            {
                startColor: new Cesium.Color(1.0, 0.995, 0.9, 0.55),
                endColor: new Cesium.Color(1.0, 0.88, 0.55, 0.18),
                startScale: 0.36,
                endScale: 2.4,
                minLife: 0.3,
                maxLife: 0.7,
                minSpeed: 9.5,
                maxSpeed: 15.0,
                emissionRate: 175,
                angle: Cesium.Math.toRadians(6),
                size: 6,
                emitterRotationY: 8,
                updateCallback: applyFlameBuoyancy
            },
            {
                startColor: new Cesium.Color(1.0, 0.85, 0.55, 0.32),
                endColor: new Cesium.Color(0.85, 0.35, 0.18, 0.06),
                startScale: 0.95,
                endScale: 6.4,
                minLife: 0.9,
                maxLife: 2.2,
                minSpeed: 3.8,
                maxSpeed: 8.0,
                emissionRate: 90,
                angle: Cesium.Math.toRadians(30),
                size: 11,
                emitterRotationY: 18,
                updateCallback: applyFlameBuoyancyStrong
            },
            {
                imageKey: "blackSmoke",
                startColor: new Cesium.Color(0.2, 0.2, 0.2, 0.28),
                endColor: new Cesium.Color(0.08, 0.08, 0.08, 0.0),
                startScale: 1.2,
                endScale: 5.8,
                minLife: 1.2,
                maxLife: 2.6,
                minSpeed: 1.6,
                maxSpeed: 2.8,
                emissionRate: 35,
                angle: Cesium.Math.toRadians(28),
                size: 12,
                emitterRotationY: 18,
                updateCallback: applySmokeBuoyancy
            }
        ]
    },
    smoke: {
        imageKey: "smoke",
        startColor: new Cesium.Color(0.8, 0.8, 0.8, 0.6),
        endColor: new Cesium.Color(0.2, 0.2, 0.2, 0.0),
        startScale: 2.0,
        endScale: 6.0,
        minLife: 1.5,
        maxLife: 3.0,
        minSpeed: 1.5,
        maxSpeed: 3.5,
        emissionRate: 50,
        angle: Cesium.Math.toRadians(25),
        size: 14,
        offset: new Cesium.Cartesian3(-18, 0, 0)
    },
    trail: {
        imageKey: "airflowSmoke",
        variants: [
            {
                startColor: new Cesium.Color(1.0, 1.0, 1.0, 0.32),
                endColor: new Cesium.Color(1.0, 1.0, 1.0, 0.0),
                startScale: 0.9,
                endScale: 3.2,
                minLife: 2.5,
                maxLife: 4.5,
                minSpeed: 0.4,
                maxSpeed: 1.1,
                emissionRate: 55,
                angle: Cesium.Math.toRadians(10.0),
                size: 10,
                sizeAspect: { x: 1.4, y: 0.9 },
                updateCallback: applySoftAirflow,
                streams: [
                    { offset: new Cesium.Cartesian3(-23.8, -1.8, 2.0), emissionScale: 1.0, sizeScale: 1.0 },
                    { offset: new Cesium.Cartesian3(-23.8, 1.8, 2.0), emissionScale: 1.0, sizeScale: 1.0 }
                ]
            },
            {
                startColor: new Cesium.Color(1.0, 1.0, 1.0, 0.2),
                endColor: new Cesium.Color(1.0, 1.0, 1.0, 0.0),
                startScale: 1.6,
                endScale: 5.0,
                minLife: 3.8,
                maxLife: 6.0,
                minSpeed: 0.25,
                maxSpeed: 0.7,
                emissionRate: 24,
                angle: Cesium.Math.toRadians(16.0),
                size: 14,
                sizeAspect: { x: 1.6, y: 1.1 },
                updateCallback: applySoftAirflow,
                streams: [
                    { offset: new Cesium.Cartesian3(-24.2, -1.8, 2.2), emissionScale: 0.75, sizeScale: 1.05 },
                    { offset: new Cesium.Cartesian3(-24.2, 1.8, 2.2), emissionScale: 0.75, sizeScale: 1.05 },
                    { offset: new Cesium.Cartesian3(-23.6, 0.0, 2.25), emissionScale: 0.5, sizeScale: 0.95 }
                ]
            }
        ]
    }
};

async function initMap() {
    try {
        viewer = new Cesium.Viewer("cesiumContainer", {
            animation: false,
            baseLayerPicker: false,
            fullscreenButton: false,
            vrButton: false,
            geocoder: false,
            homeButton: false,
            infoBox: false,
            sceneModePicker: false,
            selectionIndicator: false,
            timeline: false,
            navigationHelpButton: false,
            navigationInstructionsInitiallyVisible: false,
            shouldAnimate: true,
            terrain: Cesium.Terrain.fromWorldTerrain(),
            msaaSamples: 2,
            contextOptions: {
                webgl: {
                    alpha: false,
                    antialias: true,
                    preserveDrawingBuffer: true,
                    powerPreference: "high-performance"
                }
            }
        });

        viewer.cesiumWidget.creditContainer.style.display = "none";

        initSceneEffects();
        await loadBuildings();
        createAirplaneAndPath();
        setupEventListeners();
        initParticleTextures();
        setupEffectControls();

        viewer.scene.preRender.addEventListener(updateFrame);
        flyToOverview();

        setTimeout(() => {
            document.getElementById("loading").style.display = "none";
        }, 2000);
    } catch (error) {
        console.error("初始化失败:", error);
        document.getElementById("loading").innerText = "加载失败";
    }
}

function initSceneEffects() {
    const scene = viewer.scene;

    scene.globe.enableLighting = true;
    scene.globe.depthTestAgainstTerrain = true;
    scene.highDynamicRange = true;

    scene.light = new Cesium.DirectionalLight({
        direction: new Cesium.Cartesian3(0.6, -0.4, -0.7),
        intensity: 2.5
    });

    scene.backgroundColor = new Cesium.Color(0.05, 0.08, 0.15, 1.0);

    scene.fog.enabled = true;
    scene.fog.density = 0.00015;
    scene.fog.minimumBrightness = 0.2;

    scene.shadowMap.enabled = true;
    scene.shadowMap.size = 2048;
    scene.shadowMap.softShadows = true;
    scene.shadowMap.darkness = 0.4;

    scene.globe.dynamicAtmosphereLighting = true;
    scene.globe.dynamicAtmosphereLightingFromSun = true;

    scene.hdr = true;
    scene.postProcessStages.fxaa.enabled = true;
    viewer.resolutionScale = 1.5;
    scene.globe.maximumScreenSpaceError = 4;
    scene.globe.tileCacheSize = 384;
}

async function loadBuildings() {
    try {
        const osmBuildings = await Cesium.createOsmBuildingsAsync(viewer);
        osmBuildings.customShader = new Cesium.CustomShader({
            lightingModel: Cesium.LightingModel.UNLIT,
            fragmentShaderText: BUILDING_SHADER
        });
        osmBuildings.maximumScreenSpaceError = 8;
        viewer.scene.primitives.add(osmBuildings);
    } catch (error) {
        console.error("建筑加载失败:", error);
    }
}

function createAirplaneAndPath() {
    const startTime = Cesium.JulianDate.now();
    const duration = 60;
    const stopTime = Cesium.JulianDate.addSeconds(startTime, duration, new Cesium.JulianDate());

    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 0.3;
    viewer.clock.shouldAnimate = true;

    const numPoints = 100;
    const positionProperty1 = new Cesium.SampledPositionProperty();
    positionProperty1.setInterpolationOptions({
        interpolationDegree: 5,
        interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
    });

    const pathPositions1 = [];

    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const lon = LOCATIONS.dongfangmingzhu.lon + 0.015 * Math.cos(angle);
        const lat = LOCATIONS.dongfangmingzhu.lat + 0.015 * Math.sin(angle) * 0.85;
        const time = Cesium.JulianDate.addSeconds(startTime, (i / numPoints) * duration, new Cesium.JulianDate());
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, LOCATIONS.dongfangmingzhu.height);
        positionProperty1.addSample(time, position);
        pathPositions1.push(position);
    }

    pathEntity = viewer.entities.add({
        name: "东方明珠环线 - 航线",
        polyline: {
            positions: pathPositions1,
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.fromCssColorString("#90EE90").withAlpha(0.8)
            }),
            clampToGround: false
        }
    });
    pathEntities.push(pathEntity);

    airplaneEntity = viewer.entities.add({
        name: "东方明珠环线 - 飞机",
        position: positionProperty1,
        availability: new Cesium.TimeIntervalCollection([
            new Cesium.TimeInterval({ start: startTime, stop: stopTime })
        ]),
        model: {
            uri: AIRPLANE_MODEL_URL,
            scale: 5,
            minimumPixelSize: 50,
            maximumScale: 100
        },
        orientation: new Cesium.VelocityOrientationProperty(positionProperty1)
    });
    airplaneEntities.push(airplaneEntity);

    const numPoints2 = 1000;
    const positionProperty2 = new Cesium.SampledPositionProperty();
    positionProperty2.setInterpolationOptions({
        interpolationDegree: 5,
        interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
    });

    const pathPositions2 = [];
    const halfPoints = Math.floor(numPoints2 / 2);

    for (let i = 0; i <= halfPoints; i++) {
        const t = i / halfPoints;
        const lon = LOCATIONS.dishuihu.lon + (LOCATIONS.chongmingdao.lon - LOCATIONS.dishuihu.lon) * t;
        const lat = LOCATIONS.dishuihu.lat + (LOCATIONS.chongmingdao.lat - LOCATIONS.dishuihu.lat) * t;
        const time = Cesium.JulianDate.addSeconds(startTime, (i / numPoints2) * duration, new Cesium.JulianDate());
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, 800);
        positionProperty2.addSample(time, position);
        pathPositions2.push(position);
    }

    for (let i = halfPoints; i <= numPoints2; i++) {
        const t = (i - halfPoints) / (numPoints2 - halfPoints);
        const lon = LOCATIONS.chongmingdao.lon + (LOCATIONS.dishuihu.lon - LOCATIONS.chongmingdao.lon) * t;
        const lat = LOCATIONS.chongmingdao.lat + (LOCATIONS.dishuihu.lat - LOCATIONS.chongmingdao.lat) * t;
        const time = Cesium.JulianDate.addSeconds(startTime, (i / numPoints2) * duration, new Cesium.JulianDate());
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, 800);
        positionProperty2.addSample(time, position);
        pathPositions2.push(position);
    }

    const pathEntity2 = viewer.entities.add({
        name: "滴水湖到崇明岛 - 航线",
        polyline: {
            positions: pathPositions2,
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.fromCssColorString("#4ECDC4").withAlpha(0.8)
            }),
            clampToGround: false
        }
    });
    pathEntities.push(pathEntity2);

    const airplaneEntity2 = viewer.entities.add({
        name: "滴水湖到崇明岛 - 飞机",
        position: positionProperty2,
        availability: new Cesium.TimeIntervalCollection([
            new Cesium.TimeInterval({ start: startTime, stop: stopTime })
        ]),
        model: {
            uri: AIRPLANE_MODEL_URL,
            scale: 5,
            minimumPixelSize: 50,
            maximumScale: 100
        },
        orientation: new Cesium.VelocityOrientationProperty(positionProperty2)
    });
    airplaneEntities.push(airplaneEntity2);
}

function updateFrame() {
    if (!airplaneEntities.length) return;

    const currentAirplane = airplaneEntities[selectedAirplaneIndex];
    if (!currentAirplane) return;

    const currentTime = viewer.clock.currentTime;
    const position = currentAirplane.position.getValue(currentTime);
    if (!position) return;

    if (infoPanelVisible) {
        updateInfoPanelPosition(position);
    }

    updateFlightData(position, currentTime, currentAirplane.name);

    if (isCameraLocked) {
        updateCameraFollow(position, currentTime);
    }

    updateParticleSystem(currentAirplane, currentTime);
}

function updateInfoPanelPosition(position) {
    const flightInfo = document.getElementById("flightInfo");
    const canvas = viewer.scene.canvas;
    const screenPosition = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, position);

    if (
        screenPosition &&
        screenPosition.x > 0 && screenPosition.x < canvas.width &&
        screenPosition.y > 0 && screenPosition.y < canvas.height
    ) {
        flightInfo.style.left = `${screenPosition.x}px`;
        flightInfo.style.top = `${screenPosition.y}px`;
        flightInfo.classList.add("show");
    } else {
        flightInfo.classList.remove("show");
    }
}

function updateFlightData(position, currentTime, airplaneName) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const height = cartographic.height;

    const dt = 0.1;
    const nextTime = Cesium.JulianDate.addSeconds(currentTime, dt, new Cesium.JulianDate());
    const currentAirplane = airplaneEntities[selectedAirplaneIndex];
    const nextPosition = currentAirplane.position.getValue(nextTime);

    let heading = 0;
    let speedKmh = 0;

    if (nextPosition) {
        const currentCarto = Cesium.Cartographic.fromCartesian(position);
        const nextCarto = Cesium.Cartographic.fromCartesian(nextPosition);
        heading = Cesium.Math.toDegrees(
            Math.atan2(
                nextCarto.longitude - currentCarto.longitude,
                nextCarto.latitude - currentCarto.latitude
            )
        );
        if (heading < 0) heading += 360;

        const distance = Cesium.Cartesian3.distance(position, nextPosition);
        const speedMps = distance / dt;
        speedKmh = speedMps * 3.6;
    }

    document.getElementById("airplaneName").innerText = airplaneName || "未知";
    document.getElementById("altitude").innerText = `${Math.round(height)} m`;
    document.getElementById("heading").innerText = `${Math.round(heading)}°`;
    document.getElementById("speed").innerText = `${Math.round(speedKmh)} km/h`;
}

function updateCameraFollow(position, currentTime) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);

    const nextTime = Cesium.JulianDate.addSeconds(currentTime, 0.1, new Cesium.JulianDate());
    const currentAirplane = airplaneEntities[selectedAirplaneIndex];
    const nextPosition = currentAirplane.position.getValue(nextTime);

    let heading = 0;
    if (nextPosition) {
        const currentCarto = Cesium.Cartographic.fromCartesian(position);
        const nextCarto = Cesium.Cartographic.fromCartesian(nextPosition);
        heading = Math.atan2(
            nextCarto.longitude - currentCarto.longitude,
            nextCarto.latitude - currentCarto.latitude
        );
    }

    const sideAngle = Cesium.Math.toRadians(-10);
    const backHeading = heading - sideAngle;
    const backLon = Cesium.Math.toDegrees(cartographic.longitude) - Math.sin(backHeading) * (cameraDistance / 111000);
    const backLat = Cesium.Math.toDegrees(cartographic.latitude) - Math.cos(backHeading) * (cameraDistance / 111000);
    const cameraHeight = cartographic.height + cameraHeightOffset;

    const cameraPosition = Cesium.Cartesian3.fromDegrees(backLon, backLat, cameraHeight);

    viewer.camera.setView({
        destination: cameraPosition,
        orientation: {
            heading: heading,
            pitch: Cesium.Math.toRadians(-15),
            roll: 0
        }
    });
}

function flyToOverview() {
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(121.4998, 31.2097, 3000),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-40),
            roll: 0
        },
        duration: 3
    });
}

function setupEventListeners() {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const flightInfo = document.getElementById("flightInfo");

    handler.setInputAction(function (click) {
        const pickedObject = viewer.scene.pick(click.position);

        if (Cesium.defined(pickedObject)) {
            const clickedIndex = airplaneEntities.findIndex((entity) => entity === pickedObject.id);

            if (clickedIndex !== -1) {
                selectedAirplaneIndex = clickedIndex;
                airplaneEntity = airplaneEntities[clickedIndex];
                pathEntity = pathEntities[clickedIndex];
                infoPanelVisible = !infoPanelVisible;
                if (!infoPanelVisible) {
                    flightInfo.classList.remove("show");
                }
                return;
            }
        }

        if (isCameraLocked) {
            unlockCamera();
        } else {
            infoPanelVisible = false;
            flightInfo.classList.remove("show");
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(function (click) {
        const pickedObject = viewer.scene.pick(click.position);

        if (Cesium.defined(pickedObject)) {
            const clickedIndex = airplaneEntities.findIndex((entity) => entity === pickedObject.id);

            if (clickedIndex !== -1) {
                selectedAirplaneIndex = clickedIndex;
                airplaneEntity = airplaneEntities[clickedIndex];
                pathEntity = pathEntities[clickedIndex];
                toggleCameraLock();
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
}

function toggleCameraLock() {
    isCameraLocked = !isCameraLocked;
    const cameraHint = document.getElementById("cameraHint");

    if (isCameraLocked) {
        viewer.scene.screenSpaceCameraController.enableInputs = false;
        cameraHint.classList.add("show");
        viewer.canvas.addEventListener("wheel", handleCameraZoom, { passive: false });
    } else {
        unlockCamera();
    }
}

function unlockCamera() {
    isCameraLocked = false;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    document.getElementById("cameraHint").classList.remove("show");
    viewer.canvas.removeEventListener("wheel", handleCameraZoom);
}

function handleCameraZoom(event) {
    if (!isCameraLocked) return;
    event.preventDefault();

    const zoomSpeed = 30;
    const delta = event.deltaY > 0 ? zoomSpeed : -zoomSpeed;

    cameraDistance = Math.max(100, Math.min(2000, cameraDistance + delta));
    cameraHeightOffset = cameraDistance * 0.4;
}

function initParticleTextures() {
    particleTextures = {
        flame: buildRadialTexture("rgba(255, 255, 245, 0.7)", "rgba(120, 45, 15, 0)", "rgba(255, 220, 140, 0.5)"),
        smoke: buildRadialTexture("rgba(220, 220, 220, 0.8)", "rgba(80, 80, 80, 0)"),
        airflowSmoke: buildRadialTexture("rgba(255, 255, 255, 0.95)", "rgba(255, 255, 255, 0)"),
        blackSmoke: buildRadialTexture("rgba(95, 95, 95, 0.35)", "rgba(15, 15, 15, 0)", "rgba(55, 55, 55, 0.25)"),
        contrail: buildContrailTexture("rgba(250, 252, 255, 0.9)", "rgba(225, 238, 255, 0.45)", "rgba(210, 225, 245, 0)")
    };
}

function buildRadialTexture(innerColor, outerColor, midColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, innerColor);
    if (midColor) {
        gradient.addColorStop(0.45, midColor);
    }
    gradient.addColorStop(1, outerColor);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return canvas.toDataURL("image/png");
}

function buildContrailTexture(coreColor, edgeColor, fadeColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 32;

    const ctx = canvas.getContext("2d");
    const horizontal = ctx.createLinearGradient(0, 0, canvas.width, 0);
    horizontal.addColorStop(0, fadeColor);
    horizontal.addColorStop(0.2, edgeColor);
    horizontal.addColorStop(0.5, coreColor);
    horizontal.addColorStop(0.8, edgeColor);
    horizontal.addColorStop(1, fadeColor);

    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 10; i++) {
        const x = (i / 9) * canvas.width + (Math.random() - 0.5) * 6;
        const y = canvas.height * 0.5 + (Math.random() - 0.5) * 4;
        const radius = 6 + Math.random() * 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        ctx.fill();
    }

    const vertical = ctx.createLinearGradient(0, 0, 0, canvas.height);
    vertical.addColorStop(0, "rgba(255, 255, 255, 0)");
    vertical.addColorStop(0.5, "rgba(255, 255, 255, 1)");
    vertical.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
}

function setupEffectControls() {
    const effectSelect = document.getElementById("effectSelect");
    const intensityRange = document.getElementById("intensityRange");
    const intensityValue = document.getElementById("intensityValue");

    effectSelect.addEventListener("change", () => {
        setParticleEffect(effectSelect.value);
    });

    intensityRange.addEventListener("input", () => {
        const value = parseFloat(intensityRange.value);
        intensityValue.textContent = `${value.toFixed(1)}倍`;
        setParticleIntensity(value);
    });

    particleEffectKey = effectSelect.value;
    particleIntensity = parseFloat(intensityRange.value);
    setParticleEffect(particleEffectKey);
}

function setParticleEffect(key) {
    particleEffectKey = key;
    createParticleSystems();
}

function setParticleIntensity(value) {
    particleIntensity = value;
    createParticleSystems();
}

function createParticleSystems() {
    if (!viewer) return;

    clearParticleSystems();

    if (particleEffectKey === "none") {
        return;
    }

    const preset = PARTICLE_PRESETS[particleEffectKey];
    if (!preset) return;

    const variants = preset.variants && preset.variants.length ? preset.variants : [preset];

    variants.forEach((variant) => {
        const streams = variant.streams && variant.streams.length
            ? variant.streams
            : (preset.streams && preset.streams.length ? preset.streams : [{ offset: variant.offset || preset.offset }]);

        streams.forEach((stream) => {
            const sizeScale = Cesium.defined(stream.sizeScale) ? stream.sizeScale : 1.0;
            const emissionScale = Cesium.defined(stream.emissionScale) ? stream.emissionScale : 1.0;

            const size = getPresetValue(variant, preset, "size") * particleIntensity * sizeScale;
            const emissionRate = getPresetValue(variant, preset, "emissionRate") * particleIntensity * emissionScale;
            const imageKey = getPresetValue(variant, preset, "imageKey");
            const startColor = getPresetValue(variant, preset, "startColor");
            const endColor = getPresetValue(variant, preset, "endColor");
            const startScale = getPresetValue(variant, preset, "startScale");
            const endScale = getPresetValue(variant, preset, "endScale");
            const minLife = getPresetValue(variant, preset, "minLife");
            const maxLife = getPresetValue(variant, preset, "maxLife");
            const minSpeed = getPresetValue(variant, preset, "minSpeed");
            const maxSpeed = getPresetValue(variant, preset, "maxSpeed");
            const angle = getPresetValue(variant, preset, "angle");
            const sizeAspect = getPresetValue(variant, preset, "sizeAspect");
            const updateCallback = getPresetValue(variant, preset, "updateCallback");
            const emitterRotationY = getPresetValue(variant, preset, "emitterRotationY");

            const particleSystem = new Cesium.ParticleSystem({
                image: particleTextures[imageKey],
                startColor: startColor,
                endColor: endColor,
                startScale: startScale,
                endScale: endScale,
                minimumParticleLife: minLife,
                maximumParticleLife: maxLife,
                minimumSpeed: minSpeed,
                maximumSpeed: maxSpeed,
                imageSize: buildImageSize(size, sizeAspect),
                emissionRate: emissionRate,
                emitter: new Cesium.ConeEmitter(angle),
                sizeInMeters: true,
                updateCallback: updateCallback
            });

            const offset = Cesium.defined(stream.offset) ? stream.offset : (variant.offset || preset.offset);
            particleSystem.emitterModelMatrix = computeEmitterModelMatrix(offset, emitterRotationY);
            viewer.scene.primitives.add(particleSystem);
            particleSystems.push(particleSystem);
        });
    });
}

function clearParticleSystems() {
    if (!particleSystems.length || !viewer) return;
    particleSystems.forEach((system) => viewer.scene.primitives.remove(system));
    particleSystems = [];
}

function buildImageSize(size, aspect) {
    if (!aspect) {
        return new Cesium.Cartesian2(size, size);
    }
    return new Cesium.Cartesian2(size * aspect.x, size * aspect.y);
}

function getPresetValue(variant, preset, key) {
    return Cesium.defined(variant[key]) ? variant[key] : preset[key];
}

function computeEmitterModelMatrix(offset, rotationY) {
    const baseAngle = -90 + (rotationY || 0);
    const rotation = Cesium.Matrix3.fromRotationY(Cesium.Math.toRadians(baseAngle));
    return Cesium.Matrix4.fromRotationTranslation(rotation, offset);
}

function applyFlameBuoyancy(particle, dt) {
    if (!particle) return;
    const lift = Cesium.Cartesian3.multiplyByScalar(particleUp, 3.0 * dt, flameBuoyancyScratch);
    particle.velocity = Cesium.Cartesian3.add(particle.velocity, lift, particle.velocity);
    applyTurbulence(particle, dt, 0.35, 0.12);
    applyFlameRise(particle, dt, 0.6, 1.2);
}

function applyFlameBuoyancyStrong(particle, dt) {
    if (!particle) return;
    const lift = Cesium.Cartesian3.multiplyByScalar(particleUp, 4.8 * dt, flameBuoyancyScratch);
    particle.velocity = Cesium.Cartesian3.add(particle.velocity, lift, particle.velocity);
    applyTurbulence(particle, dt, 0.7, 0.22);
    applyFlameRise(particle, dt, 0.8, 1.8);
}

function applySmokeBuoyancy(particle, dt) {
    if (!particle) return;
    const lift = Cesium.Cartesian3.multiplyByScalar(particleUp, 2.0 * dt, flameBuoyancyScratch);
    particle.velocity = Cesium.Cartesian3.add(particle.velocity, lift, particle.velocity);
    applyTurbulence(particle, dt, 1.2, 0.35);
}

function applyContrailDrift(particle, dt) {
    if (!particle) return;
    const speed = Cesium.Cartesian3.magnitude(particle.velocity);
    if (speed <= 0.0001) return;
    const baseSpeed = Math.max(speed, 0.5);
    const desired = Cesium.Cartesian3.multiplyByScalar(particleBackward, baseSpeed, trailAlignScratch);
    Cesium.Cartesian3.lerp(particle.velocity, desired, 0.18, particle.velocity);

    const lift = Cesium.Cartesian3.multiplyByScalar(particleUp, 0.5 * dt, turbulenceScratch);
    const side = (Math.random() - 0.5) * 0.18;
    Cesium.Cartesian3.multiplyByScalar(particleRight, side, turbulenceScratch2);
    Cesium.Cartesian3.add(lift, turbulenceScratch2, turbulenceScratch);
    Cesium.Cartesian3.multiplyByScalar(turbulenceScratch, baseSpeed * dt, turbulenceScratch);
    particle.velocity = Cesium.Cartesian3.add(particle.velocity, turbulenceScratch, particle.velocity);
    Cesium.Cartesian3.multiplyByScalar(particle.velocity, 0.985, particle.velocity);
}

function applySoftAirflow(particle, dt) {
    if (!particle) return;
    const speed = Cesium.Cartesian3.magnitude(particle.velocity);
    if (speed <= 0.0001) return;

    const baseSpeed = Math.max(speed, 0.3);
    const desired = Cesium.Cartesian3.multiplyByScalar(particleBackward, baseSpeed, trailAlignScratch);
    Cesium.Cartesian3.lerp(particle.velocity, desired, 0.22, particle.velocity);

    const lift = Cesium.Cartesian3.multiplyByScalar(particleUp, 0.35 * dt, turbulenceScratch);
    const side = (Math.random() - 0.5) * 0.06;
    Cesium.Cartesian3.multiplyByScalar(particleRight, side, turbulenceScratch2);
    Cesium.Cartesian3.add(lift, turbulenceScratch2, turbulenceScratch);
    Cesium.Cartesian3.multiplyByScalar(turbulenceScratch, baseSpeed * dt, turbulenceScratch);

    particle.velocity = Cesium.Cartesian3.add(particle.velocity, turbulenceScratch, particle.velocity);

    Cesium.Cartesian3.multiplyByScalar(particle.velocity, 0.985, particle.velocity);
}

function applyTurbulence(particle, dt, sideStrength, upStrength) {
    const speed = Cesium.Cartesian3.magnitude(particle.velocity);
    if (speed <= 0.0001) return;

    const sideJitter = (Math.random() - 0.5) * sideStrength;
    const upJitter = (Math.random() - 0.5) * upStrength;

    Cesium.Cartesian3.multiplyByScalar(particleRight, sideJitter, turbulenceScratch);
    Cesium.Cartesian3.multiplyByScalar(particleUp, upJitter, turbulenceScratch2);
    Cesium.Cartesian3.add(turbulenceScratch, turbulenceScratch2, turbulenceScratch);
    Cesium.Cartesian3.multiplyByScalar(turbulenceScratch, speed * dt, turbulenceScratch);

    particle.velocity = Cesium.Cartesian3.add(particle.velocity, turbulenceScratch, particle.velocity);
}

function applyFlameRise(particle, dt, damping, extraLift) {
    const lift = Cesium.Cartesian3.multiplyByScalar(particleUp, extraLift * dt, flameBuoyancyScratch);
    particle.velocity = Cesium.Cartesian3.add(particle.velocity, lift, particle.velocity);
    const factor = Math.max(0.0, 1.0 - damping * dt);
    Cesium.Cartesian3.multiplyByScalar(particle.velocity, factor, particle.velocity);
}

function updateParticleSystem(entity, time) {
    if (!particleSystems.length || !entity) return;

    const modelMatrix = computeParticleModelMatrix(entity, time);
    if (modelMatrix) {
        Cesium.Matrix4.getMatrix3(modelMatrix, particleMatrix3Scratch);
        Cesium.Matrix3.getColumn(particleMatrix3Scratch, 2, particleUp);
        Cesium.Matrix3.getColumn(particleMatrix3Scratch, 0, particleForward);
        Cesium.Matrix3.getColumn(particleMatrix3Scratch, 1, particleRight);
        Cesium.Cartesian3.multiplyByScalar(particleForward, -1.0, particleBackward);
        particleSystems.forEach((system) => {
            system.modelMatrix = modelMatrix;
        });
    }
}

function computeParticleModelMatrix(entity, time) {
    const position = entity.position.getValue(time);
    if (!position) return null;

    const nextTime = Cesium.JulianDate.addSeconds(time, 0.1, new Cesium.JulianDate());
    const nextPosition = entity.position.getValue(nextTime);
    if (!nextPosition) return null;

    const velocity = Cesium.Cartesian3.subtract(nextPosition, position, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(velocity, velocity);

    const up = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
    const right = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(velocity, up, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const correctedUp = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(right, velocity, new Cesium.Cartesian3()), new Cesium.Cartesian3());

    const rotation = new Cesium.Matrix3();
    Cesium.Matrix3.setColumn(rotation, 0, velocity, rotation);
    Cesium.Matrix3.setColumn(rotation, 1, right, rotation);
    Cesium.Matrix3.setColumn(rotation, 2, correctedUp, rotation);

    return Cesium.Matrix4.fromRotationTranslation(rotation, position);
}

document.addEventListener("DOMContentLoaded", initMap);
