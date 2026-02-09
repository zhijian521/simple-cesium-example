// Cesium Ion Token
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0OTAzZDRkZi00ODkyLTQ5OTUtOGE1MC1jN2JmNjc0ODdiOGUiLCJpZCI6MzMxMzk2LCJpYXQiOjE3NTUwNDgwNTV9.GH-UECFbXsiJip__VTu2oXoBmx8dt61E52q3rBakZyI';

// 全局变量
let viewer;
let airplaneEntity;
let pathEntity;
let isCameraLocked = false;
let infoPanelVisible = false;
let airplaneEntities = [];
let pathEntities = [];
let buildingCustomShader;
let isNightMode = true;
let selectedAirplaneIndex = 0; // 当前选中的飞机索引
let cameraDistance = 500; // 相机跟随距离（米）
let cameraHeightOffset = 200; // 相机高度偏移（米）

// 东方明珠位置
const dongfangmingzhu = {
    lon: 121.4998,
    lat: 31.2397,
    height: 600
};

// 滴水湖位置
const dishuihu = {
    lon: 121.935,
    lat: 30.900,
    height: 600
};

// 崇明岛位置
const chongmingdao = {
    lon: 121.75,
    lat: 31.52,
    height: 600
};

// 建筑着色器代码 - 原色 + 白线扫描效果
const BUILDING_SHADER = `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        float height = fsInput.attributes.positionMC.z;

        // 使用建筑原色（白色/浅灰基础）- 调亮
        vec3 baseColor = vec3(0.92, 0.92, 0.92);

        // 获取时间用于动画
        float time = float(czm_frameNumber) * 0.02;

        // === 白线扫描效果（带间隔，低矮建筑不显示）===
        float scanGlow = 0.0;
        
        // 只对一定高度以上的建筑显示光效（50米以上）
        if (height > 50.0) {
            // 扫描周期：包含扫描时间和间隔时间
            float scanSpeed = 200.0; // 扫描速度
            float scanHeight = 600.0; // 扫描高度范围
            float cycleDuration = scanHeight + 200.0; // 扫描高度 + 间隔距离
            
            // 当前周期中的位置
            float cyclePos = mod(time * scanSpeed, cycleDuration);
            
            // 只有在扫描范围内才显示光效
            if (cyclePos < scanHeight) {
                float scanPos = cyclePos;
                float distToScan = abs(height - scanPos);
                float scanWidth = 8.0; // 扫描线宽度
                scanGlow = 1.0 - smoothstep(0.0, scanWidth, distToScan);
                scanGlow *= 0.9;
            }
        }
        
        // 扫描线颜色（亮白色带发光）
        vec3 scanColor = vec3(1.0, 1.0, 1.0);

        // === 光影效果 ===
        // 获取法线和视图方向
        vec3 vNormal = normalize(fsInput.attributes.normalEC);
        vec3 vView = normalize(-fsInput.attributes.positionEC);
        
        // 主光源方向
        vec3 lightDir = normalize(vec3(0.6, 0.4, 0.7));
        
        // 漫反射光照 - 提亮
        float diff = max(dot(vNormal, lightDir), 0.0);
        float diffuse = 0.6 + 0.5 * diff;
        
        // 阴影 - 减轻
        float shadowFactor = smoothstep(-0.3, 0.6, diff);
        
        // 环境光遮蔽 - 提亮
        float ao = 0.8 + 0.2 * max(vNormal.z, 0.0);
        
        // 菲涅尔边缘光
        float rim = 1.0 - max(dot(vNormal, vView), 0.0);
        rim = pow(rim, 3.0);
        
        // 应用光影 - 整体提亮
        vec3 litColor = baseColor * diffuse * ao;
        litColor *= mix(0.85, 1.0, shadowFactor);
        litColor += vec3(rim * 0.2); // 边缘光增强
        
        // 添加扫描线效果
        litColor = mix(litColor, scanColor, scanGlow);
        litColor += scanColor * scanGlow * 0.6; // 发光增强
        
        // 最终提亮
        litColor *= 1.15;

        material.diffuse = litColor;
        material.alpha = 0.6;
    }
`;

