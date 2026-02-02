// Cesium Ion Token
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0OTAzZDRkZi00ODkyLTQ5OTUtOGE1MC1jN2JmNjc0ODdiOGUiLCJpZCI6MzMxMzk2LCJpYXQiOjE3NTUwNDgwNTV9.GH-UECFbXsiJip__VTu2oXoBmx8dt61E52q3rBakZyI';

// 全局变量
let viewer;
let airplaneEntity;
let pathEntity;
let isCameraLocked = false;
let infoPanelVisible = false;

// 东方明珠位置
const dongfangmingzhu = {
    lon: 121.4998,
    lat: 31.2397,
    height: 600
};

// 建筑着色器代码 - 浅色 + 动态灯光效果
const BUILDING_SHADER = `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        float height = fsInput.attributes.positionMC.z;
        
        // 基础颜色定义 - 带灰度的浅色
        vec3 baseColor;
        float glowStrength = 0.0;
        
        if (height > 400.0) {
            baseColor = vec3(0.35, 0.55, 0.6); // 灰青色
            glowStrength = 0.4;
        } else if (height > 250.0) {
            baseColor = vec3(0.6, 0.45, 0.5); // 灰粉色
            glowStrength = 0.35;
        } else if (height > 120.0) {
            baseColor = vec3(0.4, 0.5, 0.6); // 灰蓝色
            glowStrength = 0.3;
        } else if (height > 50.0) {
            baseColor = vec3(0.5, 0.45, 0.6); // 灰紫色
            glowStrength = 0.25;
        } else {
            baseColor = vec3(0.4, 0.4, 0.5); // 灰蓝色
            glowStrength = 0.2;
        }
        
        // 获取时间用于动画 - 加快速度
        float time = float(czm_frameNumber) * 0.03;
        
        // 灯光流动效果 - 从下往上的涌泉效果 (加快)
        float waveSpeed = 3.0;
        float waveHeight = mod(height * 0.015 - time * waveSpeed, 3.14159);
        float lightWave = sin(waveHeight) * 0.5 + 0.5;
        
        // RGB渐变效果 - 随高度变化 (加快)
        vec3 rainbowColor;
        float hue = mod(height * 0.003 + time * 0.15, 1.0);
        if (hue < 0.33) {
            rainbowColor = mix(vec3(0.7, 0.4, 0.4), vec3(0.4, 0.7, 0.4), hue * 3.0);
        } else if (hue < 0.66) {
            rainbowColor = mix(vec3(0.4, 0.7, 0.4), vec3(0.4, 0.4, 0.7), (hue - 0.33) * 3.0);
        } else {
            rainbowColor = mix(vec3(0.4, 0.4, 0.7), vec3(0.7, 0.4, 0.6), (hue - 0.66) * 3.0);
        }
        
        // 边缘光效果
        vec3 vNormal = normalize(fsInput.attributes.normalEC);
        vec3 vView = normalize(-fsInput.attributes.positionEC);
        float rim = 1.0 - max(dot(vNormal, vView), 0.0);
        rim = pow(rim, 2.0);
        
        // 混合颜色：基础色 + RGB渐变 + 灯光流动
        vec3 flowColor = mix(baseColor, rainbowColor, lightWave * 0.4);
        vec3 glowColor = flowColor * (1.0 + rim * glowStrength + lightWave * 0.3);
        
        // 追加闪烁效果
        float flicker = sin(time * 3.0) * 0.05 + 0.95;
        glowColor *= flicker;
        
        material.diffuse = glowColor;
        material.alpha = 0.85; // 稍微透明
    }
`;

