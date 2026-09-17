// 策定九州・隊伍傷害試算器 前端 v4.2（分頁導覽＋圖鑑/兵種/S2＋試算器簡化UI）
/* global MODEL */
let DATA = null;

const TROOPS = ['盾兵', '弓兵', '騎兵'];
const TIERS = ['1階', '2階', '3階', '4階', '5階'];
const ATTRS = ['武力', '智力', '統率', '無'];
const DEFS = ['弓兵防禦', '盾兵防禦', '騎兵防禦', '無'];
const TRAITS = ['無', '天府', '武曲', '紫微', '廉貞', '巨門', '貪狼', '祿存', '天相', '破軍', '七殺', '天馬', '三台', '左輔', '文昌', '右弼', '天刑', '天鉞'];
const ADVS = ['0', '1', '2', '3', '4', '5'];
const ALLOCS = ['自動', '武力', '智力', '統率'];
// 武將清單以係數表（資料庫）為準：有資料的才能選；頭像只影響顯示不影響可選名單（init 時建立）
let GENERAL_LIST = [];

const PRESETS = [
  { label: '群騎', team: ['呂布', '貂蟬', '高順'], troop: '騎兵' },
  { label: '蜀盾', team: ['關羽', '張飛', '劉備'], troop: '盾兵' },
  { label: '蜀弓', team: ['諸葛亮', '法正', '黃月英'], troop: '弓兵' },
  { label: '蜀騎', team: ['馬超', '趙雲', '張星彩'], troop: '騎兵' },
  { label: '吳弓', team: ['周瑜', '小喬', '孫權'], troop: '弓兵' },
  { label: '呂布全弓', team: ['孫權', '周瑜', '呂布'], troop: '弓兵' },
];

// 對手預設（無星石、兵書Y、無額外增傷；進階星級可選）
const BATTLE_PRESETS = [
  { label: '桃園結義盾（劉備·張飛·關羽）', names: ['劉備', '張飛', '關羽'], troop: '盾兵' },
  { label: '燃燒弓（孫權·周瑜·小喬）', names: ['孫權', '周瑜', '小喬'], troop: '弓兵' },
  { label: '鬥智弓（諸葛亮·黃月英·法正）', names: ['諸葛亮', '黃月英', '法正'], troop: '弓兵' },
  { label: '魏騎（徐晃·典韋·曹操）', names: ['徐晃', '典韋', '曹操'], troop: '騎兵' },
  { label: '追擊騎（趙雲·馬超·關銀屏）', names: ['趙雲', '馬超', '關銀屏'], troop: '騎兵' },
];
let battleSel = { foe: -1, adv: 0 };   // foe: BATTLE_PRESETS 索引，-1=不對戰

// 每張卡片的狀態
let state = [];

function blankState() {
  return [0, 1, 2].map((i) => {
    const s = MODEL.defaultSlot('');
    s.pos = ['主將', '副將', '副將'][i];
    return s;
  });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function sel(options, value, onchange, cls) {
  const s = el('select', cls);
  options.forEach((o) => {
    const op = el('option', '', o);
    op.value = o;
    s.appendChild(op);
  });
  s.value = value;
  s.addEventListener('change', onchange);
  return s;
}

function numInput(value, oninput, placeholder, cls) {
  const i = document.createElement('input');
  i.type = 'number';
  i.step = 'any';
  i.value = value;
  i.placeholder = placeholder || '';
  if (cls) i.className = cls;
  i.addEventListener('input', oninput);
  return i;
}

function readTeam() {
  return state.map((s) => JSON.parse(JSON.stringify(s)));
}

// ---------- 分頁導覽 ----------

const TABS = ['calc', 'generals', 'troops', 's2'];

function switchTab(name, pushHash) {
  if (!TABS.includes(name)) name = 'calc';
  TABS.forEach((t) => {
    document.getElementById('tab-' + t).hidden = t !== name;
  });
  document.querySelectorAll('#tabs .tab').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === name);
  });
  if (pushHash !== false) {
    try { history.replaceState(null, '', '#tab=' + name); } catch (e) { /* file:// 環境略過 */ }
  }
}

function initTabs() {
  const m = location.hash.match(/tab=(\w+)/);
  switchTab(m ? m[1] : 'calc', false);
  document.querySelectorAll('#tabs .tab').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  window.addEventListener('hashchange', () => {
    const mm = location.hash.match(/tab=(\w+)/);
    switchTab(mm ? mm[1] : 'calc', false);
  });
}

// ---------- 試算器：三位武將卡片 ----------

function stoneSummaryText(s) {
  const parts = [];
  [1, 2].forEach((n) => {
    const st = s['s' + n];
    if (st.attr && st.attr !== '無' && MODEL.num(st.val)) parts.push(st.attr + '+' + st.val);
    if (st.def && st.def !== '無' && MODEL.num(st.defP)) parts.push(st.def.replace('兵防禦', '防') + Math.round(MODEL.num(st.defP) * 1000) / 10 + '%');
    if (st.trait && st.trait !== '無' && MODEL.num(st.traitP)) parts.push(st.trait + Math.round(MODEL.num(st.traitP) * 1000) / 10 + '%');
  });
  if (MODEL.num(s.extra)) parts.push('額外+' + Math.round(MODEL.num(s.extra) * 1000) / 10 + '%');
  return parts.length ? parts.join('｜') : '';
}

