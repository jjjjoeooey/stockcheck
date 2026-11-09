/* StockCheck 前端：无框架、无构建，SVG 自绘图表 */
'use strict';

const DIMS = [
  ['turnover', '换手'],
  ['volume', '量能'],
  ['kdj', 'KDJ金叉'],
  ['relpos', '相对位置'],
  ['boll_extreme', '新布林极限'],
  ['resistance', '相对压力位'],
  ['fundamental', '基本面'],
];
const DIM_LABEL = Object.fromEntries(DIMS);
const PRESETS = {
  default: { turnover: 9, volume: 9, kdj: 16, relpos: 12, boll_extreme: 14, resistance: 10, fundamental: 30 },
  tech:    { turnover: 11, volume: 8, kdj: 22, relpos: 14, boll_extreme: 22, resistance: 14, fundamental: 9 },
  fund:    { turnover: 7,  volume: 5, kdj: 13, relpos: 9,  boll_extreme: 13, resistance: 9, fundamental: 44 },
  trend:   { turnover: 8,  volume: 10, kdj: 15, relpos: 17, boll_extreme: 24, resistance: 16, fundamental: 10 },
};

const state = {
  stocks: [],
  weights: { ...PRESETS.default },
  sortKey: 'total',
  sortDir: -1,
  search: '',
  minScore: 0,
  detail: null,
  detailPeriod: 'day',
  market: [],
  marketAt: '',
  boards: [], boardStocks: [], boardType: 'industry', boardCode: '',
  quoteTimer: null,
  autoTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- utils ---------------- */
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : Number(v).toFixed(d);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function scoreClass(v) {
  if (v === null || v === undefined) return 's0';
  if (v >= 85) return 's5';
  if (v >= 75) return 's4';
  if (v >= 60) return 's3';
  if (v >= 45) return 's2';
  return 's1';
}
function gradeOf(v) {
  if (v === null || v === undefined) return '数据不足';
  if (v >= 85) return '重点跟踪';
  if (v >= 75) return '观察';
  if (v >= 60) return '中性偏多';
  if (v >= 45) return '偏弱';
  return '回避';
}
function colorOf(v) {
  if (v >= 85) return '#34d399';
  if (v >= 75) return '#22d3ee';
  if (v >= 60) return '#fbbf24';
  if (v >= 45) return '#fb923c';
  return '#f87171';
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
const getJSON = (p) => api(p);
const postJSON = (p, body) => api(p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

let toastTimer = null;
function toast(msg, bad = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('bad', bad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------------- state load ---------------- */
async function loadState() {
  try {
    const data = await getJSON('/api/state');
    state.stocks = data.stocks || [];
    state.weights = data.weights || state.weights;
    $('#statCount').textContent = data.count ?? state.stocks.length;
    $('#statFund').textContent = data.fundamental_count ?? 0;
    renderWeights();
    renderTable();
  } catch (e) {
    toast('加载失败：' + e.message, true);
  }
}

/* ---------------- ranking ---------------- */
function sortedStocks() {
  const kw = state.search.trim().toLowerCase();
  let rows = state.stocks.filter((s) => {
    if ((s.total ?? -1) < state.minScore) return false;
    if (!kw) return true;
    return String(s.code).includes(kw) || String(s.name || '').toLowerCase().includes(kw);
  });
  const key = state.sortKey;
  const dir = state.sortDir;
  rows.sort((a, b) => {
    let av, bv;
    if (key === 'total') { av = a.total; bv = b.total; }
    else {
      const da = (a.dims || []).find((d) => d.key === key);
      const db = (b.dims || []).find((d) => d.key === key);
      av = da ? da.score : null;
      bv = db ? db.score : null;
    }
    av = av === null || av === undefined ? -Infinity : av;
    bv = bv === null || bv === undefined ? -Infinity : bv;
    if (av === bv) return String(a.code).localeCompare(String(b.code));
    return (av - bv) * dir;
  });
  return rows;
}

function renderTable() {
  const rows = sortedStocks();
  const hasData = state.stocks.length > 0;
  $('#emptyState').hidden = hasData;
  $('#tableWrap').hidden = !hasData;
  $('#rankHint').textContent = hasData ? `显示 ${rows.length} / ${state.stocks.length} 只` : '';

  $$('#rankTable th.sortable').forEach((th) => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.key === state.sortKey) th.classList.add(state.sortDir === -1 ? 'desc' : 'asc');
  });

  const tbody = $('#rankTable tbody');
  tbody.innerHTML = rows.map((s, i) => {
    const get = (k) => {
      const d = (s.dims || []).find((x) => x.key === k);
      return d ? d.score : null;
    };
    const tagHtml = (s.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    return `<tr data-code="${esc(s.code)}">
      <td class="num metric dim">${i + 1}</td>
      <td class="code">${esc(s.code)}</td>
      <td class="name">${esc(s.name || '—')}</td>
      <td class="num"><span class="score-pill ${scoreClass(s.total)}">${s.total === null ? '—' : s.total.toFixed(1)}</span></td>
      ${DIMS.map(([k]) => {
        const v = get(k);
        return `<td class="num metric ${v === null ? 'dim' : ''}">${v === null ? '—' : v.toFixed(0)}</td>`;
      }).join('')}
      <td>${tagHtml}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => openDetail(tr.dataset.code));
  });
}

/* ---------------- market screener ---------------- */
async function loadMarket(force = false) {
  const btn = $('#btnMktRefresh');
  if (btn) { btn.disabled = true; btn.textContent = '刷新中…'; }
  try {
    const d = await getJSON('/api/market' + (force ? '?refresh=1' : ''));
    state.market = d.stocks || [];
    state.marketAt = d.updated_at;
    if ($('#mktTime')) $('#mktTime').textContent = `更新 ${d.updated_at} · ${d.count} 只`;
    renderMarket();
  } catch (e) {
    toast('行情加载失败：' + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '刷新'; }
  }
}

function marketRows() {
  const kw = ($('#mktSearch')?.value || '').trim().toLowerCase();
  const min = Number($('#mktMin')?.value || 0);
  return state.market.filter((r) => {
    if ((r.quick ?? -1) < min) return false;
    if (!kw) return true;
    return String(r.code).includes(kw) || String(r.name || '').toLowerCase().includes(kw);
  });
}

function renderMarket() {
  const body = $('#mktTable tbody');
  if (!body) return;
  const rows = marketRows().slice(0, 300);
  body.innerHTML = rows.map((r) => {
    const pct = r.pct;
    const pctHtml = pct === null || pct === undefined ? '—' : `<span class="${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>`;
    return `<tr data-code="${esc(r.code)}" class="${r.deep ? 'is-deep' : ''}">
      <td class="code">${esc(r.code)}</td>
      <td class="name">${esc(r.name)}</td>
      <td class="num metric">${fmt(r.price)}</td>
      <td class="num metric">${pctHtml}</td>
      <td class="num metric">${r.turnover === null ? '—' : r.turnover.toFixed(1)}</td>
      <td class="num metric">${r.volume_ratio === null ? '—' : r.volume_ratio.toFixed(2)}</td>
      <td class="num metric">${r.pe === null ? '—' : (r.pe > 0 ? r.pe.toFixed(1) : '亏')}</td>
      <td class="num metric">${r.pb === null ? '—' : r.pb.toFixed(2)}</td>
      <td class="num metric">${r.market_cap ? (r.market_cap / 1e8).toFixed(0) : '—'}</td>
      <td class="num"><span class="score-pill ${scoreClass(r.quick)}">${(r.quick ?? 0).toFixed(0)}</span></td>
      <td>${r.deep ? '<span class="tag">已深度</span>' : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('tr').forEach((tr) => {
    const r = rows.find((x) => x.code === tr.dataset.code);
    tr.addEventListener('click', async () => {
      if (r.deep) { openDetail(r.code); return; }
      await deepen([{ code: r.code, name: r.name, pe: r.pe, pb: r.pb, market_cap: r.market_cap }]);
      openDetail(r.code);
    });
  });

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="11" class="muted" style="padding:28px;text-align:center">没有符合条件的结果</td></tr>';
  }
}

async function deepen(items) {
  if (!items.length) { toast('没有可扫描的股票', true); return; }
  const btn = $('#btnDeepen');
  if (btn) { btn.disabled = true; btn.textContent = `扫描中…(${items.length})`; }
  try {
    const d = await postJSON('/api/deepen', { items });
    const bad = d.results.filter((x) => !x.ok).length;
    toast(`深度扫描完成 ${d.scanned} 只${bad ? `，失败 ${bad} 只` : ''}`);
    await loadState();
    await loadMarket(false);
    return d;
  } catch (e) {
    toast('扫描失败：' + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '深度扫描'; }
  }
}

async function deepenTop() {
  const n = Math.max(1, Math.min(200, Number($('#mktTop').value) || 30));
  const rows = marketRows().slice(0, n);
  await deepen(rows.map((r) => ({ code: r.code, name: r.name, pe: r.pe, pb: r.pb, market_cap: r.market_cap })));
}


/* ---------------- sector scanner ---------------- */
async function loadBoards(keep) {
  const type = $('#boardType').value;
  state.boardType = type;
  $('#boardInfo').textContent = '加载板块…';
  try {
    const d = await getJSON('/api/boards?type=' + type);
    state.boards = d.boards || [];
    const sel = $('#boardSelect');
    sel.innerHTML = state.boards.map((b) =>
      `<option value="${b.code}">${b.name}${b.pct != null ? ` (${b.pct.toFixed(2)}%)` : ''}</option>`
    ).join('');
    const want = keep || state.boardCode;
    if (want && state.boards.some((b) => b.code === want)) sel.value = want;
    await loadBoard();
  } catch (e) {
    $('#boardInfo').textContent = '板块加载失败';
    toast('板块加载失败：' + e.message, true);
  }
}

async function loadBoard() {
  const code = $('#boardSelect').value;
  if (!code) return;
  state.boardCode = code;
  $('#boardInfo').textContent = '加载成分股…';
  try {
    const d = await getJSON(`/api/board/${code}?type=${$('#boardType').value}`);
    state.boardStocks = d.stocks || [];
    const b = d.board || {};
    $('#boardInfo').textContent = `${b.name || code} · ${d.count} 只 · 板块 ${b.pct != null ? b.pct.toFixed(2) + '%' : '—'}`;
    renderBoard();
  } catch (e) {
    $('#boardInfo').textContent = '成分股加载失败';
    toast('成分股加载失败：' + e.message, true);
  }
}

function filteredBoard() {
  const num = (id) => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
  const pmin = num('#fPriceMin'), pmax = num('#fPriceMax');
  const cmin = num('#fCapMin'), cmax = num('#fCapMax');
  const amin = num('#fAmountMin');
  const noST = $('#fNoST').checked, noLoss = $('#fNoLoss').checked;
  const rows = state.boardStocks.filter((r) => {
    if (pmin != null && r.price < pmin) return false;
    if (pmax != null && r.price > pmax) return false;
    const cap = r.market_cap ? r.market_cap / 1e8 : null;
    if (cmin != null && (cap == null || cap < cmin)) return false;
    if (cmax != null && (cap == null || cap > cmax)) return false;
    const amt = r.amount ? r.amount / 1e8 : null;
    if (amin != null && (amt == null || amt < amin)) return false;
    if (noST && /ST/i.test(r.name || '')) return false;
    if (noLoss && (r.pe == null || r.pe <= 0)) return false;
    return true;
  });
  rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || (b.quick ?? 0) - (a.quick ?? 0));
  return rows;
}

function renderBoard() {
  const body = $('#boardTable tbody');
  if (!body) return;
  const rows = filteredBoard().slice(0, 300);
  const best = rows.reduce((m, r) => (r.deep && r.total != null && r.total > m ? r.total : m), -1);
  body.innerHTML = rows.map((r) => {
    const score = r.deep && r.total != null ? r.total : r.quick;
    const pctHtml = r.pct == null ? '—' : `<span class="${r.pct >= 0 ? 'up' : 'down'}">${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%</span>`;
    const top = r.deep && r.total != null && r.total === best && best > 0;
    return `<tr data-code="${esc(r.code)}">
      <td class="code">${esc(r.code)}</td>
      <td class="name">${esc(r.name)}</td>
      <td class="num metric">${fmt(r.price)}</td>
      <td class="num metric">${pctHtml}</td>
      <td class="num metric">${r.turnover == null ? '—' : r.turnover.toFixed(1)}</td>
      <td class="num metric">${r.volume_ratio == null ? '—' : r.volume_ratio.toFixed(2)}</td>
      <td class="num metric">${r.pe == null ? '—' : (r.pe > 0 ? r.pe.toFixed(1) : '亏')}</td>
      <td class="num metric">${r.market_cap ? (r.market_cap / 1e8).toFixed(0) : '—'}</td>
      <td class="num"><span class="score-pill ${scoreClass(score)}">${score == null ? '—' : score.toFixed(0)}</span></td>
      <td class="num metric">${r.total == null ? '—' : r.total.toFixed(1)}</td>
      <td>${top ? '<span class="tag best">最高分</span>' : (r.deep ? '<span class="tag">已深度</span>' : '<span class="muted">—</span>')}</td>
    </tr>`;
  }).join('');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="11" class="muted" style="padding:26px;text-align:center">没有符合筛选的股票</td></tr>';
  }
  body.querySelectorAll('tr').forEach((tr) => {
    const r = rows.find((x) => x.code === tr.dataset.code);
    tr.addEventListener('click', async () => {
      if (!r) return;
      if (r.deep) { openDetail(r.code); return; }
      await deepen([{ code: r.code, name: r.name, pe: r.pe, pb: r.pb, market_cap: r.market_cap }]);
      openDetail(r.code);
    });
  });
}

async function deepenBoard() {
  const n = Math.max(1, Math.min(200, Number($('#fTopN').value) || 20));
  const rows = filteredBoard().slice(0, n);
  if (!rows.length) { toast('没有符合筛选的股票', true); return; }
  await deepen(rows.map((r) => ({ code: r.code, name: r.name, pe: r.pe, pb: r.pb, market_cap: r.market_cap })));
  await loadBoard();
}

async function quickAnalyze() {
  const q = ($('#quickInput').value || '').trim();
  if (!q) return;
  try {
    const d = await getJSON('/api/resolve?q=' + encodeURIComponent(q));
    $('#quickInput').value = '';
    openDetail(d.code);
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------------- similar library ---------------- */

async function loadSimilar(code) {
  const card = $('#similarCard');
  const body = $('#simBody');
  if (!card || !body) return;
  card.hidden = false;
  body.innerHTML = '<div class="muted">正在比对历史形态…</div>';
  try {
    const d = await getJSON('/api/similar/' + encodeURIComponent(code));
    if (!d.matches || !d.matches.length) {
      body.innerHTML = '<div class="muted">库里还没有其他股票的历史数据。先到「全市场」做一次深度扫描，相似库会自动建立。</div>';
      return;
    }
    const s = d.stats;
    const rows = d.matches.map((m) => `
      <tr>
        <td class="code">${esc(m.code)}</td><td>${esc(m.name)}</td>
        <td class="muted">${esc(m.start)} ~ ${esc(m.end)}</td>
        <td class="num">${(m.sim * 100).toFixed(1)}%</td>
        <td class="num ${m.fwd5 >= 0 ? 'up' : 'down'}">${m.fwd5 >= 0 ? '+' : ''}${m.fwd5}%</td>
        <td class="num ${m.fwd10 >= 0 ? 'up' : 'down'}">${m.fwd10 >= 0 ? '+' : ''}${m.fwd10}%</td>
        <td class="num ${m.fwd20 >= 0 ? 'up' : 'down'}">${m.fwd20 >= 0 ? '+' : ''}${m.fwd20}%</td>
      </tr>`).join('');
    body.innerHTML = `
      <p class="muted small">最相似的 ${d.n} 个历史片段：后5日平均 <b>${s.fwd5.avg ?? '—'}%</b>（胜率 ${s.fwd5.win_rate ?? '—'}%），后20日平均 <b>${s.fwd20.avg ?? '—'}%</b>（胜率 ${s.fwd20.win_rate ?? '—'}%）。</p>
      <table class="sim-table"><thead><tr>
        <th>代码</th><th>名称</th><th>历史区间</th><th class="num">相似度</th>
        <th class="num">后5日</th><th class="num">后10日</th><th class="num">后20日</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p class="muted small">${esc(d.note || '')}</p>`;
  } catch (e) {
    body.innerHTML = `<div class="muted">相似库暂不可用：${esc(e.message)}</div>`;
  }
}

/* ---------------- detail drawer ---------------- */
async function openDetail(code, period = state.detailPeriod) {
  try {
    state.detailPeriod = period || 'day';
    const data = await getJSON(`/api/stock/${encodeURIComponent(code)}?period=${state.detailPeriod}`);
    state.detail = data;
    renderDetail(data);
    $('#backdrop').hidden = false;
    $('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    history.replaceState(null, '', '#/stock/' + encodeURIComponent(code) +
      (state.detailPeriod && state.detailPeriod !== 'day' ? '/' + state.detailPeriod : ''));
    clearInterval(state.quoteTimer);
    if (data.result.source === 'eastmoney') {
      state.quoteTimer = setInterval(async () => {
        if (!state.detail) return;
        try {
          const q = await getJSON('/api/quote/' + encodeURIComponent(code));
          const quote = q.quote || {};
          if (quote.price) {
            const priceEl = $('#livePrice');
            if (priceEl) priceEl.textContent = Number(quote.price).toFixed(2);
            const pctEl = $('#livePct');
            if (pctEl && quote.pct !== undefined && quote.pct !== null) {
              const p = Number(quote.pct);
              pctEl.textContent = `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
              pctEl.className = 'live-pct ' + (p >= 0 ? 'up' : 'down');
            }
          }
        } catch (e) { /* 实时刷新失败不打扰用户 */ }
      }, 20000);
    }
  } catch (e) {
    toast('打开失败：' + e.message, true);
  }
}