// 初始化地图
async function initMap() {
    try {
        viewer = new Cesium.Viewer('cesiumContainer', {
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
            terrain: Cesium.Terrain.fromWorldTerrain()
        });

        // 隐藏版权信息
        viewer.cesiumWidget.creditContainer.style.display = 'none';

        // 初始化场景效果
        initSceneEffects();

        // 加载建筑
        await loadBuildings();

        // 创建飞机和航线
        createAirplaneAndPath();

        // 设置事件监听
        setupEventListeners();

        // 开始更新循环
        viewer.scene.preRender.addEventListener(updateFrame);

        // 初始视角
        flyToOverview();

        // 隐藏加载提示
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
        }, 2000);

    } catch (error) {
        console.error('初始化失败:', error);
        document.getElementById('loading').innerText = '加载失败';
    }
}

// 初始化场景效果
function initSceneEffects() {
    const scene = viewer.scene;

    scene.globe.enableLighting = true;
    scene.globe.depthTestAgainstTerrain = true;
    scene.highDynamicRange = true;

    // 光源
    scene.light = new Cesium.DirectionalLight({
        direction: new Cesium.Cartesian3(0.5, -0.3, -0.8),
        intensity: 2.0
    });

    // 背景色
    scene.backgroundColor = new Cesium.Color(0.01, 0.02, 0.06, 1.0);

    // 雾效
    scene.fog.enabled = true;
    scene.fog.density = 0.0002;
    scene.fog.minimumBrightness = 0.1;
}

// 加载3D建筑
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
        console.error('加载建筑失败:', error);
    }
}

// 创建飞机和航线
function createAirplaneAndPath() {
    const startTime = Cesium.JulianDate.now();
    const duration = 60;
    const stopTime = Cesium.JulianDate.addSeconds(startTime, duration, new Cesium.JulianDate());

    // 设置时钟
    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 0.3; // 0.3倍速
    viewer.clock.shouldAnimate = true;

    // 创建圆形航线
    const centerLon = dongfangmingzhu.lon;
    const centerLat = dongfangmingzhu.lat;
    const radius = 0.015;
    const flightHeight = 600;
    const numPoints = 100;

    const positionProperty = new Cesium.SampledPositionProperty();
    positionProperty.setInterpolationOptions({
        interpolationDegree: 5,
        interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
    });

    const pathPositions = [];

    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const lon = centerLon + radius * Math.cos(angle);
        const lat = centerLat + radius * Math.sin(angle) * 0.85;

        const time = Cesium.JulianDate.addSeconds(startTime, (i / numPoints) * duration, new Cesium.JulianDate());
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, flightHeight);

        positionProperty.addSample(time, position);
        pathPositions.push(Cesium.Cartesian3.fromDegrees(lon, lat, flightHeight));
    }

    // 创建航线
    pathEntity = viewer.entities.add({
        name: '航线',
        polyline: {
            positions: pathPositions,
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.fromCssColorString('#90EE90').withAlpha(0.8)
            }),
            clampToGround: false
        }
    });

    // 创建飞机
    airplaneEntity = viewer.entities.add({
        name: '飞机',
        position: positionProperty,
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({
            start: startTime,
            stop: stopTime
        })]),
        model: {
            uri: './model/shidi/shidi_Animi.gltf',
            scale: 5,
            minimumPixelSize: 50,
            maximumScale: 100
        },
        orientation: new Cesium.VelocityOrientationProperty(positionProperty),

    });
}

// 每帧更新
function updateFrame() {
    if (!airplaneEntity) return;

    const currentTime = viewer.clock.currentTime;
    const position = airplaneEntity.position.getValue(currentTime);

    if (!position) return;

    // 更新信息面板位置
    if (infoPanelVisible) {
        updateInfoPanelPosition(position);
    }

    // 更新飞行数据
    updateFlightData(position, currentTime);

    // 相机跟随
    if (isCameraLocked) {
        updateCameraFollow(position, currentTime);
    }
}

// 更新信息面板位置
function updateInfoPanelPosition(position) {
    const flightInfo = document.getElementById('flightInfo');
    const canvas = viewer.scene.canvas;
    const screenPosition = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, position);

    if (screenPosition &&
        screenPosition.x > 0 && screenPosition.x < canvas.width &&
        screenPosition.y > 0 && screenPosition.y < canvas.height) {

        flightInfo.style.left = screenPosition.x + 'px';
        flightInfo.style.top = screenPosition.y + 'px';
        flightInfo.classList.add('show');
    } else {
        flightInfo.classList.remove('show');
    }
}

