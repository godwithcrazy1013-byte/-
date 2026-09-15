// 策定九州・隊伍傷害試算器 前端
/* global MODEL */
let DATA = null;

const TROOPS = ['盾兵', '弓兵', '騎兵'];
const TIERS = ['1階', '2階', '3階', '4階', '5階'];
const ATTRS = ['武力', '智力', '統率', '無'];
const DEFS = ['弓兵防禦', '盾兵防禦', '騎兵防禦', '無'];
const TRAITS = ['無', '天府', '武曲', '紫微', '廉貞', '巨門', '貪狼', '祿存', '天相', '破軍', '七殺', '天馬', '三台', '左輔', '文昌', '右弼', '天刑', '天鉞'];

const PRESETS = [
  { label: '群騎（呂布·貂蟬·高順／騎）', team: ['呂布', '貂蟬', '高順'], troop: '騎兵', exp: 'H17≈3528｜穩態≈4597｜30秒≈15267' },
  { label: '蜀盾（關羽·張飛·劉備／盾）', team: ['關羽', '張飛', '劉備'], troop: '盾兵', exp: 'H17≈2219｜穩態≈2196｜30秒≈7959' },
  { label: '蜀弓（諸葛亮·法正·黃月英／弓）', team: ['諸葛亮', '法正', '黃月英'], troop: '弓兵', exp: 'H17≈1744｜穩態≈1744｜30秒≈6106' },
  { label: '蜀騎（馬超·趙雲·張星彩／騎）', team: ['馬超', '趙雲', '張星彩'], troop: '騎兵', exp: 'H17≈813｜穩態≈813｜30秒≈2783' },
  { label: '吳弓（周瑜·小喬·孫權／弓）', team: ['周瑜', '小喬', '孫權'], troop: '弓兵', exp: 'H17≈2487｜穩態≈2249｜30秒≈7582' },
  { label: '呂布全弓（孫權·周瑜·呂布／弓）', team: ['孫權', '周瑜', '呂布'], troop: '弓兵', exp: 'H17≈2594（呂布按100%）' },
];

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

// ---------- 渲染 ----------

function renderTeam() {
  const wrap = document.getElementById('team');
  wrap.innerHTML = '';
  state.forEach((s, i) => {
    const card = el('div', 'card');
    card.appendChild(el('div', 'pos-tag', s.pos));

    // 頭像
    const pf = el('div', 'portrait');
    const img = document.createElement('img');
    img.src = s.name ? 'portraits/' + encodeURIComponent(s.name) + '.png' : '';
    img.alt = s.name || '';
    img.onerror = () => { img.style.display = 'none'; pf.classList.add('no-img'); pf.textContent = s.name ? s.name[0] : '？'; };
    img.onload = () => { img.style.display = ''; pf.classList.remove('no-img'); };
    if (s.name) pf.appendChild(img); else { pf.classList.add('no-img'); pf.textContent = '？'; }
    card.appendChild(pf);

    // 武將選擇
    const nameRow = el('div', 'row');
    nameRow.appendChild(el('label', '', '武將'));
    const nameSel = sel(DATA.portraits, s.name || '', () => { s.name = nameSel.value; refresh(); });
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

    // 星石 ×2
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
      card.appendChild(box);
    });

    // 額外增傷
    const rX = el('div', 'row');
    rX.appendChild(el('label', '', '額外增傷'));
    rX.appendChild(numInput(s.extra, (e) => { s.extra = e.target.value; refresh(); }, '%小數（其他來源）'));
    card.appendChild(rX);

    // 即時面板
    card.appendChild(el('div', 'stats', ''));
    card.dataset.idx = i;
    wrap.appendChild(card);
  });
}

function updateCardStats(slots) {
  const cards = document.querySelectorAll('#team .card');
  slots.forEach((sl, i) => {
    const st = cards[i] && cards[i].querySelector('.stats');
    if (!st) return;
    if (!sl) { st.innerHTML = '<span class="dim">未選武將</span>'; return; }
    st.innerHTML =
      '<div>適性 <b>' + sl.aff + '</b>（×' + sl.mul + '）｜陣營 ' + sl.fac + '</div>' +
      '<div>發揮 武力 <b>' + sl.wu + '</b>｜智力 <b>' + sl.zhi + '</b></div>' +
      (sl.defP ? '<div>星石防禦合計 <b>' + Math.round(sl.defP * 1000) / 10 + '%</b>（不計入傷害）</div>' : '') +
      '<div>單發快照 <b>' + sl._snap + '</b></div>';
  });
}