function closeDetail() {
  $('#backdrop').hidden = true;
  $('#drawer').hidden = true;
  document.body.style.overflow = '';
  clearInterval(state.quoteTimer);
  state.quoteTimer = null;
  state.detail = null;
  if (location.hash) history.replaceState(null, '', location.pathname);
}

function renderDetail(data) {
  const r = data.result;
  const c = data.chart;
  $('#dTitle').textContent = `${r.name || ''} ${r.code}`.trim();
  const bars = data.bars;
  const range = c.dates.length ? `${c.dates[0]} ~ ${c.dates[c.dates.length - 1]}` : '';
  const src = r.source === 'eastmoney' ? '东方财富 · 前复权' : (r.source === 'file' ? '本地文件' : '');
  const pLabel = { day: '日线', week: '周线', month: '月线' }[data.period || 'day'];
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const intraday = r.date === todayStr ? ' · 含盘中未收盘数据，收盘后更准' : '';
  $('#dSub').textContent = `共 ${bars} 根日线 · 图表 ${pLabel} 最近 ${c.dates.length} 根 · ${range}${src ? ' · 数据源：' + src : ''}${intraday}`;

  const dims = (r.dims || []).map((d) => `
    <div class="dim">
      <div class="dim-top">
        <span class="dim-name" ${d.key === 'boll_extreme' ? 'title="本平台定义：上轨突破度 + 带宽扩张；与指南针同名指标算法不同，数值不可直接比较"' : ''}>${esc(d.label)}</span>
        <b style="color:${d.score === null ? '#5d6f88' : colorOf(d.score)}">${d.score === null ? '—' : d.score.toFixed(0)}</b>
      </div>
      <div class="bar"><i style="width:${d.score ?? 0}%;background:${d.score === null ? '#334155' : colorOf(d.score)}"></i></div>
      <div class="dim-note">${esc(d.note || '')}</div>
      <div class="dim-weight">权重 ${d.weight ?? '—'}</div>
    </div>`).join('');

  $('#dBody').innerHTML = `
    <div class="hero">
      <div>
        <div class="price"><span id="livePrice">${fmt(r.close)}</span><small id="livePct" class="live-pct"></small><small>${esc(r.date)}</small></div>
      </div>
      <div class="total">
        <b style="color:${r.total === null ? '#5d6f88' : colorOf(r.total)}">${r.total === null ? '—' : r.total.toFixed(1)}</b>
        <div class="grade">${gradeOf(r.total)} · 覆盖度 ${Math.round((r.coverage ?? 0) * 100)}%</div>
      </div>
    </div>
    ${(r.tags && r.tags.length) ? `<div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="dims">${dims}</div>

    <div class="period-row">
      <span class="muted small">图表周期</span>
      <button class="chip ${(data.period || 'day') === 'day' ? 'active' : ''}" data-period="day">日K</button>
      <button class="chip ${(data.period || 'day') === 'week' ? 'active' : ''}" data-period="week">周K</button>
      <button class="chip ${(data.period || 'day') === 'month' ? 'active' : ''}" data-period="month">月K</button>
      <button class="chip" id="btnRefreshK">刷新K线</button>
      <span class="muted small">七维评分仍按日线计算</span>
    </div>

    <div class="chart-card">
      <h3>价格 · 布林带 <span class="legend">
        <span><i style="background:#f87171"></i>阳线</span>
        <span><i style="background:#34d399"></i>阴线</span>
        <span><i style="background:#fbbf24"></i>上轨</span>
        <span><i style="background:#94a3b8"></i>中轨</span>
        <span><i style="background:#38bdf8"></i>下轨</span>
      </span></h3>
      <div class="chart" id="chartPrice"></div>
    </div>

    <div class="chart-card">
      <h3>KDJ(9,3,3) <span class="legend">
        <span><i style="background:#fbbf24"></i>K</span>
        <span><i style="background:#38bdf8"></i>D</span>
        <span><i style="background:#a78bfa"></i>J</span>
      </span></h3>
      <div class="chart" id="chartKdj"></div>
    </div>

    <div class="chart-card">
      <h3>换手率 (%) <span class="legend">
        <span><i style="background:#22d3ee"></i>换手</span>
        <span><i style="background:#fbbf24"></i>5日均</span>
      </span></h3>
      <div class="chart" id="chartTurn"></div>
    </div>

    <div class="chart-card" id="similarCard" hidden>
      <h3>相似形态库 <span class="legend" id="simNote"></span></h3>
      <div id="simBody"></div>
    </div>

    <div class="conclusion">${esc(r.conclusion || '')}</div>
    ${(r.warnings || []).map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
  `;

  requestAnimationFrame(() => {
    renderPriceChart($('#chartPrice'), c);
    renderKdjChart($('#chartKdj'), c);
    renderTurnChart($('#chartTurn'), c);
  });
  $$('#dBody .chip[data-period]').forEach((btn) => {
    btn.addEventListener('click', () => openDetail(r.code, btn.dataset.period));
  });
  const refreshBtn = $('#btnRefreshK');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '更新中…';
      refreshBtn.disabled = true;
      try {
        await postJSON('/api/sync', { codes: [r.code] });
        toast('K 线已更新到最新');
        await openDetail(r.code, state.detailPeriod);
      } catch (e) {
        toast('更新失败：' + e.message, true);
        refreshBtn.textContent = '刷新K线';
        refreshBtn.disabled = false;
      }
    });
  }
  loadSimilar(r.code);
}

/* ---------------- SVG charts ---------------- */
const SVG_NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}
function linePath(values, xOf, yOf) {
  let d = '', started = false;
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) { started = false; return; }
    d += (started ? 'L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(v).toFixed(1) + ' ';
    started = true;
  });
  return d.trim();
}
function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / step;
  let mult = 1;
  if (err >= 7.5) mult = 10; else if (err >= 3.5) mult = 5; else if (err >= 1.5) mult = 2;
  const s = step * mult;
  const start = Math.ceil(min / s) * s;
  const out = [];
  for (let v = start; v <= max + 1e-9; v += s) out.push(v);
  return out;
}

function renderPriceChart(container, c) {
  const W = 900, H = 380;
  const m = { l: 52, r: 12, t: 26, b: 24 };
  const volH = 62, gap = 16;
  const priceH = H - m.t - m.b - volH - gap;
  const priceTop = m.t;
  const plotW = W - m.l - m.r;
  const n = c.close.length;
  if (!n) return;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const vals = [];
  c.high.forEach((v) => v !== null && vals.push(v));
  c.low.forEach((v) => v !== null && vals.push(v));
  c.upper.forEach((v) => v !== null && vals.push(v));
  c.lower.forEach((v) => v !== null && vals.push(v));
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.06 || 1;
  const lo = min - pad, hi = max + pad;
  const xOf = (i) => m.l + (i + 0.5) * (plotW / n);
  const yOf = (v) => priceTop + (hi - v) / (hi - lo) * priceH;

  const lastVal = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i]; return null; };
  const bTxt = `中轨 ${fmt(lastVal(c.mid))}   上轨 ${fmt(lastVal(c.upper))}   下轨 ${fmt(lastVal(c.lower))}`;
  svg.appendChild(el('text', { x: m.l, y: 16, fill: '#8ea0b8', 'font-size': 10.5 }, bTxt));

  // grid + y labels
  niceTicks(lo, hi, 5).forEach((v) => {
    svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: yOf(v), y2: yOf(v), stroke: 'rgba(148,163,184,.10)' }));
    svg.appendChild(el('text', { x: m.l - 8, y: yOf(v) + 4, 'text-anchor': 'end', fill: '#66788f', 'font-size': 10 }, v.toFixed(2)));
  });
  // date labels
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) {
    svg.appendChild(el('text', { x: xOf(i), y: H - 6, 'text-anchor': 'middle', fill: '#66788f', 'font-size': 10 }, c.dates[i].slice(5)));
  }

  // boll bands
  svg.appendChild(el('path', { d: linePath(c.upper, xOf, yOf), fill: 'none', stroke: '#fbbf24', 'stroke-width': 1.1, 'stroke-dasharray': '4 3', opacity: .8 }));
  svg.appendChild(el('path', { d: linePath(c.mid, xOf, yOf), fill: 'none', stroke: '#94a3b8', 'stroke-width': 1, opacity: .65 }));
  svg.appendChild(el('path', { d: linePath(c.lower, xOf, yOf), fill: 'none', stroke: '#38bdf8', 'stroke-width': 1.1, 'stroke-dasharray': '4 3', opacity: .8 }));

  // candles
  const bw = Math.max(1.2, (plotW / n) * 0.62);
  for (let i = 0; i < n; i++) {
    const o = c.open[i], h = c.high[i], l = c.low[i], cl = c.close[i];
    if ([o, h, l, cl].some((v) => v === null)) continue;
    const up = cl >= o;
    const color = up ? '#f87171' : '#34d399';
    svg.appendChild(el('line', { x1: xOf(i), x2: xOf(i), y1: yOf(h), y2: yOf(l), stroke: color, 'stroke-width': 1 }));
    const y1 = yOf(Math.max(o, cl)), y2 = yOf(Math.min(o, cl));
    svg.appendChild(el('rect', {
      x: xOf(i) - bw / 2, y: y1, width: bw, height: Math.max(1, y2 - y1),
      fill: up ? color : 'rgba(52,211,153,.35)', stroke: color, 'stroke-width': .8,
    }));
  }

  // volume
  const volTop = priceTop + priceH + gap;
  const maxV = Math.max(...c.volume.filter((v) => v !== null)) || 1;
  svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: volTop + volH, y2: volTop + volH, stroke: 'rgba(148,163,184,.18)' }));
  for (let i = 0; i < n; i++) {
    const v = c.volume[i];
    if (v === null) continue;
    const h = (v / maxV) * volH;
    const up = c.close[i] >= c.open[i];
    svg.appendChild(el('rect', {
      x: xOf(i) - bw / 2, y: volTop + volH - h, width: bw, height: h,
      fill: up ? 'rgba(248,113,113,.45)' : 'rgba(52,211,153,.38)',
    }));
  }
  svg.appendChild(el('text', { x: m.l, y: volTop + 10, fill: '#66788f', 'font-size': 9.5 }, '成交量'));

  container.innerHTML = '';
  container.appendChild(svg);
}

function renderKdjChart(container, c) {
  const W = 900, H = 200;
  const m = { l: 52, r: 12, t: 12, b: 22 };
  const plotW = W - m.l - m.r, plotH = H - m.t - m.b;
  const n = c.k.length;
  if (!n) return;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}` });
  const lo = -30, hi = 130;
  const xOf = (i) => m.l + (i + 0.5) * (plotW / n);
  const yOf = (v) => m.t + (hi - v) / (hi - lo) * plotH;

  [0, 20, 50, 80, 100].forEach((v) => {
    svg.appendChild(el('line', {
      x1: m.l, x2: W - m.r, y1: yOf(v), y2: yOf(v),
      stroke: v === 20 || v === 80 ? 'rgba(251,191,36,.22)' : 'rgba(148,163,184,.09)',
      'stroke-dasharray': v === 20 || v === 80 ? '3 3' : null,
    }));
    svg.appendChild(el('text', { x: m.l - 8, y: yOf(v) + 4, 'text-anchor': 'end', fill: '#66788f', 'font-size': 10 }, String(v)));
  });
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) {
    svg.appendChild(el('text', { x: xOf(i), y: H - 5, 'text-anchor': 'middle', fill: '#66788f', 'font-size': 10 }, c.dates[i].slice(5)));
  }
  svg.appendChild(el('path', { d: linePath(c.k, xOf, yOf), fill: 'none', stroke: '#fbbf24', 'stroke-width': 1.3 }));
  svg.appendChild(el('path', { d: linePath(c.d, xOf, yOf), fill: 'none', stroke: '#38bdf8', 'stroke-width': 1.3 }));
  svg.appendChild(el('path', { d: linePath(c.j, xOf, yOf), fill: 'none', stroke: '#a78bfa', 'stroke-width': 1, opacity: .8 }));

  const lastVal = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i]; return null; };
  const kTxt = `K ${Number(lastVal(c.k)).toFixed(3)}   D ${Number(lastVal(c.d)).toFixed(3)}   J ${Number(lastVal(c.j)).toFixed(3)}`;
  svg.appendChild(el('text', { x: W - m.r, y: 16, 'text-anchor': 'end', fill: '#8ea0b8', 'font-size': 11 }, kTxt));

  container.innerHTML = '';
  container.appendChild(svg);
}