function renderTeam() {
  const wrap = document.getElementById('team');
  wrap.innerHTML = '';
  state.forEach((s, i) => {
    const card = el('div', 'card');
    card.appendChild(el('div', 'pos-tag', s.pos));

    // 頭像
    const pf = el('div', 'portrait');
    pf.dataset.idx = i;
    card.appendChild(pf);

    // 武將選擇
    const nameRow = el('div', 'row');
    nameRow.appendChild(el('label', '', '武將'));
    const nameSel = sel(GENERAL_LIST, s.name || '', () => { s.name = nameSel.value; refresh(); });
    nameRow.appendChild(nameSel);
    card.appendChild(nameRow);

    // 兵書 / 兵種 / 兵階
    const r2 = el('div', 'row triple');
    r2.appendChild(el('label', '', '兵書'));
    r2.appendChild(sel(['Y', 'N'], s.book, () => { s.book = r2.querySelectorAll('select')[0].value; refresh(); }));
    r2.appendChild(el('label', '', '兵種'));
    r2.appendChild(sel(TROOPS, s.troop, (e) => { s.troop = e.target.value; refresh(); }));
    r2.appendChild(el('label', '', '兵階'));
    r2.appendChild(sel(TIERS, s.tier, (e) => { s.tier = e.target.value; refresh(); }));
    card.appendChild(r2);

    // 進階階數 / 加點屬性
    const rAdv = el('div', 'row triple');
    rAdv.appendChild(el('label', '', '進階'));
    rAdv.appendChild(sel(ADVS, String(s.adv || 0), (e) => { s.adv = parseInt(e.target.value, 10) || 0; refresh(); }));
    rAdv.appendChild(el('label', '', '加點'));
    rAdv.appendChild(sel(ALLOCS, s.alloc || '自動', (e) => { s.alloc = e.target.value; refresh(); }));
    card.appendChild(rAdv);

    // 星石 ×2 ＋ 額外增傷（收進折疊區）
    const fold = el('details', 'stone-fold');
    const sum = el('summary', '', '星石・額外增傷');
    fold.appendChild(sum);
    [1, 2].forEach((n) => {
      const st = s['s' + n];
      const box = el('div', 'stone');
      box.appendChild(el('div', 'stone-title', '星石 ' + n + '（屬性＋防禦＋特技，皆選+填）'));
      const r1 = el('div', 'row');
      r1.appendChild(el('label', '', '屬性'));
      r1.appendChild(sel(ATTRS, st.attr, (e) => { st.attr = e.target.value; refresh(); }));
      r1.appendChild(numInput(st.val, (e) => { st.val = e.target.value; refresh(); }, '增加值'));
      const r2b = el('div', 'row');
      r2b.appendChild(el('label', '', '防禦'));
      r2b.appendChild(sel(DEFS, st.def, (e) => { st.def = e.target.value; refresh(); }));
      r2b.appendChild(numInput(st.defP, (e) => { st.defP = e.target.value; refresh(); }, '%小數'));
      const r3 = el('div', 'row');
      r3.appendChild(el('label', '', '特技'));
      r3.appendChild(sel(TRAITS, st.trait, (e) => { st.trait = e.target.value; refresh(); }));
      r3.appendChild(numInput(st.traitP, (e) => { st.traitP = e.target.value; refresh(); }, '%小數'));
      box.appendChild(r1); box.appendChild(r2b); box.appendChild(r3);
      fold.appendChild(box);
    });

    // 額外增傷
    const rX = el('div', 'row');
    rX.appendChild(el('label', '', '額外增傷'));
    rX.appendChild(numInput(s.extra, (e) => { s.extra = e.target.value; refresh(); }, '%小數（其他來源）'));
    fold.appendChild(rX);
    card.appendChild(fold);

    // 即時面板
    card.appendChild(el('div', 'stats', ''));
    card.dataset.idx = i;
    wrap.appendChild(card);
  });
}

function fmtAdv(sl) {
  const av = sl.av, pts = [];
  if (av.base) pts.push('技能傷害係數+' + av.base);
  if (av.sm) pts.push('自身技能傷害+' + Math.round(av.sm * 1000) / 10 + '%');
  if (av.team) pts.push('全隊技能傷害+' + Math.round(av.team * 1000) / 10 + '%');
  if (av.lead) pts.push('主將技能傷害+' + Math.round(av.lead * 1000) / 10 + '%');
  if (av.intl) pts.push('智力最高者技能傷害+' + Math.round(av.intl * 1000) / 10 + '%');
  if (av.wul) pts.push('武力最高者技能傷害+' + Math.round(av.wul * 1000) / 10 + '%');
  if (av.xprob) pts.push('額外效果發動機率+' + Math.round(av.xprob * 1000) / 10 + '%');
  if (av.vp) pts.push('易傷發動機率+' + Math.round(av.vp * 1000) / 10 + '%');
  if (av.tgt) pts.push('目標部曲數+' + av.tgt);
  if (av.pa) pts.push('普攻傷害+' + Math.round(av.pa * 1000) / 10 + '%');
  if (av.pts) pts.push('屬性點+' + av.pts + '(' + sl.alloc + ')');
  return pts.length ? pts.join('｜') : '';
}