function renderSummary(r, team) {
  const c = document.getElementById('summaryCards');
  c.innerHTML = '';
  const facTxt = r.facB === 0.05 ? '3同陣營 +5%' : r.facB === 0.02 ? '2同陣營 +2%' : '無陣營加成';
  [
    ['H17 靜態快照', r.h17],
    ['穩態（第4輪）', r.steady],
    ['30秒累計', r.cum30],
    ['60秒累計', r.cum60],
    ['90秒累計', r.cum90],
    ['90秒治療', r.heal90],
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

  // 成員表
  const mt = document.getElementById('memberTable');
  mt.innerHTML = '';
  const tb = el('table', 'member');
  tb.innerHTML = '<tr><th>位置</th><th>武將</th><th>兵書</th><th>兵種</th><th>技能</th><th>快照傷害</th><th>快照治療</th><th>增益窗口</th><th>易傷窗口</th></tr>';
  r.slots.forEach((sl, i) => {
    if (!sl) return;
    const tr = el('tr');
    const heal = Math.round(sl.c.heal + sl._snap * sl.c.ls);
    tr.innerHTML = '<td>' + ['主將', '副將', '副將'][i] + '</td><td>' + sl.name + '</td><td>' + sl.book +
      '</td><td>' + sl.troop + sl.tier.replace('階', '') + '</td><td>' + sl.c.skill + '</td><td>' + sl._snap +
      '</td><td>' + heal + '</td><td>' + sl.c.bfx + '</td><td>' + (sl.c.vfx || '—') + '</td>';
    tb.appendChild(tr);
  });
  mt.appendChild(tb);
}

function renderTimeline(r) {
  const tb = document.getElementById('timeline');
  tb.innerHTML = '<tr><th>#</th><th>秒</th><th>行動</th><th>技能</th><th>窗口增益</th><th>易傷乘區</th><th>傷害</th><th>治療</th><th>我方增益狀態</th><th>敵方效果</th><th>累計傷</th><th>累計治</th></tr>';
  r.ticks.forEach((tk) => {
    const tr = el('tr', 'tick' + (tk.m === 0 ? ' round-start' : ''));
    const pct = (x) => Math.round(x * 1000) / 10 + '%';
    tr.innerHTML =
      '<td>' + tk.i + '</td><td>' + tk.t + '</td>' +
      '<td class="actor"><img src="portraits/' + encodeURIComponent(tk.actor) + '.png" onerror="this.style.display=\'none\'" alt="">' + tk.actor + '</td>' +
      '<td class="skill">' + tk.skill + '</td>' +
      '<td>' + pct(tk.buff) + '</td>' +
      '<td>×' + Math.round(tk.vuln * 1000) / 1000 + '</td>' +
      '<td class="dmg">' + tk.dmg + '</td>' +
      '<td class="heal">' + (tk.heal || '—') + '</td>' +
      '<td class="fx">' + (tk.myBuffs || '—') + '</td>' +
      '<td class="fx">' + (tk.enemyFx || '—') + '</td>' +
      '<td>' + tk.cumD + '</td><td>' + tk.cumH + '</td>';
    tb.appendChild(tr);
  });
}

// ---------- 計算與連動 ----------

function refresh() {
  const team = readTeam();
  const enemyInt = MODEL.num(document.getElementById('enemyInt').value) || 0;
  const targetCorr = document.getElementById('targetCorr').value === '' ? 1 : MODEL.num(document.getElementById('targetCorr').value);
  const valid = team.filter((s) => s.name && DATA.coef[s.name]);

  if (valid.length < 3) {
    document.getElementById('summaryCards').innerHTML = '<span class="dim">請選滿 3 名武將</span>';
    document.getElementById('memberTable').innerHTML = '';
    document.getElementById('timeline').innerHTML = '';
    // 仍顯示已選卡片的基本數值
    team.forEach((s, i) => {
      if (s.name && DATA.coef[s.name]) {
        const a = DATA.aff[s.name], at = DATA.attrs[s.name];
        const mul = { S: 1.2, A: 1, B: 0.8, C: 0.7 }[a[s.troop]] || 1;
        const cards = document.querySelectorAll('#team .card .stats');
        if (cards[i]) cards[i].innerHTML = '<div>適性 <b>' + a[s.troop] + '</b>（×' + mul + '）｜陣營 ' + a.fac +
          '</div><div>發揮 武力 <b>' + Math.round(at.wu * mul * 10) / 10 + '</b>｜智力 <b>' + Math.round(at.zhi * mul * 10) / 10 + '</b></div>';
      }
    });
    return;
  }

  const r = MODEL.compute(team, enemyInt, targetCorr);
  r.slots.forEach((sl, i) => { sl._snap = r.snap[i]; });
  updateCardStats(r.slots);
  renderSummary(r, team);
  renderTimeline(r);
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

function init() {
  fetch('data.json').then((r) => r.json()).then((data) => {
    DATA = window.DATA = data;
    MODEL._setData && MODEL._setData(data);

    // Presets
    const pw = document.getElementById('presets');
    PRESETS.forEach((p) => {
      const b = el('button', 'preset', p.label);
      b.title = p.exp;
      b.addEventListener('click', () => applyPreset(p));
      pw.appendChild(b);
    });
    const clear = el('button', 'preset clear', '清空重組');
    clear.addEventListener('click', () => { state = blankState(); renderTeam(); refresh(); });
    pw.appendChild(clear);

    ['enemyInt', 'targetCorr'].forEach((id) => document.getElementById(id).addEventListener('input', refresh));

    state = blankState();
    applyPreset(PRESETS[0]);
  });
}

document.addEventListener('DOMContentLoaded', init);