function renderTurnChart(container, c) {
  const W = 900, H = 170;
  const m = { l: 52, r: 12, t: 12, b: 22 };
  const plotW = W - m.l - m.r, plotH = H - m.t - m.b;
  const n = c.turnover.length;
  if (!n) return;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}` });
  const raw = c.turnover.map((v) => (v === null ? 0 : v));
  const maxV = Math.max(...raw, 1) * 1.15;
  const xOf = (i) => m.l + (i + 0.5) * (plotW / n);
  const yOf = (v) => m.t + (maxV - v) / maxV * plotH;
  const bw = Math.max(1.2, (plotW / n) * 0.62);

  niceTicks(0, maxV, 3).forEach((v) => {
    svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: yOf(v), y2: yOf(v), stroke: 'rgba(148,163,184,.09)' }));
    svg.appendChild(el('text', { x: m.l - 8, y: yOf(v) + 4, 'text-anchor': 'end', fill: '#66788f', 'font-size': 10 }, v.toFixed(1)));
  });
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) {
    svg.appendChild(el('text', { x: xOf(i), y: H - 5, 'text-anchor': 'middle', fill: '#66788f', 'font-size': 10 }, c.dates[i].slice(5)));
  }
  raw.forEach((v, i) => {
    const h = Math.max(0.5, (v / maxV) * plotH);
    svg.appendChild(el('rect', { x: xOf(i) - bw / 2, y: yOf(v), width: bw, height: h, fill: 'rgba(34,211,238,.45)' }));
  });
  // 5日均线
  const ma = raw.map((_, i) => {
    const lo = Math.max(0, i - 4);
    const seg = raw.slice(lo, i + 1);
    return seg.reduce((a, b) => a + b, 0) / seg.length;
  });
  svg.appendChild(el('path', { d: linePath(ma, xOf, yOf), fill: 'none', stroke: '#fbbf24', 'stroke-width': 1.2 }));

  container.innerHTML = '';
  container.appendChild(svg);
}

/* ---------------- weights ---------------- */
function paintRange(input) {
  const min = Number(input.min) || 0, max = Number(input.max) || 100;
  const p = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(90deg, rgba(34,211,238,.85) ${p}%, rgba(148,163,184,.18) ${p}%)`;
}