function updateCardStats(slots) {
  const cards = document.querySelectorAll('#team .card');
  slots.forEach((sl, i) => {
    const card = cards[i];
    if (!card) return;
    const st = card.querySelector('.stats');
    // 星石折疊區摘要（有設才顯示）
    const sum = card.querySelector('.stone-fold summary');
    if (sum) {
      const txt = stoneSummaryText(state[i]);
      sum.textContent = txt ? '星石・額外增傷：' + txt : '星石・額外增傷';
      sum.classList.toggle('has-val', !!txt);
    }
    if (!sl) { st.innerHTML = '<span class="dim">未選武將</span>'; return; }
    const advTxt = fmtAdv(sl);
    st.innerHTML =
      '<div>適性 <b>' + sl.aff + '</b>（×' + sl.mul + '）｜陣營 ' + sl.fac + '｜進階 <b>' + (sl.adv || 0) + '階</b></div>' +
      '<div>發揮 武力 <b>' + sl.wu + '</b>｜智力 <b>' + sl.zhi + '</b></div>' +
      (advTxt ? '<div class="advline">' + advTxt + '</div>' : '') +
      (sl.defP ? '<div>星石防禦合計 <b>' + Math.round(sl.defP * 1000) / 10 + '%</b>（不計入傷害）</div>' : '') +
      '<div>單發快照 <b>' + sl._snap + '</b>｜普攻 <b>' + sl.na + '</b>/擊</div>';
  });
}

function renderSummary(r, team) {
  const c = document.getElementById('summaryCards');
  c.innerHTML = '';
  const facTxt = r.facB === 0.05 ? '3同陣營 +5%' : r.facB === 0.02 ? '2同陣營 +2%' : '無陣營加成';
  [
    ['H17快照', r.h17],
    ['穩態', r.steady],
    ['30秒', r.cum30],
    ['60秒', r.cum60],
    ['90秒技', r.cum90],
    ['90秒普(含追擊)', Math.round(r.na90)],
    ['90秒合計', Math.round(r.total90)],
    ['90秒治', r.heal90],
  ].forEach(([k, v]) => {
    const d = el('div', 'sum-card');
    d.appendChild(el('div', 'sum-k', k));
    d.appendChild(el('div', 'sum-v', String(v)));
    c.appendChild(d);
  });
  const badge = el('div', 'sum-card fac');
  badge.appendChild(el('div', 'sum-k', '陣營加成'));
  badge.appendChild(el('div', 'sum-v', facTxt));
  c.appendChild(badge);

  // v4.3：隊伍含追擊武將時顯示各將追擊率與普攻乘數
  const chasers = r.slots.filter((s) => s.chaseMult > 1);
  if (chasers.length) {
    const ch = el('div', 'sum-card fac');
    ch.appendChild(el('div', 'sum-k', '追擊'));
    ch.appendChild(el('div', 'sum-v', chasers.map((s) =>
      s.name + ' 追擊' + Math.round(s.chase.rate * 1000) / 10 + '%'
      + (s.chase.chain > 1 ? '×連鎖' + s.chase.chain : '')
      + '（普攻×' + s.chaseMult.toFixed(2) + '）').join('；')));
    c.appendChild(ch);
  }

  // 成員表（折疊區內）
  const mt = document.getElementById('memberTable');
  mt.innerHTML = '';
  const tb = el('table', 'member');
  tb.innerHTML = '<tr><th>位置</th><th>武將</th><th>進階</th><th>兵書</th><th>兵種</th><th>技能</th><th>快照傷害</th><th>快照治療</th><th>普攻/擊</th><th>增益窗口</th><th>易傷窗口</th></tr>';
  r.slots.forEach((sl, i) => {
    if (!sl) return;
    const tr = el('tr');
    const heal = Math.round(sl.c.heal + sl._snap * sl.c.ls);
    tr.innerHTML = '<td>' + ['主將', '副將', '副將'][i] + '</td><td>' + sl.name + '</td><td>' + (sl.adv || 0) +
      '</td><td>' + sl.book + '</td><td>' + sl.troop + sl.tier.replace('階', '') + '</td><td>' + sl.c.skill + '</td><td>' + sl._snap +
      '</td><td>' + heal + '</td><td>' + sl.na + '</td><td>' + sl.c.bfx + '</td><td>' + (sl.c.vfx || '—') + '</td>';
    tb.appendChild(tr);
  });
  mt.appendChild(tb);
}

function renderTimeline(r) {
  const tb = document.getElementById('timeline');
  tb.innerHTML = '<tr><th>#</th><th>秒</th><th>行動</th><th>技能</th><th>增益%</th><th>易傷×</th><th>傷害</th><th>治療</th><th>普攻</th><th>累計傷</th></tr>';
  r.ticks.forEach((tk) => {
    const tr = el('tr', 'tick' + (tk.m === 0 ? ' round-start' : ''));
    const pct = (x) => Math.round(x * 1000) / 10 + '%';
    const fx = (tk.myBuffs || tk.enemyFx)
      ? '<div class="fx-sub">' + (tk.myBuffs ? '我方：' + tk.myBuffs : '') + (tk.myBuffs && tk.enemyFx ? '；' : '') + (tk.enemyFx ? '敵方：' + tk.enemyFx : '') + '</div>'
      : '';
    tr.innerHTML =
      '<td>' + tk.i + '</td><td>' + tk.t + '</td>' +
      '<td class="actor"><img src="portraits/' + encodeURIComponent(tk.actor) + '.png" onerror="this.style.display=\'none\'" alt="">' + tk.actor + '</td>' +
      '<td class="skill">' + tk.skill + fx + '</td>' +
      '<td>' + pct(tk.buff) + '</td>' +
      '<td>×' + Math.round(tk.vuln * 1000) / 1000 + '</td>' +
      '<td class="dmg">' + tk.dmg + '</td>' +
      '<td class="heal">' + (tk.heal || '—') + '</td>' +
      '<td class="na">' + tk.na + '</td>' +
      '<td>' + tk.cumD + '</td>';
    tb.appendChild(tr);
  });
}

