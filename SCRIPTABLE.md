# iPhone 小组件（Scriptable，无需 Xcode）

MacBook Neo（8GB / A18 Pro）装不了 Xcode，所以用 **Scriptable** 做原生小组件：
Scriptable 是 App Store 免费 App，用 JavaScript 画 widget，系统负责刷新。

## 1. 准备云端地址

先按 `DEPLOY.md` 部署到 Render，拿到：

```
https://stockcheck-xxxx.onrender.com
```

并在 Render 设置两个环境变量：

```
SC_PASSWORD   = 网页登录口令（可选）
SC_READ_TOKEN = 给小组件用的只读 token（建议设置）
```

## 2. 装 Scriptable

App Store 搜索 **Scriptable**（作者 Simon Støvring）→ 安装。

## 3. 添加脚本

1. 打开 Scriptable → 右上角 **+**；
2. 把 `scripts/stockcheck-widget.js` 全文粘贴进去；
3. 改顶部两行：

```js
const API = "https://stockcheck-xxxx.onrender.com";
const TOKEN = "你的 SC_READ_TOKEN";
```

4. 点脚本名 → 重命名为 `StockCheck`。

## 4. 加到主屏幕

1. 长按桌面空白 → 左上角 **+** → 搜 **Scriptable**；
2. 选 **中号（Medium）** 组件 → 添加；
3. 长按组件 → **编辑小组件** → Script 选 `StockCheck`；
4. **Parameter** 填股票代码，如 `600519`；想放多只就加多个组件，各填各的。

## 5. 刷新规则

- 小组件由 iOS 控制刷新，通常 **15~60 分钟**一次，做不到实时；
- 点小组件会打开 `hud.html`，那里是实时页面；
- 想立刻刷新：点开 Scriptable 运行一次脚本。

## 手动刷新

iOS **不允许小组件自己强制刷新**（`refreshAfterDate` 只是建议，系统可能无视）。能做的有三种：

1. **点小组件 → 打开实时页**（最可靠）
   小组件已设置点击跳转 `hud.html`，页面每 30 秒自动刷新，右上角还有「刷新」按钮。

2. **在 Scriptable 里运行一次**
   打开 Scriptable → 点 `StockCheck` 脚本 → 运行。脚本会重新拉数据；主屏小组件是否立刻变，仍由 iOS 决定（通常会较快更新）。

3. **做一个「刷新」快捷指令**
   - 快捷指令 App → 新建 → 添加操作 → 搜 **Scriptable** → **Run Script** → 选 `StockCheck`；
   - 命名为「刷新股票」，可以放到桌面；
   - 点一下就会执行脚本，比翻 App 快。

> 想要「点一下小组件就刷新」：把脚本里的 `w.url` 改成
> `w.url = "scriptable:///run/StockCheck";`
> 但这样点击就不再打开实时页，自己权衡。

## 限制

- 必须能访问公网 HTTPS；Mac 局域网的 `http://` 可能被 iOS 拦截；
- 没有 token 且设了口令时，小组件会显示「需要登录」；
- 这是「小组件」，不是悬浮桌宠——iOS 不允许第三方悬浮层。