function renderWeights() {
  const box = $('#weightSliders');
  box.innerHTML = DIMS.map(([k, label]) => `
    <div class="slider-row">
      <label for="w-${k}">${label}</label>
      <input type="range" id="w-${k}" min="0" max="40" step="1" value="${state.weights[k] ?? 0}" data-key="${k}">
      <output id="o-${k}">${state.weights[k] ?? 0}</output>
    </div>`).join('');
  box.querySelectorAll('input[type=range]').forEach((input) => {
    input.addEventListener('input', () => {
      const k = input.dataset.key;
      state.weights[k] = Number(input.value);
      $('#o-' + k).textContent = input.value;
      paintRange(input);
      updateWeightSum();
    });
  });
  box.querySelectorAll('input[type=range]').forEach(paintRange);
  updateWeightSum();
}
function updateWeightSum() {
  const sum = DIMS.reduce((acc, [k]) => acc + (Number(state.weights[k]) || 0), 0);
  $('#weightSum').textContent = sum;
  $('#weightSum').style.color = sum > 0 ? 'var(--accent)' : 'var(--red)';
}

async function applyWeights() {
  try {
    const data = await postJSON('/api/weights', { weights: state.weights });
    state.weights = data.weights;
    toast(`权重已应用，重算了 ${data.rescored} 只股票`);
    await loadState();
  } catch (e) {
    toast('应用失败：' + e.message, true);
  }
}