// ---------- 對打 ----------

function renderBattleControls() {
  const ctl = document.getElementById('battleCtl');
  ctl.innerHTML = '';
  ctl.appendChild(el('label', '', '對手'));
  const foeSel = el('select');
  [['-1', '不對戰']].concat(BATTLE_PRESETS.map((b, i) => [String(i), b.label])).forEach(([v, t]) => {
    const op = el('option', '', t);
    op.value = v;
    foeSel.appendChild(op);
  });
  foeSel.value = String(battleSel.foe);
  foeSel.addEventListener('change', () => { battleSel.foe = parseInt(foeSel.value, 10); refresh(); });
  ctl.appendChild(foeSel);
  ctl.appendChild(el('label', '', '對手進階'));
  ctl.appendChild(sel(ADVS, String(battleSel.adv), (e) => { battleSel.adv = parseInt(e.target.value, 10) || 0; refresh(); }));
}

// v4.4 雙方兵力曲線圖（純 SVG，無套件）：A 藍 / B 紅，淡色階梯背景=該側當下防禦%
function battleChartSVG(log) {
  const W = 680, H = 250, PL = 50, PR = 14, PT = 16, PB = 28;
  const iw = W - PL - PR, ih = H - PT - PB;
  const n = log.length;
  if (!n) return '';
  const maxT = log[n - 1].t || 90;
  const maxDef = Math.max(100, Math.max.apply(null, log.map((l) => Math.max(l.defA, l.defB))));
  const x = (t) => Math.round((PL + (t / maxT) * iw) * 10) / 10;
  const y = (v) => Math.round((PT + (1 - v / MODEL.MAX_TROOPS) * ih) * 10) / 10;
  const yDef = (d) => Math.round((PT + ih - (d / maxDef) * ih) * 10) / 10;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'battle-chart');
  const add = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    svg.appendChild(e);
    return e;
  };
  const txt = (cx, cy, s, anchor, cls) => {
    const e = add('text', { x: cx, y: cy, 'text-anchor': anchor || 'middle', 'class': cls || 'bt-ax' });
    e.textContent = s;
    return e;
  };
  // 防禦% 淡色階梯背景（值套用區間 t-3 ~ t）
  const defArea = (key, color) => {
    let d = 'M' + x(0) + ',' + yDef(log[0][key]);
    log.forEach((l) => { d += ' L' + Math.max(x(0), x(l.t - 3)) + ',' + yDef(l[key]) + ' L' + x(l.t) + ',' + yDef(l[key]); });
    d += ' L' + x(maxT) + ',' + (PT + ih) + ' L' + x(0) + ',' + (PT + ih) + ' Z';
    add('path', { d, fill: color, stroke: 'none' });
  };
  defArea('defA', 'rgba(90,140,220,0.12)');
  defArea('defB', 'rgba(220,90,80,0.12)');
  // 格線與軸標
  [0, MODEL.MAX_TROOPS / 2, MODEL.MAX_TROOPS].forEach((v) => {
    add('line', { x1: PL, y1: y(v), x2: W - PR, y2: y(v), 'class': 'bt-grid' });
    txt(PL - 6, y(v) + 4, String(Math.round(v)), 'end');
  });
  [0, 30, 60, 90].forEach((t) => {
    if (t > maxT) return;
    add('line', { x1: x(t), y1: PT, x2: x(t), y2: PT + ih, 'class': 'bt-grid' });
    txt(x(t), H - 8, t + 's');
  });
  // 兵力折線
  const line = (key, color) => {
    const pts = log.map((l) => x(l.t) + ',' + y(l[key])).join(' ');
    add('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' });
    log.forEach((l) => add('circle', { cx: x(l.t), cy: y(l[key]), r: 2, fill: color }));
  };
  line('troopsA', '#5a8cdc');
  line('troopsB', '#dc5a50');
  // 圖例
  const lg = el('div', 'bt-legend');
  lg.innerHTML = '<span class="bt-i" style="background:#5a8cdc"></span>我方兵力　<span class="bt-i" style="background:#dc5a50"></span>敵方兵力　'
    + '<span class="bt-i bt-i-a" style="background:rgba(90,140,220,0.35)"></span>我方防禦%背景　<span class="bt-i bt-i-a" style="background:rgba(220,90,80,0.35)"></span>敵方防禦%背景';
  const wrap = el('div', 'battle-chart-wrap');
  wrap.appendChild(svg);
  wrap.appendChild(lg);
  return wrap;
}

