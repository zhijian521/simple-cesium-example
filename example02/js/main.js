/**
 * 上海机场空域 3D 可视化展示
 * 
 * 依据《国家空域基础分类方法》，展示虹桥(ZSSS)和浦东(ZSPD)机场的空域结构
 * 空域分类：A/B/C/D/G 五类，本示例展示 B/C/D 类
 */

// ==================== 配置常量 ====================

// Cesium Ion Token
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0OTAzZDRkZi00ODkyLTQ5OTUtOGE1MC1jN2JmNjc0ODdiOGUiLCJpZCI6MzMxMzk2LCJpYXQiOjE3NTUwNDgwNTV9.GH-UECFbXsiJip__VTu2oXoBmx8dt61E52q3rBakZyI';

/**
 * 空域层级定义
 * 依据《国家空域基础分类方法》
 * 
 * B类空域划分规则：
 * - 三跑道（含）以上机场：半径20/40/60km三环，高度0-900/900-1800/1800-6000m
 * - 双跑道机场：半径15/30km二环，高度0-600/600-3600m
 * - 单跑道机场：半径12km单环，高度0-600m
 */

// 浦东机场（5条跑道，三跑道以上）- 使用蓝色系表示B类空域
const PUDONG_LAYERS = [
    { bottomHeight: 0,    topHeight: 900,  radius: 20000, class: 'B', name: 'B类下层', color: '#64B5F6' },  // 浅蓝 20km
    { bottomHeight: 900,  topHeight: 1800, radius: 40000, class: 'B', name: 'B类中层', color: '#1976D2' },  // 中蓝 40km
    { bottomHeight: 1800, topHeight: 6000, radius: 60000, class: 'B', name: 'B类上层', color: '#0D47A1' }   // 深蓝 60km
];

// 虹桥机场（2条跑道，双跑道）- 使用蓝色系表示B类空域
const HONGQIAO_LAYERS = [
    { bottomHeight: 0,   topHeight: 600,  radius: 15000, class: 'B', name: 'B类下层', color: '#64B5F6' },  // 浅蓝 15km
    { bottomHeight: 600, topHeight: 3600, radius: 30000, class: 'B', name: 'B类上层', color: '#1976D2' }   // 中蓝 30km
];

// 机场配置
const AIRPORTS = {
    hongqiao: {
        name: '上海虹桥国际机场',
        code: 'ZSSS',
        position: [121.3356, 31.1979, 3],
        layers: HONGQIAO_LAYERS,
        runways: [
            { start: [121.328, 31.185, 3], end: [121.336, 31.212, 3] },
            { start: [121.342, 31.182, 3], end: [121.350, 31.209, 3] }
        ]
    },
    pudong: {
        name: '上海浦东国际机场',
        code: 'ZSPD',
        position: [121.8083, 31.1443, 4],
        layers: PUDONG_LAYERS,
        runways: [
            { start: [121.785, 31.165, 4], end: [121.805, 31.200, 4] },
            { start: [121.815, 31.165, 4], end: [121.835, 31.200, 4] },
            { start: [121.775, 31.125, 4], end: [121.795, 31.160, 4] },
            { start: [121.805, 31.125, 4], end: [121.825, 31.160, 4] },
            { start: [121.835, 31.125, 4], end: [121.855, 31.160, 4] }
        ]
    }
};

// 虹桥跑道配置
AIRPORTS.hongqiao.runways = [
    { start: [121.328, 31.185, 3], end: [121.336, 31.212, 3] },
    { start: [121.342, 31.182, 3], end: [121.350, 31.209, 3] }
];

// ==================== 全局状态 ====================

const state = {
    viewer: null,
    entities: {
        hongqiao: { base: [], layers: [[], []] },      // 虹桥：2层
        pudong:   { base: [], layers: [[], [], []] },  // 浦东：3层
        buildings: null
    }
};

// ==================== 初始化 ====================