/* ---------------- upload ---------------- */
function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function syncCodes() {
  const raw = ($('#syncCodes').value || '').trim();
  if (!raw) { toast('请输入股票代码', true); return; }
  const log = $('#logSync');
  log.innerHTML = '<div class="log-row">正在联网同步…</div>';
  try {
    const data = await postJSON('/api/sync', { codes: raw });
    log.innerHTML = data.results.map((r) => r.ok
      ? `<div class="log-row ok"><span>${esc(r.code)} ${esc(r.name || '')}</span><span>${esc(r.date)} 收 ${fmt(r.close)} · 总分 ${fmt(r.total, 1)}</span></div>`
      : `<div class="log-row bad"><span>${esc(r.code)}</span><span>${esc(r.error || '失败')}</span></div>`
    ).join('');
    toast('同步完成');
    await loadState();
  } catch (e) {
    log.innerHTML = `<div class="log-row bad">同步失败：${esc(e.message)}</div>`;
    toast('同步失败：' + e.message, true);
  }
}

async function pasteImport() {
  const code = ($('#pasteCode').value || '').trim();
  const text = ($('#pasteText').value || '').trim();
  const log = $('#logPaste');
  if (!text) { toast('先粘贴数据', true); return; }
  log.innerHTML = '<div class="log-row">正在解析…</div>';
  try {
    const data = await postJSON('/api/paste', { code, text });
    const r = data.result;
    log.innerHTML = `<div class="log-row ok"><span>${esc(r.code)} ${esc(r.name || '')}</span><span>${r.bars} 根日线 · 总分 ${fmt(r.total, 1)}</span></div>`;
    toast('已入库');
    await loadState();
    $('#pasteText').value = '';
  } catch (e) {
    log.innerHTML = `<div class="log-row bad">解析失败：${esc(e.message)}</div>`;
    toast('解析失败：' + e.message, true);
  }
}

