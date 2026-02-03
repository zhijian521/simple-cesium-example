# Cesium 学习示例集

基于 [CesiumJS](https://cesium.com/platform/cesiumjs/) 的 3D 地球和地图可视化示例项目。

## 示例列表

| 示例 | 描述 | 在线预览 |
|------|------|----------|
| [Example01](./example01/index.html) | 上海陆家嘴 3D 地图 - 飞机飞行演示 | [查看](./example01/index.html) |
| [Example02](./example02/index.html) | 上海机场空域 3D 展示 - 国家空域分类 | [查看](./example02/index.html) |

### Example01: 飞机飞行演示
- 3D 建筑自定义着色器（扫描线效果）
- 飞机飞行动画与航线绘制
- 双击锁定相机跟随视角
- 滚轮缩放控制距离

### Example02: 机场空域展示
- 虹桥机场 (双跑道) 和浦东机场 (五跑道) B类空域
- 严格依据《国家空域基础分类方法》划分：
  - 双跑道：半径15/30km二环，高度0-600/600-3600m
  - 三跑道以上：半径20/40/60km三环，高度0-900/900-1800/1800-6000m
- 阶梯状倒扣蛋糕形空域结构
- 各层级独立显示/隐藏控制

## 快速开始

```bash
# 克隆项目
git clone <repository-url>
cd simple-cesium-example

# 启动本地服务器
python -m http.server 8080

# 浏览器访问 http://localhost:8080
```

## 目录结构

```
.
├── index.html              # 项目首页
├── README.md               # 项目说明
├── example01/              # 示例1: 飞机飞行演示
│   ├── index.html
│   ├── css/style.css
│   ├── js/main.js
│   └── model/              # 飞机模型
├── example02/              # 示例2: 机场空域展示
│   ├── index.html
│   └── js/main.js
└── public/                 # 公共资源
    └── logo.png
```

## 许可协议

MIT License