// v4.4 逐 tick 結算表（含防禦%/護盾/實際損兵）
function battleLogTable(br) {
  const tb = el('table', 'member battle-table bt-log');
  tb.innerHTML = '<tr><th>秒</th><th>我方<br>防禦%</th><th>我方<br>護盾</th><th>敵打我<br>raw</th><th>我方損兵</th>'
    + '<th>敵方<br>防禦%</th><th>敵方<br>護盾</th><th>我打敵<br>raw</th><th>敵方損兵</th><th>我方兵力</th><th>敵方兵力</th></tr>';
  br.log.forEach((l) => {
    const tr = el('tr');
    tr.innerHTML = '<td>' + l.t + '</td>'
      + '<td class="bt-def-a">' + l.defA + '%</td><td>' + (l.shA || '—') + '</td>'
      + '<td class="dim">' + l.rawB + '</td><td class="bt-loss">' + l.lossA + '</td>'
      + '<td class="bt-def-b">' + l.defB + '%</td><td>' + (l.shB || '—') + '</td>'
      + '<td class="dim">' + l.rawA + '</td><td class="bt-loss">' + l.lossB + '</td>'
      + '<td>' + l.troopsA + '</td><td>' + l.troopsB + '</td>';
    tb.appendChild(tr);
  });
  return tb;
}

function renderBattleResult(br, foeLabel) {
  const box = document.getElementById('battleResult');
  box.innerHTML = '';
  if (!br) { box.innerHTML = '<span class="dim">選擇對手後自動開戰</span>'; return; }

  const winA = br.winner === 'A';
  const banner = el('div', 'battle-banner ' + (br.winner === 'draw' ? 'draw' : winA ? 'win' : 'lose'),
    br.winner === 'draw' ? '平　手' : winA ? '我方勝利' : '敵方勝利');
  box.appendChild(banner);

  const grid = el('div', 'cards');
  const statCards = [
    ['用時', br.time + ' 秒'],
    ['我方剩餘兵力', br.troopsA],
    ['敵方剩餘兵力', br.troopsB + '（' + foeLabel + ' ' + battleSel.adv + '階）'],
    ['我方滿兵普攻/擊', br.naA + '×3'],
    ['敵方滿兵普攻/擊', br.naB + '×3'],
  ];
  if (br.counterA > 0) statCards.push(['我方反擊傷害', br.counterA]);   // v4.3
  if (br.counterB > 0) statCards.push(['敵方反擊傷害', br.counterB]);
  statCards.forEach(([k, v]) => {
    const d = el('div', 'sum-card');
    d.appendChild(el('div', 'sum-k', k));
    d.appendChild(el('div', 'sum-v', String(v)));
    grid.appendChild(d);
  });
  box.appendChild(grid);

  const tb = el('table', 'member battle-table');
  tb.innerHTML = '<tr><th></th><th>武將</th><th>累計輸出</th></tr>';
  br.namesA.forEach((n, i) => {
    const tr = el('tr');
    tr.innerHTML = '<td>我方</td><td>' + n + '</td><td>' + br.outA[i] + '</td>';
    tb.appendChild(tr);
  });
  br.namesB.forEach((n, i) => {
    const tr = el('tr', 'foe-row');
    tr.innerHTML = '<td>敵方</td><td>' + n + '</td><td>' + br.outB[i] + '</td>';
    tb.appendChild(tr);
  });
  box.appendChild(tb);

  // v4.4 雙方兵力曲線圖（純 SVG）
  box.appendChild(battleChartSVG(br.log));

  // 逐 tick 結算 log（折疊）：防禦%/護盾/raw/實際損兵/兵力
  const lg = el('details', 'fold battle-log');
  const sm = el('summary', '', '逐 tick 結算（防禦% / 護盾 / raw / 實際損兵）');
  lg.appendChild(sm);
  lg.appendChild(battleLogTable(br));
  box.appendChild(lg);
}

// ---------- 計算與連動 ----------

// 依武將名即時更新卡片頭像（有圖顯示圖、無圖顯示首字）
function updatePortraits(team) {
  const pfs = document.querySelectorAll('#team .portrait');
  team.forEach((s, i) => {
    const pf = pfs[i];
    if (!pf) return;
    pf.innerHTML = '';
    pf.classList.remove('no-img');
    if (!s.name) { pf.classList.add('no-img'); pf.textContent = '？'; return; }
    const img = document.createElement('img');
    img.src = 'portraits/' + encodeURIComponent(s.name) + '.png';
    img.alt = s.name;
    img.onerror = () => { pf.innerHTML = ''; pf.classList.add('no-img'); pf.textContent = s.name[0]; };
    pf.appendChild(img);
  });
}

function naOpts() {
  return {
    atkP: MODEL.num(document.getElementById('atkP').value),
    defP: MODEL.num(document.getElementById('defP').value),
    troopRatio: MODEL.num(document.getElementById('naRatio').value),
  };
}

