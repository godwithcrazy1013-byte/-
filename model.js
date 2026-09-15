// 策定九州傷害模型（與 Excel 試算器/行動時間軸公式完全一致；Node 與瀏覽器共用）
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MODEL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const round1 = (v) => Math.round(v * 10) / 10;
  const affMul = (a) => (a === 'S' ? 1.2 : a === 'A' ? 1 : a === 'B' ? 0.8 : 0.7);

  function defaultSlot(name) {
    return {
      name: name || '', book: 'Y', troop: '騎兵', tier: '5階',
      s1: { attr: '無', val: '', def: '無', defP: '', trait: '無', traitP: '' },
      s2: { attr: '無', val: '', def: '無', defP: '', trait: '無', traitP: '' },
      extra: '',
    };
  }

  function dmg(slot, i, t, ctx) {
    const base = slot.name === '呂布' && slot.troop !== '騎兵' ? 612 : slot.c.base;
    const zhuge = slot.name === '諸葛亮' ? 3.6 * ctx.enemyInt * 1.154 : 0;
    let sm = slot.c.sm;
    if (t !== null && slot.name === '呂布') {
      sm = (slot.book === 'N' ? 0 : Math.min(0.022 * t, 0.95)) + (t >= 3 * (i + 1) + 9 ? 0.5 : 0);
    }
    const exsm = slot.book === 'N' ? slot.c.exsm : 0;
    const trick = num(slot.s1.traitP) + num(slot.s2.traitP);
    const inner = 1 + sm - exsm + ctx.buff + trick + num(slot.extra);
    return Math.round((base + slot.c.dot + zhuge) * inner * ctx.vuln * (1 + ctx.facB) * ctx.targetCorr);
  }

  function compute(team, enemyInt, targetCorr) {
    const slots = team.map((s) => {
      const c = DATA.coef[s.name], a = DATA.aff[s.name], at = DATA.attrs[s.name];
      const mul = affMul(a[s.troop]);
      const add = (st) => (s.s1.attr === st ? num(s.s1.val) : 0) + (s.s2.attr === st ? num(s.s2.val) : 0);
      return Object.assign({}, s, {
        c, fac: a.fac, mul, aff: a[s.troop],
        wu: round1(at.wu * mul + add('武力')),
        zhi: round1(at.zhi * mul + add('智力')),
        defP: num(s.s1.defP) + num(s.s2.defP),
      });
    });
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
    const recv = slots.map((_, r) => grid[0][r] + grid[1][r] + grid[2][r]);
    const vulnAll = slots.reduce((p, s) => p * (1 + s.c.vjp * s.c.vk), 1);
    const snap = slots.map((s, i) => dmg(s, i, null, { buff: recv[i], vuln: vulnAll, facB, targetCorr, enemyInt }));
    const h17 = snap.reduce((a, b) => a + b, 0);

    const ticks = [];
    let cumD = 0, cumH = 0;
    for (let i = 0; i < 30; i++) {
      const t = 3 * (i + 1), m = i % 3;
      const gB = (s) => slots[s].c.bdur >= 99 ? 1 : (t >= 3 * (s + 1) && (t - 3 * (s + 1)) % 9 < slots[s].c.bdur ? 1 : 0);
      const gV = (s) => (t >= 3 * (s + 1) && (t - 3 * (s + 1)) % 9 < slots[s].c.vdur) ? 1 : 0;
      const buff = grid[0][m] * gB(0) + grid[1][m] * gB(1) + grid[2][m] * gB(2);
      let vm = 1;
      for (let s = 0; s < 3; s++) vm *= (1 + slots[s].c.vjp * slots[s].c.vk * gV(s));
      const d = dmg(slots[m], m, t, { buff, vuln: vm, facB, targetCorr, enemyInt });
      const heal = Math.round(slots[m].c.heal + d * slots[m].c.ls);
      const myBuffs = [0, 1, 2].filter(gB).map((s) => {
        const rem = slots[s].c.bdur >= 99 ? '常駐' : '剩' + (slots[s].c.bdur - (t - 3 * (s + 1)) % 9) + '秒';
        return slots[s].name + '：' + slots[s].c.bfx + '(' + rem + ')';
      }).join(' ');
      const enemyFx = [0, 1, 2].filter(gV).map((s) =>
        slots[s].name + '：' + slots[s].c.vfx + '(剩' + (slots[s].c.vdur - (t - 3 * (s + 1)) % 9) + '秒)').join(' ');
      cumD += d; cumH += heal;
      ticks.push({ i: i + 1, t, m, actor: slots[m].name, skill: slots[m].c.skill, buff, vuln: vm, dmg: d, heal, myBuffs, enemyFx, apply: slots[m].c.vfx, cumD, cumH });
    }
    return {
      slots, grid, facB, h17, snap, ticks,
      steady: ticks[9].dmg + ticks[10].dmg + ticks[11].dmg,
      cum30: ticks[9].cumD, cum60: ticks[19].cumD, cum90: ticks[29].cumD, heal90: ticks[29].cumH,
    };
  }

  return { compute, defaultSlot, num };
});