async function uploadFiles(files, kind) {
  if (!files.length) return;
  const log = kind === 'price' ? $('#logPrice') : $('#logFund');
  log.innerHTML = `<div class="log-row">正在上传 ${files.length} 个文件…</div>`;
  try {
    const payload = [];
    for (const f of files) payload.push({ name: f.name, data: await fileToB64(f) });
    const data = await postJSON(kind === 'price' ? '/api/upload' : '/api/fundamentals', { files: payload });
    log.innerHTML = data.results.map((r) => r.ok
      ? `<div class="log-row ok"><span>${esc(r.file)}</span><span>${r.code ? esc(r.code) + ' · ' : ''}${r.total !== undefined ? '总分 ' + r.total : (r.applied !== undefined ? '匹配 ' + r.applied + ' 条' : '完成')}</span></div>`
      : `<div class="log-row bad"><span>${esc(r.file || '')}</span><span>${esc(r.error || '失败')}</span></div>`
    ).join('');
    toast('导入完成');
    await loadState();
  } catch (e) {
    log.innerHTML = `<div class="log-row bad">上传失败：${esc(e.message)}</div>`;
    toast('上传失败：' + e.message, true);
  }
}

function bindDrop(zoneSel, inputSel, kind) {
  const zone = $(zoneSel), input = $(inputSel);
  zone.addEventListener('click', (ev) => {
    if (ev.target !== input) input.click();
  });
  input.addEventListener('change', () => {
    uploadFiles(Array.from(input.files || []), kind);
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => {
    e.preventDefault(); zone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => {
    e.preventDefault(); zone.classList.remove('drag');
  }));
  zone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) uploadFiles(files, kind);
  });
}