function refresh() {
  const team = readTeam();
  const enemyInt = MODEL.num(document.getElementById('enemyInt').value) || 0;
  const targetCorr = document.getElementById('targetCorr').value === '' ? 1 : MODEL.num(document.getElementById('targetCorr').value);
  const valid = team.filter((s) => s.name && DATA.coef[s.name]);
  updatePortraits(team);

  if (valid.length < 3) {
    document.getElementById('summaryCards').innerHTML = '<span class="dim">請選滿 3 名武將</span>';
    document.getElementById('memberTable').innerHTML = '';
    document.getElementById('timeline').innerHTML = '';
    document.getElementById('battleResult').innerHTML = '<span class="dim">請選滿 3 名武將</span>';
    document.querySelectorAll('#team .card').forEach((card, i) => {
      const s = team[i];
      const st = card.querySelector('.stats');
      const sum = card.querySelector('.stone-fold summary');
      if (sum) {
        const txt = stoneSummaryText(state[i]);
        sum.textContent = txt ? '星石・額外增傷：' + txt : '星石・額外增傷';
        sum.classList.toggle('has-val', !!txt);
      }
      if (s && s.name && DATA.coef[s.name]) {
        const a = DATA.aff[s.name], at = DATA.attrs[s.name];
        const mul = { S: 1.2, A: 1, B: 0.8, C: 0.7 }[a[s.troop]] || 1;
        st.innerHTML = '<div>適性 <b>' + a[s.troop] + '</b>（×' + mul + '）｜陣營 ' + a.fac +
          '</div><div>發揮 武力 <b>' + Math.round(at.wu * mul * 10) / 10 + '</b>｜智力 <b>' + Math.round(at.zhi * mul * 10) / 10 + '</b></div>';
      }
    });
    return;
  }

  const opts = naOpts();
  opts.enemySpd = MODEL.num(document.getElementById('enemySpd').value) || 940;   // v4.2 移速差體系
  const r = MODEL.compute(team, enemyInt, targetCorr, opts);
  r.slots.forEach((sl, i) => { sl._snap = r.snap[i]; });
  updateCardStats(r.slots);
  renderSummary(r, team);
  renderTimeline(r);

  // 對打
  if (battleSel.foe >= 0) {
    const foe = BATTLE_PRESETS[battleSel.foe];
    const br = MODEL.battle(team, enemyInt, targetCorr, opts, { names: foe.names, troop: foe.troop, adv: battleSel.adv });
    renderBattleResult(br, foe.label.split('（')[0]);
  } else {
    renderBattleResult(null);
  }
}

function applyPreset(p) {
  state = p.team.map((n, i) => {
    const s = MODEL.defaultSlot(n);
    s.troop = p.troop;
    s.pos = ['主將', '副將', '副將'][i];
    return s;
  });
  renderTeam();
  refresh();
}

// ---------- 武將圖鑑 ----------

// 武將順序依 LUDENS GUIDE 武將總覽（guide.ludens.com.tw/sanguo-cedingjiuzhou/heroes/）
// 站內依 君主級→一階→二階 分段，此處依同序列扁平排列，不分段；表外武將（如S2新武將）排最後
const SITE_ORDER = ['劉備', '曹操', '孫權', '呂布', '諸葛亮', '郭嘉', '馬超', '周瑜', '陳宮', '張角', '典韋', '左慈', '于吉', '貂蟬', '孫堅', '趙雲', '張飛', '關羽', '小喬', '法正', '黃月英', '徐晃', '高順', '魏延', '徐庶', '魯肅', '呂玲綺', '關銀屏', '樂進', '關興', '張星彩', '張梁', '張苞', '孟獲', '張燕', '黃蓋', '荀攸', '廖化', '程普', '甘寧', '張寶', '程昱', '吳國太', '荀彧', '步練師', '曹丕', '糜竺', '王平', '公孫瓚'];
function siteRank(n) { const i = SITE_ORDER.indexOf(n); return i < 0 ? SITE_ORDER.length : i; }

let gFilter = { q: '', fac: '全部' };
let gOpen = {};   // 展開中的卡片