const BUILDING_SHADER_OPTIMIZED = `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 positionMC = fsInput.attributes.positionMC;
        vec3 positionEC = fsInput.attributes.positionEC;
        vec3 normalEC = fsInput.attributes.normalEC;
        vec3 posToCamera = normalize(-positionEC);
        vec3 coord = normalize(vec3(czm_inverseViewRotation * reflect(posToCamera, normalEC)));
        float ambientCoefficient = 0.3;
        float diffuseCoefficient = max(0.0, dot(normalEC, czm_sunDirectionEC));

        if (u_isDark) {
            vec4 darkRefColor = texture(u_envTexture2, vec2(coord.x, (coord.z - coord.y) / 2.0));
            material.diffuse = mix(
                mix(vec3(0.3), vec3(0.1, 0.2, 0.4), clamp(positionMC.z / 200.0, 0.0, 1.0)),
                darkRefColor.rgb,
                0.3
            );
            material.diffuse *= 0.2;

            float baseHeight = -40.0;
            float heightRange = 20.0;
            float glowRange = 300.0;
            float buildingHeight = positionMC.z - baseHeight;
            float pulse = fract(czm_frameNumber / 120.0) * 3.14159265 * 2.0;
            float gradient = buildingHeight / heightRange + sin(pulse) * 0.1;
            material.diffuse *= vec3(gradient);

            float scanTime = fract(czm_frameNumber / 360.0);
            scanTime = abs(scanTime - 0.5) * 2.0;
            float h = clamp(buildingHeight / glowRange, 0.0, 1.0);
            float diff = step(0.005, abs(h - scanTime));
            material.diffuse += material.diffuse * (1.0 - diff);
        } else {
            vec4 dayRefColor = texture(u_envTexture, vec2(coord.x, (coord.z - coord.y) / 3.0));
            material.diffuse = mix(
                mix(vec3(0.0), vec3(0.5), clamp(positionMC.z / 300.0, 0.0, 1.0)),
                dayRefColor.rgb,
                0.3
            );
            material.diffuse *= min(diffuseCoefficient + ambientCoefficient, 1.0);
        }

        material.alpha = 1.0;
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
            terrain: Cesium.Terrain.fromWorldTerrain(),
            // 渲染质量 - 平衡性能
            msaaSamples: 2, // 2x MSAA 抗锯齿
            contextOptions: {
                webgl: {
                    alpha: false,
                    antialias: true, // 启用 WebGL 抗锯齿
                    preserveDrawingBuffer: true,
                    powerPreference: 'high-performance'
                }
            }
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

    // 主光源 - 模拟阳光斜射，产生明显光影
    scene.light = new Cesium.DirectionalLight({
        direction: new Cesium.Cartesian3(0.6, -0.4, -0.7),
        intensity: 2.5
    });

    // 背景色 - 调亮
    scene.backgroundColor = new Cesium.Color(0.05, 0.08, 0.15, 1.0);

    // 雾效
    scene.fog.enabled = true;
    scene.fog.density = 0.00015;
    scene.fog.minimumBrightness = 0.2;

    // 阴影设置
    scene.shadowMap.enabled = true;
    scene.shadowMap.size = 2048;
    scene.shadowMap.softShadows = true;
    scene.shadowMap.darkness = 0.4;

    // 环境光 - 增加整体亮度
    scene.globe.dynamicAtmosphereLighting = true;
    scene.globe.dynamicAtmosphereLightingFromSun = true;

    // 曝光和色调映射 - 提亮画面
    scene.hdr = true;
    scene.globe.maximumScreenSpaceError = 2;

    // === 清晰度与性能平衡 ===
    // 启用抗锯齿
    scene.postProcessStages.fxaa.enabled = true;

    // 分辨率比例 - 超高清设置
    viewer.resolutionScale = 1.5;

    // 地形细节 - 适中
    scene.globe.maximumScreenSpaceError = 4;

    // 瓦片缓存
    scene.globe.tileCacheSize = 384;
    applySceneMode(isNightMode);
}

function applySceneMode(useNightMode) {
    isNightMode = useNightMode;
    const scene = viewer.scene;

    if (isNightMode) {
        scene.light = new Cesium.DirectionalLight({
            direction: new Cesium.Cartesian3(0.6, -0.4, -0.7),
            intensity: 0.35
        });
        scene.sun.show = false;
        scene.moon.show = false;
        scene.skyAtmosphere.show = false;
        scene.globe.showGroundAtmosphere = false;
        scene.globe.dynamicAtmosphereLighting = false;
        scene.globe.dynamicAtmosphereLightingFromSun = false;

        if (buildingCustomShader) {
            buildingCustomShader.setUniform('u_isDark', true);
        }
    } else {
        scene.light = new Cesium.DirectionalLight({
            direction: new Cesium.Cartesian3(0.6, -0.4, -0.7),
            intensity: 2.5
        });
        scene.sun.show = true;
        scene.moon.show = false;
        scene.skyAtmosphere.show = true;
        scene.globe.showGroundAtmosphere = true;
        scene.globe.dynamicAtmosphereLighting = true;
        scene.globe.dynamicAtmosphereLightingFromSun = true;

        if (buildingCustomShader) {
            buildingCustomShader.setUniform('u_isDark', false);
        }
    }

    updateSceneModeButton();
}

function toggleSceneMode() {
    applySceneMode(!isNightMode);
}

function updateSceneModeButton() {
    const button = document.getElementById('btnSceneMode');
    if (button) {
        button.textContent = isNightMode ? 'Switch to Day' : 'Switch to Night';
    }
}

// 加载3D建筑
async function loadBuildings() {
    try {
        const osmBuildings = await Cesium.createOsmBuildingsAsync(viewer);

        buildingCustomShader = new Cesium.CustomShader({
            uniforms: {
                u_envTexture: {
                    value: new Cesium.TextureUniform({
                        url: '../images/sky.jpg'
                    }),
                    type: Cesium.UniformType.SAMPLER_2D
                },
                u_envTexture2: {
                    value: new Cesium.TextureUniform({
                        url: '../images/pic.jpg'
                    }),
                    type: Cesium.UniformType.SAMPLER_2D
                },
                u_isDark: {
                    value: isNightMode,
                    type: Cesium.UniformType.BOOL
                }
            },
            mode: Cesium.CustomShaderMode.REPLACE_MATERIAL,
            lightingModel: Cesium.LightingModel.UNLIT,
            fragmentShaderText: BUILDING_SHADER_OPTIMIZED
        });

        osmBuildings.customShader = buildingCustomShader;

        osmBuildings.maximumScreenSpaceError = 8; // 建筑细节精度（平衡）
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

    // === 航线1: 东方明珠环线 ===
    const numPoints = 100;
    const positionProperty1 = new Cesium.SampledPositionProperty();
    positionProperty1.setInterpolationOptions({
        interpolationDegree: 5,
        interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
    });

    const pathPositions1 = [];

    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const lon = dongfangmingzhu.lon + 0.015 * Math.cos(angle);
        const lat = dongfangmingzhu.lat + 0.015 * Math.sin(angle) * 0.85;

        const time = Cesium.JulianDate.addSeconds(startTime, (i / numPoints) * duration, new Cesium.JulianDate());
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, dongfangmingzhu.height);

        positionProperty1.addSample(time, position);
        pathPositions1.push(Cesium.Cartesian3.fromDegrees(lon, lat, dongfangmingzhu.height));
    }

    // 创建航线1
    pathEntity = viewer.entities.add({
        name: '东方明珠环线 - 航线',
        polyline: {
            positions: pathPositions1,
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.fromCssColorString('#90EE90').withAlpha(0.8)
            }),
            clampToGround: false
        }
    });
    pathEntities.push(pathEntity);

    // 创建飞机1
    airplaneEntity = viewer.entities.add({
        name: '东方明珠环线 - 飞机',
        position: positionProperty1,
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
        orientation: new Cesium.VelocityOrientationProperty(positionProperty1),
    });
    airplaneEntities.push(airplaneEntity);

    // === 航线2: 滴水湖到崇明岛（往返） ===
    const numPoints2 = 1000; // 增加采样点，大幅降低速度（降低80%）
    const positionProperty2 = new Cesium.SampledPositionProperty();
    positionProperty2.setInterpolationOptions({
        interpolationDegree: 5,
        interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
    });

    const pathPositions2 = [];
    const halfPoints = Math.floor(numPoints2 / 2);

    // 去程：滴水湖 -> 崇明岛
    for (let i = 0; i <= halfPoints; i++) {
        const t = i / halfPoints;
        const lon = dishuihu.lon + (chongmingdao.lon - dishuihu.lon) * t;
        const lat = dishuihu.lat + (chongmingdao.lat - dishuihu.lat) * t;

        const time = Cesium.JulianDate.addSeconds(startTime, (i / numPoints2) * duration, new Cesium.JulianDate());
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, 800);

        positionProperty2.addSample(time, position);
        pathPositions2.push(Cesium.Cartesian3.fromDegrees(lon, lat, 800));
    }

    // 返程：崇明岛 -> 滴水湖
    for (let i = halfPoints; i <= numPoints2; i++) {
        const t = (i - halfPoints) / (numPoints2 - halfPoints);
        const lon = chongmingdao.lon + (dishuihu.lon - chongmingdao.lon) * t;
        const lat = chongmingdao.lat + (dishuihu.lat - chongmingdao.lat) * t;

        const time = Cesium.JulianDate.addSeconds(startTime, (i / numPoints2) * duration, new Cesium.JulianDate());
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, 800);

        positionProperty2.addSample(time, position);
        pathPositions2.push(Cesium.Cartesian3.fromDegrees(lon, lat, 800));
    }

    // 创建航线2
    const pathEntity2 = viewer.entities.add({
        name: '滴水湖到崇明岛 - 航线',
        polyline: {
            positions: pathPositions2,
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.fromCssColorString('#4ECDC4').withAlpha(0.8)
            }),
            clampToGround: false
        }
    });
    pathEntities.push(pathEntity2);

    // 创建飞机2
    const airplaneEntity2 = viewer.entities.add({
        name: '滴水湖到崇明岛 - 飞机',
        position: positionProperty2,
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
        orientation: new Cesium.VelocityOrientationProperty(positionProperty2),
    });
    airplaneEntities.push(airplaneEntity2);
}

// 每帧更新
function updateFrame() {
    if (!airplaneEntities.length) return;

    // 更新当前选中的飞机
    const currentAirplane = airplaneEntities[selectedAirplaneIndex];
    if (!currentAirplane) return;

    const currentTime = viewer.clock.currentTime;
    const position = currentAirplane.position.getValue(currentTime);

    if (!position) return;

    // 更新信息面板位置
    if (infoPanelVisible) {
        updateInfoPanelPosition(position);
    }

    // 更新飞行数据
    updateFlightData(position, currentTime, currentAirplane.name);

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
function updateFlightData(position, currentTime, airplaneName) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const height = cartographic.height;

    // 计算航向
    const nextTime = Cesium.JulianDate.addSeconds(currentTime, 0.1, new Cesium.JulianDate());
    const currentAirplane = airplaneEntities[selectedAirplaneIndex];
    const nextPosition = currentAirplane.position.getValue(nextTime);
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
    document.getElementById('airplaneName').innerText = airplaneName || '未知';
    document.getElementById('altitude').innerText = Math.round(height) + ' m';
    document.getElementById('heading').innerText = Math.round(heading) + '°';
}

// 更新相机跟随 - 在飞机尾部后方上方，支持滚轮缩放
function updateCameraFollow(position, currentTime) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);

    // 计算飞机的方向（航向）
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

    // 计算相机位置：飞机斜后方上方
    const sideAngle = Cesium.Math.toRadians(-10); // 侧偏角

    // 计算斜后方位置（基于当前缩放距离）
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

// 飞到总览视角
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

// 设置事件监听
function setupEventListeners() {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const flightInfo = document.getElementById('flightInfo');
    const cameraHint = document.getElementById('cameraHint');
    const modeButton = document.getElementById('btnSceneMode');

    if (modeButton) {
        modeButton.addEventListener('click', toggleSceneMode);
        updateSceneModeButton();
    }

    // 单击 - 显示/隐藏信息面板或解锁
    handler.setInputAction(function (click) {
        const pickedObject = viewer.scene.pick(click.position);

        if (Cesium.defined(pickedObject)) {
            // 检查是否点击了任意一架飞机
            const clickedIndex = airplaneEntities.findIndex(entity => entity === pickedObject.id);

            if (clickedIndex !== -1) {
                // 点击了飞机，切换到该飞机
                selectedAirplaneIndex = clickedIndex;
                airplaneEntity = airplaneEntities[clickedIndex];
                pathEntity = pathEntities[clickedIndex];
                infoPanelVisible = !infoPanelVisible;
                if (!infoPanelVisible) {
                    flightInfo.classList.remove('show');
                }
                return;
            }
        }

        if (isCameraLocked) {
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

        if (Cesium.defined(pickedObject)) {
            // 检查是否点击了任意一架飞机
            const clickedIndex = airplaneEntities.findIndex(entity => entity === pickedObject.id);

            if (clickedIndex !== -1) {
                // 切换到被点击的飞机
                selectedAirplaneIndex = clickedIndex;
                airplaneEntity = airplaneEntities[clickedIndex];
                pathEntity = pathEntities[clickedIndex];
                toggleCameraLock();
            }
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
        // 添加滚轮缩放监听
        viewer.canvas.addEventListener('wheel', handleCameraZoom, { passive: false });
    } else {
        unlockCamera();
    }
}

// 解锁相机
function unlockCamera() {
    isCameraLocked = false;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    document.getElementById('cameraHint').classList.remove('show');
    // 移除滚轮缩放监听
    viewer.canvas.removeEventListener('wheel', handleCameraZoom);
}

// 处理相机滚轮缩放
function handleCameraZoom(e) {
    if (!isCameraLocked) return;
    
    e.preventDefault();
    
    // 滚轮向上（负值）= 放大（减小距离），向下（正值）= 缩小（增加距离）
    const zoomSpeed = 30; // 缩放速度
    const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
    
    // 更新距离和高度（保持视角比例）
    cameraDistance = Math.max(100, Math.min(2000, cameraDistance + delta));
    cameraHeightOffset = cameraDistance * 0.4; // 保持高度与距离的比例
}

// 启动
document.addEventListener('DOMContentLoaded', initMap);