// 更新飞行数据
function updateFlightData(position, currentTime) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const height = cartographic.height;

    // 计算航向
    const nextTime = Cesium.JulianDate.addSeconds(currentTime, 0.1, new Cesium.JulianDate());
    const nextPosition = airplaneEntity.position.getValue(nextTime);
    let heading = 0;

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
    }

    // 更新UI
    document.getElementById('altitude').innerText = Math.round(height) + ' m';
    document.getElementById('heading').innerText = Math.round(heading) + '°';
}

// 更新相机跟随 - 在飞机尾部后方上方
function updateCameraFollow(position, currentTime) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);

    // 计算飞机的方向（航向）
    const nextTime = Cesium.JulianDate.addSeconds(currentTime, 0.1, new Cesium.JulianDate());
    const nextPosition = airplaneEntity.position.getValue(nextTime);

    let heading = 0;
    if (nextPosition) {
        const currentCarto = Cesium.Cartographic.fromCartesian(position);
        const nextCarto = Cesium.Cartographic.fromCartesian(nextPosition);
        heading = Math.atan2(
            nextCarto.longitude - currentCarto.longitude,
            nextCarto.latitude - currentCarto.latitude
        );
    }

    // 计算相机位置：飞机斜后方上方（45度角）
    const distance = 500; // 斜向距离（米）
    const heightOffset = 200; // 上方高度（米）
    const sideAngle = Cesium.Math.toRadians(-10); // 45度偏移角

    // 计算斜后方位置（后方 + 45度侧偏）
    const backHeading = heading - sideAngle;
    const backLon = Cesium.Math.toDegrees(cartographic.longitude) - Math.sin(backHeading) * (distance / 111000);
    const backLat = Cesium.Math.toDegrees(cartographic.latitude) - Math.cos(backHeading) * (distance / 111000);
    const cameraHeight = cartographic.height + heightOffset;

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

// 飞到总览视角
function flyToOverview() {
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(121.4998, 31.2397, 2500),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-40),
            roll: 0
        },
        duration: 3
    });
}

// 设置事件监听
function setupEventListeners() {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const flightInfo = document.getElementById('flightInfo');
    const cameraHint = document.getElementById('cameraHint');

    // 单击 - 显示/隐藏信息面板或解锁
    handler.setInputAction(function (click) {
        const pickedObject = viewer.scene.pick(click.position);

        if (Cesium.defined(pickedObject) && pickedObject.id === airplaneEntity) {
            // 点击飞机 - 切换面板
            infoPanelVisible = !infoPanelVisible;
            if (!infoPanelVisible) {
                flightInfo.classList.remove('show');
            }
        } else if (isCameraLocked) {
            // 锁定状态下点击其他地方 - 解锁
            unlockCamera();
        } else {
            // 其他情况关闭面板
            infoPanelVisible = false;
            flightInfo.classList.remove('show');
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 双击 - 锁定/解锁视角
    handler.setInputAction(function (click) {
        const pickedObject = viewer.scene.pick(click.position);

        if (Cesium.defined(pickedObject) && pickedObject.id === airplaneEntity) {
            toggleCameraLock();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
}

// 切换相机锁定
function toggleCameraLock() {
    isCameraLocked = !isCameraLocked;
    const cameraHint = document.getElementById('cameraHint');

    if (isCameraLocked) {
        viewer.scene.screenSpaceCameraController.enableInputs = false;
        cameraHint.classList.add('show');
    } else {
        unlockCamera();
    }
}

// 解锁相机
function unlockCamera() {
    isCameraLocked = false;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    document.getElementById('cameraHint').classList.remove('show');
}

// 启动
document.addEventListener('DOMContentLoaded', initMap);