const ADV_LABELS = [
  ['base', '技能傷害係數', (v) => '+' + v],
  ['sm', '自身技能傷害', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['team', '全隊技能傷害', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['lead', '主將技能傷害', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['intl', '智力最高者技能傷害', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['wul', '武力最高者技能傷害', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['xprob', '額外效果發動機率', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['vp', '易傷發動機率', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['tgt', '目標部曲數', (v) => '+' + v],
  ['pa', '普攻傷害', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['pts', '屬性點', (v) => '+' + v],
  ['ls', '倒戈治療', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['spdPa', '每點移速差・普攻傷害', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
  ['spdSm', '每點移速差・技能傷害', (v) => '+' + Math.round(v * 1000) / 10 + '%'],
];

function fmtAdvStage(av) {
  const pts = [];
  ADV_LABELS.forEach(([k, label, fmt]) => {
    if (av[k]) pts.push(label + fmt(av[k]));
  });
  return pts.length ? pts.join('｜') : '—';
}

function activeSkillOf(name) {
  const list = (DATA.skills[name] || []);
  const act = list.find((sk) => sk.type === '主動');
  return act || list[0] || null;
}

function setAsLeader(name) {
  const s = MODEL.defaultSlot(name);
  s.pos = '主將';
  state[0] = s;
  renderTeam();
  refresh();
  switchTab('calc');
  window.scrollTo(0, 0);
}

function renderGallery() {
  const wrap = document.getElementById('gallery');
  wrap.innerHTML = '';
  const names = Object.keys(DATA.skills).sort((a, b) => siteRank(a) - siteRank(b) || a.localeCompare(b, 'zh-Hant'));
  names.forEach((name) => {
    const fac = (DATA.factions && DATA.factions[name]) || (DATA.aff[name] && DATA.aff[name].fac) || '—';
    if (gFilter.fac !== '全部' && fac !== gFilter.fac) return;
    if (gFilter.q && name.indexOf(gFilter.q) < 0) return;

    const card = el('div', 'g-card');
    // 頭像
    const pf = el('div', 'g-face');
    const img = document.createElement('img');
    img.src = 'portraits/' + encodeURIComponent(name) + '.png';
    img.alt = name;
    img.onerror = () => { pf.innerHTML = ''; pf.classList.add('no-img'); pf.textContent = name[0]; };
    pf.appendChild(img);
    card.appendChild(pf);
    card.appendChild(el('div', 'g-name', name));
    const meta = el('div', 'g-meta', fac + '・' + ((DATA.troopPref && DATA.troopPref[name]) || '—'));
    card.appendChild(meta);
    // 武力/智力
    const at = DATA.attrs[name];
    card.appendChild(el('div', 'g-attrs',
      at ? ('武 ' + at.wu + '｜智 ' + at.zhi) : '武力／智力 待補'));
    // 適性
    const af = DATA.aff[name];
    const affBox = el('div', 'g-aff');
    TROOPS.forEach((t) => {
      const v = af ? af[t] : null;
      const sp = el('span', 'aff-' + (v || 'none'), t.replace('兵', '') + ' ' + (v || '—'));
      affBox.appendChild(sp);
    });
    card.appendChild(affBox);
    // 主動技名
    const act = activeSkillOf(name);
    card.appendChild(el('div', 'g-skill', act ? ('主動：' + act.name) : '技能資料待補'));

    // 展開詳情
    const det = el('div', 'g-detail');
    if (act && act.desc) {
      det.appendChild(el('div', 'g-sec-title', '主動技・' + act.name));
      det.appendChild(el('p', 'g-desc', act.desc));
    }
    const others = (DATA.skills[name] || []).filter((sk) => sk !== act);
    if (others.length) {
      det.appendChild(el('div', 'g-sec-title', '其餘技能'));
      others.forEach((sk) => {
        const line = el('div', 'g-skill-line');
        line.appendChild(el('b', '', sk.name));
        line.appendChild(el('span', 'g-skill-meta',
          (sk.type || '—') + (sk.target ? '・' + sk.target : '') + (sk.lv ? '・' + sk.lv : '')));
        if (sk.desc) line.appendChild(el('div', 'g-desc', sk.desc));
        det.appendChild(line);
      });
    }
    const adv = DATA.adv && DATA.adv[name];
    if (adv) {
      det.appendChild(el('div', 'g-sec-title', '進階效果（0→5階，累積）'));
      const tb = el('table', 'member g-adv');
      tb.innerHTML = '<tr><th>階段</th><th>效果</th></tr>';
      adv.forEach((av, lv) => {
        const tr = el('tr');
        tr.innerHTML = '<td>' + lv + '階</td><td>' + fmtAdvStage(av) + '</td>';
        tb.appendChild(tr);
      });
      det.appendChild(tb);
    }
    // 設為主將
    if (DATA.coef[name]) {
      const btn = el('button', 'preset', '設為主將');
      btn.addEventListener('click', (e) => { e.stopPropagation(); setAsLeader(name); });
      det.appendChild(btn);
    } else {
      det.appendChild(el('div', 'dim g-note', '※ 試算器尚未收錄此武將（S2新武將，屬性數值待補）'));
    }
    card.appendChild(det);
    card.classList.toggle('open', !!gOpen[name]);

    card.addEventListener('click', () => {
      gOpen[name] = !gOpen[name];
      card.classList.toggle('open', gOpen[name]);
    });
    wrap.appendChild(card);
  });
  if (!wrap.children.length) wrap.appendChild(el('p', 'dim', '沒有符合條件的武將'));
}

function initGallery() {
  const fw = document.getElementById('gFactions');
  ['全部', '魏', '蜀', '吳', '群'].forEach((f) => {
    const b = el('button', 'chip' + (f === '全部' ? ' on' : ''), f);
    b.addEventListener('click', () => {
      gFilter.fac = f;
      fw.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.textContent === f));
      renderGallery();
    });
    fw.appendChild(b);
  });
  document.getElementById('gSearch').addEventListener('input', (e) => {
    gFilter.q = e.target.value.trim();
    renderGallery();
  });
  renderGallery();
}

// ---------- 兵種分頁 ----------

const TROOP_INFO = {
  '盾兵': { role: '攔截前排：近戰近 0 射程，高防禦頂在前線吸收傷害', coef: 1, spdRule: '各階恆為 940' },
  '騎兵': { role: '高機動切入：移速全兵種最快，貼臉核爆與追擊繞後', coef: 4, spdRule: '每階 +20（1120→1200）' },
  '弓兵': { role: '遠程高攻：射程 5000→6000，高攻低防需前排掩護', coef: 6, spdRule: '各階恆為 940' },
};

function renderTroopPage() {
  const wrap = document.getElementById('troopPage');
  wrap.innerHTML = '';
  TROOPS.forEach((t) => {
    const info = TROOP_INFO[t];
    const card = el('div', 'troop-card');
    card.appendChild(el('h3', '', t));
    card.appendChild(el('p', 't-role', info.role));
    card.appendChild(el('p', 'hint', '普攻兵種系數：' + info.coef + '｜基礎移速：' + info.spdRule));
    const tb = el('table', 'member');
    tb.innerHTML = '<tr><th>階段</th><th>攻擊</th><th>防禦</th><th>生命</th><th>移速</th><th>攻城值</th><th>射程</th></tr>';
    const stats = (DATA.troopStats && DATA.troopStats[t]) || {};
    Object.keys(stats).forEach((st) => {
      const v = stats[st];
      const tr = el('tr');
      tr.innerHTML = '<td>' + st + '</td><td>' + v.atk + '</td><td>' + v.def + '</td><td>' + v.hp +
        '</td><td>' + v.spd + '</td><td>' + v.siege + '</td><td>' + v.range + '</td>';
      tb.appendChild(tr);
    });
    card.appendChild(tb);
    wrap.appendChild(card);
  });
  const note = el('div', 'troop-note');
  note.appendChild(el('h3', '', '兵種適性制度'));
  note.appendChild(el('p', '', 'S＝120%｜A＝100%｜B＝80%｜C＝70%，各武將適性請見「武將圖鑑」。'));
  note.appendChild(el('p', 'hint', '備註：攻擊／防禦基礎值固定，綠字加成來自兵營科技／建築，因玩家而異。移速差機制（如趙雲追擊、泥潭減速）以基礎移速為基準計算。'));
  wrap.appendChild(note);
}

// ---------- S2 分頁 ----------

function renderS2Page() {
  const wrap = document.getElementById('s2Page');
  wrap.innerHTML = '';
  const s2 = DATA.s2 || { troops: [], beasts: [], rules: [], notes: [], newGenerals: [] };

  wrap.appendChild(el('h2', 's2-title', '六大新兵種（特殊兵種，解鎖：對應兵營 12 級）'));
  const tg = el('div', 's2-grid');
  s2.troops.forEach((t) => {
    const c = el('div', 's2-card');
    c.appendChild(el('div', 'g-name', t.name));
    c.appendChild(el('div', 'g-meta', '基礎兵種：' + (t.base || '—')));
    c.appendChild(el('p', 'g-desc', '機制：' + t.mech));
    c.appendChild(el('p', 'g-desc', '編隊影響：' + t.impact));
    if (t.pending) c.appendChild(el('p', 'pending', '數值待官方公布：' + t.pending));
    tg.appendChild(c);
  });
  wrap.appendChild(tg);

  wrap.appendChild(el('h2', 's2-title', '三大神獸（聯盟級戰略兵器，不佔武將編制）'));
  const bg = el('div', 's2-grid');
  s2.beasts.forEach((b) => {
    const c = el('div', 's2-card');
    c.appendChild(el('div', 'g-name', b.name));
    c.appendChild(el('div', 'g-meta', '定位：' + (b.role || '—')));
    c.appendChild(el('p', 'g-desc', '已知資訊：' + b.known));
    c.appendChild(el('p', 'g-desc', '編隊影響：' + b.impact));
    bg.appendChild(c);
  });
  wrap.appendChild(bg);

  wrap.appendChild(el('h2', 's2-title', '神獸共通規則'));
  const rl = el('ol', 's2-list');
  s2.rules.forEach((r) => rl.appendChild(el('li', '', r)));
  wrap.appendChild(rl);

  wrap.appendChild(el('h2', 's2-title', '對現有五隊編成的總結影響與待確認事項'));
  const nl = el('ol', 's2-list');
  s2.notes.forEach((n) => nl.appendChild(el('li', '', n)));
  wrap.appendChild(nl);

  wrap.appendChild(el('h2', 's2-title', 'S2 新武將（已知資料）'));
  const ng = el('div', 's2-grid');
  s2.newGenerals.forEach((g) => {
    const c = el('div', 's2-card');
    c.appendChild(el('div', 'g-name', g.name));
    c.appendChild(el('div', 'g-meta', (g.faction || '—') + '・' + (g.troop || '—') + '｜屬性數值待補'));
    (g.skills || []).forEach((sk) => {
      const line = el('div', 'g-skill-line');
      line.appendChild(el('b', '', sk.name));
      line.appendChild(el('span', 'g-skill-meta',
        (sk.type || '—') + (sk.target ? '・' + sk.target : '')));
      if (sk.desc) line.appendChild(el('div', 'g-desc', sk.desc));
      c.appendChild(line);
    });
    ng.appendChild(c);
  });
  wrap.appendChild(ng);

  wrap.appendChild(el('p', 'hint s2-src',
    '資料來源：' + (s2.source || '') + '。所有數值以遊戲內為準。'));
}

// ---------- 初始化 ----------

function init() {
  fetch('data.json').then((r) => r.json()).then((data) => {
    DATA = window.DATA = data;
    MODEL._setData && MODEL._setData(data);
    GENERAL_LIST = Object.keys(data.coef).sort();

    // 對手名單檢查（缺資料的預設隱藏）
    BATTLE_PRESETS.forEach((b) => { b.ok = b.names.every((n) => data.coef[n]); });
    const missing = BATTLE_PRESETS.filter((b) => !b.ok);
    if (missing.length) console.warn('對手預設缺資料：', missing.map((b) => b.label));

    // Presets（短按鈕 chips）
    const pw = document.getElementById('presets');
    PRESETS.forEach((p) => {
      const b = el('button', 'preset', p.label);
      b.addEventListener('click', () => applyPreset(p));
      pw.appendChild(b);
    });
    const clear = el('button', 'preset clear', '清空');
    clear.addEventListener('click', () => { state = blankState(); renderTeam(); refresh(); });
    pw.appendChild(clear);

    ['enemyInt', 'enemySpd', 'targetCorr', 'atkP', 'defP', 'naRatio'].forEach((id) =>
      document.getElementById(id).addEventListener('input', refresh));

    initTabs();
    initGallery();
    renderTroopPage();
    renderS2Page();

    renderBattleControls();
    state = blankState();
    applyPreset(PRESETS[0]);
  });
}

document.addEventListener('DOMContentLoaded', init);
