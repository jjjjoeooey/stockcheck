// StockCheck · Scriptable 小组件
// 用法：App Store 安装 Scriptable → 新建脚本 → 粘贴本文件 → 改 API/TOKEN → 添加小组件
// 小组件参数（Widget Parameter）填股票代码，可放多个不同股票的组件。

const API = "https://stockcheck-xxxx.onrender.com"; // 你的云端地址，结尾不要 /
const TOKEN = ""; // 如果设置了 SC_READ_TOKEN，填在这里
const DEFAULT_CODE = "600519";

const code = (args.widgetParameter || DEFAULT_CODE).trim();
const url = `${API}/api/stock/${encodeURIComponent(code)}${TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : ""}`;

function colorFor(v) {
  if (v === null || v === undefined) return new Color("#5d6f88");
  if (v >= 85) return new Color("#34d399");
  if (v >= 75) return new Color("#22d3ee");
  if (v >= 60) return new Color("#fbbf24");
  if (v >= 45) return new Color("#fb923c");
  return new Color("#f87171");
}
function grade(v) {
  if (v === null || v === undefined) return "数据不足";
  if (v >= 85) return "重点跟踪";
  if (v >= 75) return "观察";
  if (v >= 60) return "中性偏多";
  if (v >= 45) return "偏弱";
  return "回避";
}
const DIMS = [["turnover","换手"],["volume","量能"],["kdj","KDJ"],["relpos","位置"],["boll_extreme","布林"],["resistance","压力"],["fundamental","基本面"]];

const w = new ListWidget();
w.backgroundColor = new Color("#0b1322");
w.setPadding(12, 14, 12, 14);

let data = null, err = null;
try {
  const req = new Request(url);
  req.timeoutInterval = 25;
  data = await req.loadJSON();
  if (!data || data.ok === false) err = (data && data.error) || "接口返回异常";
} catch (e) {
  err = "连接失败";
}

if (err) {
  const t = w.addText("StockCheck");
  t.font = Font.boldSystemFont(14);
  t.textColor = new Color("#e6edf6");
  w.addSpacer(4);
  const e = w.addText(err);
  e.font = Font.systemFont(11);
  e.textColor = new Color("#f87171");
  w.addSpacer();
  const h = w.addText(`${API.replace(/^https?:\/\//, "")}`);
  h.font = Font.systemFont(8);
  h.textColor = new Color("#8ea0b8");
  w.url = `${API}/hud.html?code=${code}`;
} else {
  const r = data.result;
  const total = r.total;

  const head = w.addStack();
  head.layoutHorizontally();
  const name = head.addText(r.name || r.code);
  name.font = Font.boldSystemFont(14);
  name.textColor = new Color("#e6edf6");
  head.addSpacer();
  const dt = head.addText(`${r.date || ""}`);
  dt.font = Font.systemFont(8);
  dt.textColor = new Color("#8ea0b8");

  w.addSpacer(4);

  const big = w.addStack();
  big.layoutHorizontally();
  big.centerAlignContent();
  const s = big.addText(total === null || total === undefined ? "—" : total.toFixed(1));
  s.font = Font.boldSystemFont(34);
  s.textColor = colorFor(total);
  big.addSpacer(6);
  const g = big.addText(grade(total));
  g.font = Font.systemFont(10);
  g.textColor = colorFor(total);
  big.addSpacer();

  w.addSpacer(6);

  const family = (config.widgetFamily || "medium");
  const map = {};
  (r.dims || []).forEach(d => { map[d.key] = d.score; });
  const barW = family === "large" ? 170 : 132;
  if (family !== "small") for (const [key, label] of DIMS) {
    const v = map[key];
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const l = row.addText(label);
    l.font = Font.systemFont(9);
    l.textColor = new Color("#8ea0b8");
    l.size = new Size(34, 12);
    const outer = row.addStack();
    outer.backgroundColor = new Color("#1b2940");
    outer.cornerRadius = 2;
    outer.size = new Size(barW, 4);
    const inner = outer.addStack();
    inner.backgroundColor = colorFor(v);
    inner.cornerRadius = 2;
    inner.size = new Size(barW * Math.max(0, Math.min(100, v || 0)) / 100, 4);
    row.addSpacer(6);
    const val = row.addText(v === null || v === undefined ? "—" : v.toFixed(0));
    val.font = Font.boldSystemFont(9);
    val.textColor = colorFor(v);
    val.rightAlignText();
    val.size = new Size(22, 12);
    w.addSpacer(2);
  }

  w.addSpacer(4);
  const foot = w.addStack();
  foot.layoutHorizontally();
  const tags = (r.tags || []).slice(0, 2).join(" · ");
  const t = foot.addText(tags || `${r.code}`);
  t.font = Font.systemFont(8);
  t.textColor = new Color("#9fd8e6");
  foot.addSpacer();
  const now = foot.addText(`${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, "0")}`);
  now.font = Font.systemFont(8);
  now.textColor = new Color("#8ea0b8");

  w.url = `${API}/hud.html?code=${encodeURIComponent(code)}`;
}

w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
Script.setWidget(w);
Script.complete();
