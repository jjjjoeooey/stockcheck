# 部署到 Render（免费，手机脱离电脑）

## 0. 用哪个包

把 `stockcheck/` 里这些文件上传到 GitHub：

```
stockcheck/                     Python 包
web/                            前端（含 hud.html）
scripts/                        Scriptable 小组件
data/template-daily.csv
data/template-fundamentals.csv
requirements.txt
render.yaml
Dockerfile
.dockerignore
DEPLOY.md
SCRIPTABLE.md
```

**不要上传**：`data/platform.db`、`data/uploads/`、`hud/hud_config.json`、`pet/pet_config.json`、`research/prices.pkl`、`shots/`、`demo/`、`__pycache__/`。

## 1. 上传到 GitHub

1. GitHub 右上角 **+ → New repository**，名字 `stockcheck`，选 **Private**；
2. 进入仓库 → **uploading an existing file**；
3. 打开 `stockcheck/` 文件夹，把里面的**所有内容**（不是外层文件夹）拖进浏览器；
4. 点 **Commit changes**。

> 不要上传 `data/platform.db`、`hud/hud_config.json`，这些含本机数据。

## 2. Render 部署

1. [render.com](https://render.com) → 用 GitHub 登录；
2. **New + → Blueprint** → 选 `stockcheck` 仓库 → **Connect**；
3. 自动读取 `render.yaml`，点 **Apply**；
4. 等 2~5 分钟，状态 **Live**，得到：

```
https://stockcheck-xxxx.onrender.com
```

## 3. 设置访问口令（强烈建议）

Render 服务页 → **Environment** → 添加：

```
SC_PASSWORD   = 你自己定一个口令
SC_READ_TOKEN = 一串随机字符（给 iPhone 小组件只读用，见 SCRIPTABLE.md）
```

保存后会自动重启。之后打开网址会先出现登录页，输入口令即可。
不设的话，任何人拿到 URL 都能用。

## 3.5 iPhone 小组件（可选，不用 Xcode）

见 `SCRIPTABLE.md`：App Store 装 Scriptable，粘贴 `scripts/stockcheck-widget.js`，改 API 和 TOKEN，加到主屏幕。

## 4. 手机上用

Safari 打开：

```
https://stockcheck-xxxx.onrender.com/hud.html?code=600519
```

输入口令 → 分享 → **添加到主屏幕**。

完整平台：`https://stockcheck-xxxx.onrender.com/`

## 注意

- 免费实例 15 分钟没人访问会休眠，下次打开等 30~60 秒；
- 免费盘重启会清空 SQLite，重新同步即可；
- 健康检查地址：`/api/health`；
- 想用自己的域名：Render → Settings → Custom Domain。
