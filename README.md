# 糯米的小屋 · 网页版

可交互 3D 小场景：实时渲染的小屋、猫（原生骨骼与动画）、四季切换与日照、喂食/清洁/逗猫/抚摸、头部配饰、相册与本地存档。

## 在线游玩

直接打开 GitHub Pages 地址即可，手机和电脑浏览器都支持（需要 WebGL）。存档保存在当前浏览器的本地存储里，换设备或清缓存会重置。

## 本地运行

这个目录是纯静态站点，没有构建步骤。用任意静态服务器打开即可，**不要直接双击 index.html**（ES module 与 glTF 加载需要 http 协议）：

```sh
npx serve .
# 或
python -m http.server 8080
```

## 结构

| 路径 | 用途 |
| --- | --- |
| `index.html`、`style.css` | 页面与 HUD 样式 |
| `src/` | 游戏逻辑（场景、猫、季节光照、手势、状态存储） |
| `vendor/` | 本地 Three.js 与 GLTFLoader（MIT，见 THREE-LICENSE.txt） |
| `assets/` | 房间、猫、配饰、四季道具模型与配置 |

## 说明

- 这是小游戏工程的网页版本，用于快速分享试玩；微信小游戏版本需要独立的小游戏 AppID 才能上传。
- 素材版权归原权利人所有；第三方 Three.js 许可见 `vendor/THREE-LICENSE.txt`。
