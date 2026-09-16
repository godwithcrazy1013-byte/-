// 策定九州傷害模型 v4.3（與 Excel 試算器 v4.2/行動時間軸 v6 公式一致；Node 與瀏覽器共用）
// v4.1：兵種系數鎖死（盾1/騎4/弓6，雙戰報校準）；新增簡易對打引擎 battle()
// v4.2：進階效果正式接入——倒戈(ls)/移速差普攻(spdPa)/移速差sm(spdSm)，含敵方移速 opts.enemySpd
// v4.3：追擊/反擊 v1——data.json skills 的 chase/counter 結構欄位正式入公式
//       追擊：額外普攻期望=rate×chainFactor（chainFactor=Σ rate^(k-1) 幾何和），普攻乘數=1+rate×chainFactor
//       反擊：僅 battle() 實作（compute() 無敵方資料，僅回傳 slot.counter 供顯示）；
//             每 tick 敵方三將各普攻一次(=受普攻3次)，tick=3秒 → 每 tick 反擊次數=min(3, cap×3)
//             遠程普攻 trigger v1 視同普攻；樂進「每100移速差+1%反擊機率」未實作（TODO）
//       校準：COUNTER_K=2.0 保守值（張角實測5.6/次係數1.8-2.6、樂進5.7/次係數2.8，反推K≈2.0-2.5）；
//             基礎機率未含「受武力/智力影響」加成（實測趙雲追擊37-39% vs 基礎15%），待校
// v4.1：兵種系數鎖死（盾1/騎4/弓6，雙戰報校準）；新增簡易對打引擎 battle()
// v4.2：進階效果正式接入——倒戈(ls)/移速差普攻(spdPa)/移速差sm(spdSm)，含敵方移速 opts.enemySpd
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MODEL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const round1 = (v) => Math.round(v * 10) / 10;
  const affMul = (a) => (a === 'S' ? 1.2 : a === 'A' ? 1 : a === 'B' ? 0.8 : 0.7);
  const ZERO_ADV = { base: 0, sm: 0, team: 0, lead: 0, intl: 0, wul: 0, pa: 0, xprob: 0, vp: 0, tgt: 0, pts: 0, ls: 0, spdPa: 0, spdSm: 0 };
  const NA_K = 5.37;                    // 普攻校準K（5階盾滿兵每擊，2026-09-08戰報）
  const COUNTER_K = 2.0;                // v4.3 反擊校準K：每跳傷害=係數×K（張角實測5.6/次、樂進5.7/次 → K≈2.0-2.5，取2.0保守）
  const TROOP_FAC = { '盾兵': 1, '騎兵': 4, '弓兵': 6 }; // 兵種系數（鎖死：盾5.3/騎≈20/弓≈31-37 每擊校準）
  const MAX_TROOPS = 24000;             // 雙方兵力（8000×3）

  // 兵種階段移速（兵種基礎數據分頁）；缺省 940。data.json 用中文階數鍵，此處相容阿拉伯數字
  const TIER_CN = { '1階': '一階', '2階': '二階', '3階': '三階', '4階': '四階', '5階': '五階' };
  function speedOf(troop, tier) {
    const t = DATA.troopSpeed && DATA.troopSpeed[troop];
    return (t && (t[tier] || t[TIER_CN[tier]])) || 940;
  }

  function defaultSlot(name) {
    return {
      name: name || '', book: 'Y', troop: '騎兵', tier: '5階',
      adv: 0, alloc: '自動',
      s1: { attr: '無', val: '', def: '無', defP: '', trait: '無', traitP: '' },
      s2: { attr: '無', val: '', def: '無', defP: '', trait: '無', traitP: '' },
      extra: '',
    };
  }

  function getAdv(name, adv) {
    return (DATA.adv && DATA.adv[name] && DATA.adv[name][adv | 0]) || ZERO_ADV;
  }

  // v4.3：從 DATA.skills[name] 彙總追擊/反擊結構（chase/counter 欄位由匯出管線從技能描述解析）
  // 追擊：rate 為各 entry 機率加總（專武裝備加成計入），chain 取最大；
  //       額外普攻期望 = rate×chainFactor，chainFactor=Σ_{k=1..chain} rate^(k-1)（chain>1 遞減近似）
  function chaseOf(name) {
    const entries = (DATA.skills && DATA.skills[name]) || [];
    let rate = 0, chain = 1;
    for (const e of entries) {
      if (!e.chase) continue;
      rate += num(e.chase.rate);
      if (e.chase.chain && e.chase.chain > chain) chain = e.chase.chain | 0;
    }
    if (rate <= 0) return null;
    let cf = 0;
    for (let k = 0; k < chain; k++) cf += Math.pow(rate, k);
    return { rate, chain, chainFactor: cf, mult: 1 + rate * cf };
  }
  // 反擊：rate 加總、coef 取最高、cap 取最小（v1 近似）；遠程普攻 trigger v1 視同普攻（模型不區分遠近）
  function counterOf(name) {
    const entries = (DATA.skills && DATA.skills[name]) || [];
    let rate = 0, coef = 0, cap = 999, ranged = false, has = false;
    for (const e of entries) {
      if (!e.counter) continue;
      has = true;
      rate += num(e.counter.rate);
      if (num(e.counter.coef) > coef) coef = num(e.counter.coef);
      if (num(e.counter.cap) > 0 && num(e.counter.cap) < cap) cap = num(e.counter.cap);
      if (e.counter.trigger === '遠程普攻') ranged = true;
    }
    if (!has) return null;
    return { rate, coef, cap, trigger: ranged ? '遠程普攻(v1視同普攻)' : '普攻' };
  }
  // 每 tick 反擊期望傷害：敵方三將各普攻一次(受普攻3次)；cap 為每秒上限、tick=3秒 → 次數=min(3, cap×3)
  function counterTick(slot, ratio) {
    if (!slot.counter) return 0;
    return Math.min(3, slot.counter.cap * 3) * slot.counter.rate * slot.counter.coef * COUNTER_K * ratio;
  }

  function buildSlots(team, opts) {
    opts = opts || {};
    const atkP = opts.atkP !== undefined ? num(opts.atkP) : 1.305;
    const defP = opts.defP !== undefined ? num(opts.defP) : 1.346;
    const tgtPer = opts.tgtPer !== undefined ? num(opts.tgtPer) : 0.2;
    const spdDiff = Math.max(0, num(opts.spdDiff));   // v4.2：我方移速 - 敵方移速（負取0）
    const fac = Object.assign({}, TROOP_FAC, opts.troopFac || {});
    return team.map((s) => {
      const c = DATA.coef[s.name], a = DATA.aff[s.name], at = DATA.attrs[s.name];
      const av = getAdv(s.name, s.adv);
      const mul = affMul(a[s.troop]);
      const add = (st) => (s.s1.attr === st ? num(s.s1.val) : 0) + (s.s2.attr === st ? num(s.s2.val) : 0);
      // 加點屬性：自動=主屬性（裸智力≥裸武力→智力）
      const autoAttr = at.zhi >= at.wu ? '智力' : '武力';
      const alloc = s.alloc === '自動' || !s.alloc ? autoAttr : s.alloc;
      const pts = av.pts;
      const spdSmEff = av.spdSm * spdDiff;            // v4.2：移速差→技能傷害
      const chase = chaseOf(s.name);                  // v4.3：追擊（額外普攻期望）
      return Object.assign({}, s, {
        c, fac: a.fac, mul, aff: a[s.troop], av, alloc, spdSmEff,
        chase, chaseMult: chase ? chase.mult : 1, counter: counterOf(s.name),
        wu: round1(at.wu * mul + add('武力') + (alloc === '武力' ? pts : 0)),
        zhi: round1(at.zhi * mul + add('智力') + (alloc === '智力' ? pts : 0)),
        defP: num(s.s1.defP) + num(s.s2.defP),
        // 滿兵每擊普攻（v5模型；兵力衰減由 battle() 依剩餘兵力動態乘）
        na: Math.round(NA_K * (fac[s.troop] !== undefined ? fac[s.troop] : 1) * (1 + atkP) / (1 + defP) * (1 + av.pa + av.spdPa * spdDiff) * 10) / 10,
      });
    });
  }

  function dmg(slot, i, t, ctx) {
    const av = slot.av;
    const base = (slot.name === '呂布' && slot.troop !== '騎兵' ? 612 : slot.c.base) + av.base;
    const zhuge = slot.name === '諸葛亮'
      ? 3.6 * Math.max(0, slot.zhi - ctx.enemyInt) * (slot.book === 'Y' ? 1.154 : 1) * (1 + (slot.adv >= 5 ? 0.1 : 0))
      : 0;
    let sm = slot.c.sm + av.sm + slot.spdSmEff;
    if (t !== null && slot.name === '呂布') {
      sm = (slot.book === 'N' ? 0 : Math.min(0.022 * t, 0.95)) + (t >= 3 * (i + 1) + 9 ? 0.5 : 0);
    }
    const exsm = slot.book === 'N' ? slot.c.exsm : 0;
    const trick = num(slot.s1.traitP) + num(slot.s2.traitP);
    const inner = 1 + sm - exsm + ctx.buff + trick + num(slot.extra);
    return Math.round(
      (base + slot.c.dot + zhuge) * inner
      * (1 + av.xprob) * (1 + ctx.tgtPer * av.tgt)
      * ctx.vuln * (1 + ctx.facB) * ctx.targetCorr
    );
  }

  // 隊伍內部結構（增益網格/陣營/易傷乘區/每tick時間軸），對手與我方共用
  // spdDiff 為 v4.2 新增參數：移速差效果已在 buildSlots 內加成到 slot（spdSmEff / na），此處僅保留介面一致性
  function teamCore(slots, enemyInt, targetCorr, tgtPer, spdDiff) {
    const argW = slots.findIndex((s) => s.wu === Math.max.apply(null, slots.map((x) => x.wu)));
    const argZ = slots.findIndex((s) => s.zhi === Math.max.apply(null, slots.map((x) => x.zhi)));
    const f = slots.map((s) => s.fac);
    const facB = f[0] === f[1] && f[1] === f[2] ? 0.05 : (f[0] === f[1] || f[0] === f[2] || f[1] === f[2]) ? 0.02 : 0;

    const grid = slots.map((src, s) => slots.map((dst, r) => {
      const t = (rule, pct) => rule === '全體' ? pct
        : r === s ? 0
        : rule === '主將' ? (r === 0 ? pct : 0)
        : rule === '武力最高' ? (r === argW ? pct : 0)
        : rule === '智力最高' ? (r === argZ ? pct : 0)
        : rule === '其他' ? pct : 0;
      return t(src.c.b1r, src.c.b1p) + t(src.c.b2r, src.c.b2p);
    }));

    // 進階團隊sm：全隊sm + 主將sm(僅主將槽) + 智鏈(餵智力最高者) + 武鏈(餵武力最高者)
    const teamSm = slots.reduce((p, s) => p + s.av.team, 0) + slots[0].av.lead;
    const intlSm = slots.reduce((p, s) => p + s.av.intl, 0);
    const wulSm = slots.reduce((p, s) => p + s.av.wul, 0);
    const recv = slots.map((_, r) =>
      grid[0][r] + grid[1][r] + grid[2][r] + teamSm + (r === argZ ? intlSm : 0) + (r === argW ? wulSm : 0));

    const vulnAll = slots.reduce((p, s) => p * (1 + (s.c.vjp + s.av.vp) * s.c.vk), 1);
    const snap = slots.map((s, i) => dmg(s, i, null, { buff: recv[i], vuln: vulnAll, facB, targetCorr, enemyInt, tgtPer }));

    const ticks = [];
    for (let i = 0; i < 30; i++) {
      const t = 3 * (i + 1), m = i % 3;
      const gB = (s) => slots[s].c.bdur >= 99 ? 1 : (t >= 3 * (s + 1) && (t - 3 * (s + 1)) % 9 < slots[s].c.bdur ? 1 : 0);
      const gV = (s) => (t >= 3 * (s + 1) && (t - 3 * (s + 1)) % 9 < slots[s].c.vdur) ? 1 : 0;
      const buff = grid[0][m] * gB(0) + grid[1][m] * gB(1) + grid[2][m] * gB(2)
        + teamSm + (m === argZ ? intlSm : 0) + (m === argW ? wulSm : 0);
      let vm = 1;
      for (let s = 0; s < 3; s++) vm *= (1 + (slots[s].c.vjp + slots[s].av.vp) * slots[s].c.vk * gV(s));
      const d = dmg(slots[m], m, t, { buff, vuln: vm, facB, targetCorr, enemyInt, tgtPer });
      const heal = Math.round(slots[m].c.heal + d * (slots[m].c.ls + slots[m].av.ls)); // v4.2：+進階倒戈ls
      ticks.push({ i: i + 1, t, m, dmg: d, heal });
    }
    return { argW, argZ, facB, grid, recv, vulnAll, snap, ticks };
  }

  function compute(team, enemyInt, targetCorr, opts) {
    opts = opts || {};
    const tgtPer = opts.tgtPer !== undefined ? num(opts.tgtPer) : 0.2;
    const ratio = opts.troopRatio !== undefined ? num(opts.troopRatio) : 1;
    const enemySpd = opts.enemySpd !== undefined ? num(opts.enemySpd) : 940;   // v4.2
    const slots = buildSlots(team, Object.assign({}, opts, {
      spdDiff: Math.max(0, speedOf(team[0].troop, team[0].tier) - enemySpd),
    }));
    const core = teamCore(slots, enemyInt, targetCorr, tgtPer,
      Math.max(0, speedOf(team[0].troop, team[0].tier) - enemySpd));

    let cumD = 0, cumH = 0, cumNA = 0;
    const ticks = core.ticks.map((tk) => {
      const s = slots[tk.m];
      const myBuffs = null; // 顯示用資料由 app 組（保持 compute 回傳精簡）
      cumD += tk.dmg; cumH += tk.heal;
      // v4.3：普攻含追擊期望（各將 na × 自身 chaseMult 後加總）
      const naTick = Math.round((slots[0].na * slots[0].chaseMult + slots[1].na * slots[1].chaseMult + slots[2].na * slots[2].chaseMult) * ratio * 10) / 10;
      cumNA = Math.round((cumNA + naTick) * 10) / 10;
      return Object.assign({}, tk, {
        actor: s.name, skill: s.c.skill, vuln: 0, buff: 0, na: naTick, cumD, cumH, cumNA, myBuffs, enemyFx: null, apply: s.c.vfx,
      });
    });
    // buff/vuln 欄位供時間軸顯示：重算每 tick 顯示值
    let c2 = 0;
    ticks.forEach((tk, i) => {
      const t = tk.t, m = tk.m;
      const gB = (s) => slots[s].c.bdur >= 99 ? 1 : (t >= 3 * (s + 1) && (t - 3 * (s + 1)) % 9 < slots[s].c.bdur ? 1 : 0);
      const gV = (s) => (t >= 3 * (s + 1) && (t - 3 * (s + 1)) % 9 < slots[s].c.vdur) ? 1 : 0;
      const teamSm = slots.reduce((p, s) => p + s.av.team, 0) + slots[0].av.lead;
      const intlSm = slots.reduce((p, s) => p + s.av.intl, 0);
      const wulSm = slots.reduce((p, s) => p + s.av.wul, 0);
      tk.buff = core.grid[0][m] * gB(0) + core.grid[1][m] * gB(1) + core.grid[2][m] * gB(2)
        + teamSm + (m === core.argZ ? intlSm : 0) + (m === core.argW ? wulSm : 0);
      let vm = 1;
      for (let s = 0; s < 3; s++) vm *= (1 + (slots[s].c.vjp + slots[s].av.vp) * slots[s].c.vk * gV(s));
      tk.vuln = vm;
      const myBuffs = [0, 1, 2].filter(gB).map((s) => {
        const rem = slots[s].c.bdur >= 99 ? '常駐' : '剩' + (slots[s].c.bdur - (t - 3 * (s + 1)) % 9) + '秒';
        return slots[s].name + '：' + slots[s].c.bfx + '(' + rem + ')';
      }).join(' ');
      const enemyFx = [0, 1, 2].filter(gV).map((s) =>
        slots[s].name + '：' + slots[s].c.vfx + '(剩' + (slots[s].c.vdur - (t - 3 * (s + 1)) % 9) + '秒)').join(' ');
      tk.myBuffs = myBuffs; tk.enemyFx = enemyFx;
      c2++;
    });

    const na90 = ticks[29].cumNA;
    return {
      slots, grid: core.grid, facB: core.facB, h17: core.snap.reduce((a, b) => a + b, 0),
      snap: core.snap, ticks,
      steady: ticks[9].dmg + ticks[10].dmg + ticks[11].dmg,
      cum30: ticks[9].cumD, cum60: ticks[19].cumD, cum90: ticks[29].cumD, heal90: ticks[29].cumH,
      na90, total90: ticks[29].cumD + na90,
    };
  }

  // ---------- 簡易對打 ----------
  // enemy: { names:[3], troop:'盾兵', adv:0-5 }；對手無星石/兵書Y/無額外增傷/目標修正1
  // 規則：雙方同用 opts 的攻%/防%（鏡像）；技能傷害不吃防禦（本模型口徑）；
  //       普攻依剩餘兵力線性衰減（戰報實證）；治療回血不超過初始兵力；先歸零者敗，90秒到點比剩餘。
  function battle(teamA, enemyInt, targetCorr, opts, enemy) {
    opts = opts || {};
    const tgtPer = opts.tgtPer !== undefined ? num(opts.tgtPer) : 0.2;
    const teamB = enemy.names.map((n) => {
      const s = defaultSlot(n);
      s.troop = enemy.troop; s.adv = enemy.adv | 0;
      return s;
    });
    // v4.2：雙方各用自己的兵種移速計算移速差（敵方依 enemy.troop，階段預設5階）
    const speedA = speedOf(teamA[0].troop, teamA[0].tier);
    const speedB = speedOf(enemy.troop, '5階');
    const A = buildSlots(teamA, Object.assign({}, opts, { spdDiff: Math.max(0, speedA - speedB) }));
    const B = buildSlots(teamB, Object.assign({}, opts, { spdDiff: Math.max(0, speedB - speedA) }));
    const coreA = teamCore(A, enemyInt, targetCorr, tgtPer, Math.max(0, speedA - speedB));
    const coreB = teamCore(B, enemyInt, targetCorr, tgtPer, Math.max(0, speedB - speedA));

    let troopsA = MAX_TROOPS, troopsB = MAX_TROOPS;
    const outA = [0, 0, 0], outB = [0, 0, 0];   // 各武將累計輸出（技能+普攻+反擊）
    const naSumA = A.reduce((p, s) => p + s.na * s.chaseMult, 0);   // v4.3：普攻含追擊期望
    const naSumB = B.reduce((p, s) => p + s.na * s.chaseMult, 0);
    let winner = 'draw', ticksUsed = 30, counterA = 0, counterB = 0;   // v4.3：反擊累計
    const log = [];

    for (let i = 0; i < 30; i++) {
      const ratioA = Math.max(troopsA, 0) / MAX_TROOPS;
      const ratioB = Math.max(troopsB, 0) / MAX_TROOPS;
      // 我方→敵方
      const skillA = coreA.ticks[i].dmg;
      const naA = naSumA * ratioA;
      const dA = Math.round((skillA + naA) * 10) / 10;
      // 敵方→我方
      const skillB = coreB.ticks[i].dmg;
      const naB = naSumB * ratioB;
      const dB = Math.round((skillB + naB) * 10) / 10;
      // v4.3 反擊：受敵方三將普攻觸發，依我方剩餘兵力衰減；傷害打回敵方
      const cntA = A.map((s) => counterTick(s, ratioA));
      const cntB = B.map((s) => counterTick(s, ratioB));
      const cntSumA = cntA.reduce((p, v) => p + v, 0);
      const cntSumB = cntB.reduce((p, v) => p + v, 0);

      troopsB = Math.max(0, Math.round((troopsB - dA - cntSumA) * 10) / 10);
      troopsA = Math.max(0, Math.round((troopsA - dB - cntSumB) * 10) / 10);
      // 治療（各回各的、上限初始兵力）
      troopsA = Math.min(MAX_TROOPS, Math.round((troopsA + coreA.ticks[i].heal) * 10) / 10);
      troopsB = Math.min(MAX_TROOPS, Math.round((troopsB + coreB.ticks[i].heal) * 10) / 10);

      outA[coreA.ticks[i].m] += dA;
      outB[coreB.ticks[i].m] += dB;
      for (let j = 0; j < 3; j++) { outA[j] += cntA[j]; outB[j] += cntB[j]; }
      counterA += cntSumA; counterB += cntSumB;
      log.push({ t: coreA.ticks[i].t, dA: Math.round(dA), dB: Math.round(dB),
        cA: Math.round(cntSumA), cB: Math.round(cntSumB),
        troopsA: Math.round(troopsA), troopsB: Math.round(troopsB) });

      if (troopsA <= 0 || troopsB <= 0) {
        ticksUsed = i + 1;
        winner = troopsA <= 0 && troopsB <= 0 ? 'draw' : troopsB <= 0 ? 'A' : 'B';
        break;
      }
    }
    if (winner === 'draw' && ticksUsed === 30) {
      winner = troopsA === troopsB ? 'draw' : troopsA > troopsB ? 'A' : 'B';
    }
    return {
      winner, ticksUsed, time: ticksUsed * 3,
      troopsA: Math.round(troopsA), troopsB: Math.round(troopsB),
      outA: outA.map((v) => Math.round(v)), outB: outB.map((v) => Math.round(v)),
      counterA: Math.round(counterA), counterB: Math.round(counterB),   // v4.3
      namesA: A.map((s) => s.name), namesB: B.map((s) => s.name),
      naA: Math.round(naSumA * 10) / 10, naB: Math.round(naSumB * 10) / 10,
      log,
    };
  }

  return { compute, battle, defaultSlot, num, speedOf, NA_K, COUNTER_K, TROOP_FAC, MAX_TROOPS };
});