async function init() {
    try {
        initViewer();
        initScene();
        createAirspace();
        await loadBuildings();
        setupEventListeners();
        flyToOverview();
        hideLoading();
    } catch (error) {
        console.error('初始化失败:', error);
        showError();
    }
}

function initViewer() {
    state.viewer = new Cesium.Viewer('cesiumContainer', {
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
                powerPreference: 'high-performance'
            }
        }
    });

    // 隐藏版权信息
    state.viewer.cesiumWidget.creditContainer.style.display = 'none';
}

function initScene() {
    const scene = state.viewer.scene;
    
    // 光照和渲染设置
    scene.globe.enableLighting = true;
    scene.globe.depthTestAgainstTerrain = true;
    scene.highDynamicRange = true;
    scene.globe.maximumScreenSpaceError = 4;
    
    // 主光源
    scene.light = new Cesium.DirectionalLight({
        direction: new Cesium.Cartesian3(0.5, -0.3, -0.8),
        intensity: 2.0
    });
    
    // 环境设置
    scene.backgroundColor = new Cesium.Color(0.02, 0.05, 0.12, 1.0);
    scene.fog.enabled = true;
    scene.fog.density = 0.0002;
    scene.fog.minimumBrightness = 0.1;
    
    // 分辨率设置
    state.viewer.resolutionScale = 1.0;
}

// ==================== 空域创建 ====================

function createAirspace() {
    createAirportAirspace('hongqiao', AIRPORTS.hongqiao);
    createAirportAirspace('pudong', AIRPORTS.pudong);
}

function createAirportAirspace(key, airport) {
    const [lon, lat, alt] = airport.position;
    const center = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
    const entities = state.entities[key];
    
    // 创建机场标记
    createAirportMarker(center, airport, entities.base);
    
    // 创建跑道
    createRunways(lon, lat, alt, airport, entities.base);
    
    // 创建空域层级
    airport.layers.forEach((layerDef, index) => {
        createAirspaceLayer(
            lon, lat, alt, 
            layerDef, 
            layerDef.radius, 
            index,
            entities.layers[index]
        );
    });
}

function createAirportMarker(position, airport, entityArray) {
    const marker = state.viewer.entities.add({
        name: airport.name,
        position: position,
        billboard: {
            image: createAirportPinSvg(airport.code),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            scale: 0.8,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
            text: airport.name,
            font: 'bold 14px Microsoft YaHei',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(0, -40),
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            eyeOffset: new Cesium.Cartesian3(0, 0, -1000)
        }
    });
    entityArray.push(marker);
}

function createRunways(centerLon, centerLat, alt, airport, entityArray) {
    airport.runways.forEach((runway, index) => {
        const runwayEntity = state.viewer.entities.add({
            name: `${airport.name} - 跑道 ${index + 1}`,
            corridor: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                    runway.start[0], runway.start[1], runway.start[2],
                    runway.end[0], runway.end[1], runway.end[2]
                ]),
                width: 60,
                material: Cesium.Color.fromCssColorString('#333333').withAlpha(0.8),
                outline: true,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
            }
        });
        entityArray.push(runwayEntity);
    });
}