/* ---------------- actions ---------------- */
async function runDemo() {
  try {
    toast('正在生成演示数据…');
    const data = await postJSON('/api/demo');
    toast(`已导入 ${data.results.filter((r) => r.ok).length} 只演示股票`);
    await loadState();
  } catch (e) {
    toast('生成失败：' + e.message, true);
  }
}

async function clearAll() {
  if (!state.stocks.length) return;
  if (!confirm('确定清空所有股票数据？此操作不可撤销。')) return;
  try {
    await postJSON('/api/clear');
    toast('已清空');
    await loadState();
  } catch (e) {
    toast('清空失败：' + e.message, true);
  }
}

async function deleteCurrent() {
  if (!state.detail) return;
  const code = state.detail.result.code;
  if (!confirm(`删除 ${code}？`)) return;
  try {
    await postJSON('/api/delete', { code });
    closeDetail();
    toast('已删除');
    await loadState();
  } catch (e) {
    toast('删除失败：' + e.message, true);
  }
}

/* ---------------- events ---------------- */
function switchTab(name, updateHash = true) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (updateHash) history.replaceState(null, '', '#/tab/' + name);
  if (name === 'market' && !state.market.length) loadMarket(true);
  if (name === 'sector' && !state.boards.length) loadBoards();
}

function bindEvents() {
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  $$('[data-goto]').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.goto)));

  $('#search').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
  $('#minScore').addEventListener('input', (e) => { state.minScore = Number(e.target.value) || 0; renderTable(); });
  $('#sortBy').addEventListener('change', (e) => { state.sortKey = e.target.value; renderTable(); });
  $$('#rankTable th.sortable').forEach((th) => th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (state.sortKey === key) state.sortDir *= -1;
    else { state.sortKey = key; state.sortDir = -1; }
    $('#sortBy').value = key;
    renderTable();
  }));

  $('#btnDemo').addEventListener('click', runDemo);
  $('#btnDemo2').addEventListener('click', runDemo);
  $('#btnClear').addEventListener('click', clearAll);
  $('#btnExport').addEventListener('click', () => { window.location.href = '/api/export.csv'; });

  $('#btnSync').addEventListener('click', syncCodes);
  $('#btnMktRefresh').addEventListener('click', () => loadMarket(true));
  $('#boardType').addEventListener('change', () => loadBoards());
  $('#boardSelect').addEventListener('change', () => loadBoard());
  $('#btnBoardRefresh').addEventListener('click', () => loadBoards(state.boardCode));
  $('#btnBoardScan').addEventListener('click', deepenBoard);
  $('#btnBoardReset').addEventListener('click', () => {
    ['#fPriceMin','#fPriceMax','#fCapMin','#fCapMax','#fAmountMin'].forEach((id) => { $(id).value = ''; });
    $('#fNoST').checked = true;
    $('#fNoLoss').checked = true;
    renderBoard();
  });
  $('#quickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') quickAnalyze(); });
  $('#btnDeepen').addEventListener('click', deepenTop);
  $('#mktSearch').addEventListener('input', renderMarket);
  $('#mktMin').addEventListener('input', renderMarket);
  $('#autoRefresh').addEventListener('change', (e) => {
    clearInterval(state.autoTimer);
    if (e.target.checked) {
      state.autoTimer = setInterval(() => {
        if ($('#tab-market').classList.contains('active')) loadMarket(true);
      }, 30000);
    }
  });
  $('#btnPaste').addEventListener('click', pasteImport);
  $('#syncCodes').addEventListener('keydown', (e) => { if (e.key === 'Enter') syncCodes(); });
  bindDrop('#dropPrice', '#filePrice', 'price');
  bindDrop('#dropFund', '#fileFund', 'fund');

  $$('[data-preset]').forEach((btn) => btn.addEventListener('click', () => {
    state.weights = { ...PRESETS[btn.dataset.preset] };
    renderWeights();
    toast('已套用预设，记得点「应用并重算」');
  }));
  $('#btnApplyWeights').addEventListener('click', applyWeights);

  $('#btnCloseDrawer').addEventListener('click', closeDetail);
  $('#backdrop').addEventListener('click', closeDetail);
  $('#btnDelete').addEventListener('click', deleteCurrent);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });
}

/* ---------------- PWA ---------------- */
function setupPWA() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const hint = $('#installHint');
  if (!hint) return;
  if (isIOS && !standalone && !localStorage.getItem('sc-hint-closed')) {
    setTimeout(() => { hint.hidden = false; }, 2500);
  }
  $('#closeHint').addEventListener('click', () => {
    hint.hidden = true;
    localStorage.setItem('sc-hint-closed', '1');
  });
}

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  setupPWA();
  bindEvents();
  await loadState();
  const m = location.hash.match(/^#\/stock\/([0-9A-Za-z]+)(?:\/(day|week|month))?/);
  if (m) openDetail(m[1], m[2] || 'day');
  const t = location.hash.match(/^#\/tab\/(rank|upload|weights|market|sector)/);
  if (t) switchTab(t[1], false);
});
