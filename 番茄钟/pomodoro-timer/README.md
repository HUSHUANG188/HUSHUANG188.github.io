# 🍅 网页版番茄钟

一个简单、开箱即用的番茄工作法计时器。打开网页就能用，无需安装任何环境。

## ✨ 功能

- **专注 / 短休息 / 长休息** 三种模式，一键切换
- 每完成 **4 个番茄** 自动进入长休息（一个完整循环）
- 圆形倒计时进度环 + 大字号时间显示
- 到点**提示音** + **桌面通知**（需在浏览器中授权）
- 每段时长**可自定义**，设置自动保存在浏览器里
- 今日完成番茄数统计，**按天自动重置**
- 键盘快捷键：按 `空格` 开始 / 暂停
- 支持**深色模式**（自动跟随系统）

## 🚀 使用方法

直接用浏览器打开 `index.html` 即可。

也可以起一个本地静态服务器（体验更好，便于后续部署）：

```bash
# 方式一：用 Python（如果已安装）
python -m http.server 8000

# 方式二：用 Node
npx serve .
```

然后访问 http://localhost:8000

## 📦 部署到 GitHub Pages（免费）

1. 把本仓库推送到 GitHub（参考下方步骤）
2. 在仓库页面进入 **Settings → Pages**
3. **Source** 选择 `Deploy from a branch`，**Branch** 选 `main` + `/ (root)`
4. 保存后稍等 1–2 分钟，访问：
   `https://<你的用户名>.github.io/<仓库名>/`

## 🗂 项目结构

```
pomodoro-timer/
├── index.html   # 页面结构
├── style.css    # 样式（含深色模式）
├── app.js       # 计时逻辑与交互
└── README.md
```

纯 HTML / CSS / JS 实现，没有依赖、没有构建步骤，非常适合作为第一个 GitHub 项目。

## 📌 推送到 GitHub 的命令

```bash
git init
git add .
git commit -m "feat: 完成番茄钟第一版"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```