function createAirspaceLayer(lon, lat, alt, layerDef, radius, index, entityArray) {
    const layerColor = Cesium.Color.fromCssColorString(layerDef.color);
    const height = layerDef.topHeight - layerDef.bottomHeight;
    const centerHeight = (layerDef.bottomHeight + layerDef.topHeight) / 2;
    
    // 3D 圆柱体 - B类空域
    const cylinder = state.viewer.entities.add({
        name: `${layerDef.class}类 ${layerDef.name}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, alt + centerHeight),
        cylinder: {
            length: height,
            topRadius: radius,
            bottomRadius: radius,
            material: layerColor.withAlpha(0.25),
            outline: true,
            outlineColor: layerColor,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
        }
    });
    entityArray.push(cylinder);
    
    // 高度标签
    const labelAngle = (index * 72 + (index === 0 ? 0 : 36)) * Math.PI / 180;
    const labelLon = lon + (radius / 111000) * Math.cos(labelAngle) / Math.cos(lat * Math.PI / 180);
    const labelLat = lat + (radius / 111000) * Math.sin(labelAngle);
    
    const label = state.viewer.entities.add({
        name: `${layerDef.name} 标签`,
        position: Cesium.Cartesian3.fromDegrees(labelLon, labelLat, alt + layerDef.topHeight),
        label: {
            text: `${layerDef.class}类 ${layerDef.name}\n${layerDef.bottomHeight}m-${layerDef.topHeight}m\n半径${radius/1000}km`,
            font: 'bold 10px Microsoft YaHei',
            fillColor: layerColor,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            pixelOffset: new Cesium.Cartesian2(5, -5),
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
        }
    });
    entityArray.push(label);
}

function createAirportPinSvg(code) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="#00d4ff" stroke="#fff" stroke-width="2"/>
        <text x="16" y="20" text-anchor="middle" fill="#000" font-size="10" font-weight="bold" font-family="Arial">${code}</text>
    </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ==================== 建筑加载 ====================

async function loadBuildings() {
    try {
        state.entities.buildings = await Cesium.createOsmBuildingsAsync(state.viewer);
        state.entities.buildings.maximumScreenSpaceError = 8;
        state.viewer.scene.primitives.add(state.entities.buildings);
    } catch (error) {
        console.warn('建筑加载失败:', error);
    }
}

// ==================== 视图控制 ====================

function flyToOverview() {
    state.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(121.55, 31.15, 80000),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-60),
            roll: 0
        },
        duration: 2
    });
}

// ==================== 事件处理 ====================

function setupEventListeners() {
    // 虹桥机场总开关
    setupMasterToggle('toggleHongqiao', 'hongqiao', 'toggleHqLayer');
    
    // 浦东机场总开关
    setupMasterToggle('togglePudong', 'pudong', 'togglePdLayer');
    
    // 各层级单独开关
    // 虹桥：2层
    for (let i = 0; i < 2; i++) {
        setupLayerToggle(`toggleHqLayer${i}`, 'hongqiao', i);
    }
    // 浦东：3层
    for (let i = 0; i < 3; i++) {
        setupLayerToggle(`togglePdLayer${i}`, 'pudong', i);
    }
    
    // 建筑开关
    document.getElementById('toggleBuildings').addEventListener('change', (e) => {
        if (state.entities.buildings) {
            state.entities.buildings.show = e.target.checked;
        }
    });
    
    // 总览按钮
    document.getElementById('btnOverview').addEventListener('click', flyToOverview);
}

function setupMasterToggle(elementId, airportKey, childPrefix) {
    document.getElementById(elementId).addEventListener('change', (e) => {
        const show = e.target.checked;
        const layerCount = airportKey === 'hongqiao' ? 2 : 3;
        
        // 控制基础实体（标记、跑道）
        state.entities[airportKey].base.forEach(entity => entity.show = show);
        
        // 控制所有层级
        state.entities[airportKey].layers.forEach(layer => {
            layer.forEach(entity => entity.show = show);
        });
        
        // 同步子开关状态
        for (let i = 0; i < layerCount; i++) {
            document.getElementById(`${childPrefix}${i}`).checked = show;
        }
    });
}

function setupLayerToggle(elementId, airportKey, layerIndex) {
    document.getElementById(elementId).addEventListener('change', (e) => {
        const layer = state.entities[airportKey].layers[layerIndex];
        if (layer) {
            layer.forEach(entity => entity.show = e.target.checked);
        }
    });
}

// ==================== UI 辅助函数 ====================

function hideLoading() {
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
    }, 1500);
}

function showError() {
    document.getElementById('loading').innerText = '加载失败，请刷新重试';
}

// ==================== 启动 ====================

document.addEventListener('DOMContentLoaded', init);
