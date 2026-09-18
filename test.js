// Node 驗證：網頁模型 vs Excel 公式引擎掃描值
const fs = require('fs');
const MODEL = require('./public/model.js');
const DATA = JSON.parse(fs.readFileSync('./public/data.json', 'utf8'));
global.DATA = DATA;

function slot(name, troop) {
  const s = MODEL.defaultSlot(name);
  s.troop = troop;
  return s;
}
const TEAMS = [
  ['一隊・群騎', ['呂布', '貂蟬', '高順'], '騎兵', [3528, 4597, 15267]],
  ['二隊・蜀盾', ['關羽', '張飛', '劉備'], '盾兵', [2219, 2196, 7959]],
  ['三隊・蜀弓', ['諸葛亮', '法正', '黃月英'], '弓兵', [2654, 2654, 9713]],   // v4.9：含八卦陣×1.077
  ['四隊・蜀騎', ['馬超', '趙雲', '張星彩'], '騎兵', [813, 813, 2783]],
  ['五隊・吳弓', ['周瑜', '小喬', '孫權'], '弓兵', [2487, 2249, 7582]],
];
let ok = true;
for (const [tname, members, bt, expect] of TEAMS) {
  const r = MODEL.compute(members.map((n) => slot(n, bt)), 100, 1);
  const got = [r.h17, r.steady, r.cum30];
  const pass = got.every((g, i) => g === expect[i]);
  ok = ok && pass;
  console.log(pass ? 'PASS' : 'FAIL', tname, 'H17=' + got[0], '穩態=' + got[1], '30秒=' + got[2], pass ? '' : ('期望 ' + expect));
}
// 呂布全弓驗證（H17=2594）
const mix = MODEL.compute(['孫權', '周瑜', '呂布'].map((n) => slot(n, '弓兵')), 100, 1);
const mixPass = mix.h17 === 2594;
ok = ok && mixPass;
console.log(mixPass ? 'PASS' : 'FAIL', '呂布全弓 H17=' + mix.h17, mixPass ? '' : '期望 2594');

// ---- v4 進階測試（對照 Excel formulas 重算驗證值）----
// 張飛五階：base+60/自身sm+15%+三階受擊0.15(全額,v4.5)/加點+50(自動→武力)，快照 831/H17 2462
let sd = ['關羽', '張飛', '劉備'].map((n) => slot(n, '盾兵'));
sd[1].adv = 5;
const rSd = MODEL.compute(sd, 100, 1);
const t1 = rSd.snap[1] === 831 && rSd.h17 === 2462;
ok = ok && t1;
console.log(t1 ? 'PASS' : 'FAIL', '張飛五階 snap=' + rSd.snap[1] + ' H17=' + rSd.h17, t1 ? '' : '期望 831 / 2462（v4.5 條件效果全額：三階受擊sm+15%）');

// 諸葛亮三階：base+50/再次施放+5%/加點+20(自動→智力) → v4.9 含八卦陣×1.077 → H17 2936
let sg = ['諸葛亮', '法正', '黃月英'].map((n) => slot(n, '弓兵'));
sg[0].adv = 3;
const rSg = MODEL.compute(sg, 100, 1);
const t2 = rSg.h17 === 2936;
ok = ok && t2;
console.log(t2 ? 'PASS' : 'FAIL', '諸葛亮階三 H17=' + rSg.h17, t2 ? '' : '期望 2936（v4.9：八卦陣雙施法期望+7.7%）');

// v4.9 黃月英【神工意匠】：部曲智力最高者(諸葛亮,zhi≥100→滿額) 普攻+200%
const t2b = rSg.slots[0].yyPaBonus === 2 && rSg.slots[0].na > 85 && !rSg.slots[1].yyPaBonus;
ok = ok && t2b;
console.log(t2b ? 'PASS' : 'FAIL', '神工意匠 諸葛亮na=' + rSg.slots[0].na + ' bonus=' + rSg.slots[0].yyPaBonus, t2b ? '' : '期望 bonus=2');


// 普攻模型：5階盾滿兵每擊=5.37×1×1×2.305/2.346≈5.3；v4.8 每秒1次→90秒=5.3×3將×3次×30tick=1431
const t3 = rSd.slots.every((s) => s.na === 5.3) && rSd.na90 === 1431;
ok = ok && t3;
console.log(t3 ? 'PASS' : 'FAIL', '普攻每擊=' + rSd.slots.map((s) => s.na).join('/') + ' 90秒=' + rSd.na90, t3 ? '' : '期望 5.3×3 / 1431');

// ---- v4.1 對手預設資料存在性 ----
const FOES = [
  ['桃園結義盾', ['劉備', '張飛', '關羽']],
  ['燃燒弓', ['孫權', '周瑜', '小喬']],
  ['鬥智弓', ['諸葛亮', '黃月英', '法正']],
  ['魏騎', ['徐晃', '典韋', '曹操']],
  ['追擊騎', ['趙雲', '馬超', '關銀屏']],
];
const foesOk = FOES.every(([_, ns]) => ns.every((n) => DATA.coef[n] && DATA.attrs[n] && DATA.aff[n]));
const foesAdvMissing = FOES.flatMap(([_, ns]) => ns.filter((n) => !DATA.adv[n]));
ok = ok && foesOk;
console.log(foesOk ? 'PASS' : 'FAIL', '對手預設 5 組基本資料齊全' + (foesAdvMissing.length ? '（缺進階資料：' + foesAdvMissing.join('、') + '，對打時進階效果視同0）' : ''));

// ---- v4.1 對打引擎 ----
const b1 = MODEL.battle(['呂布', '貂蟬', '高順'].map((n) => slot(n, '騎兵')), 100, 1, {},
  { names: ['劉備', '張飛', '關羽'], troop: '盾兵', adv: 0 });
const b2 = MODEL.battle(['呂布', '貂蟬', '高順'].map((n) => slot(n, '騎兵')), 100, 1, {},
  { names: ['劉備', '張飛', '關羽'], troop: '盾兵', adv: 0 });
const tb1 = ['A', 'B', 'draw'].includes(b1.winner) && b1.ticksUsed >= 1 && b1.ticksUsed <= 30
  && b1.troopsA <= 24000 && b1.troopsB <= 24000
  && JSON.stringify(b1) === JSON.stringify(b2);   // 確定性
ok = ok && tb1;
console.log(tb1 ? 'PASS' : 'FAIL', '對打 群騎vs桃園盾: 勝=' + b1.winner + ' 用時=' + b1.time + 's 我方剩=' + b1.troopsA + ' 敵剩=' + b1.troopsB);
// 敵方進階應使其更強
const bAdv0 = MODEL.battle(['周瑜', '小喬', '孫權'].map((n) => slot(n, '弓兵')), 100, 1, {},
  { names: ['劉備', '張飛', '關羽'], troop: '盾兵', adv: 0 });
const bAdv5 = MODEL.battle(['周瑜', '小喬', '孫權'].map((n) => slot(n, '弓兵')), 100, 1, {},
  { names: ['劉備', '張飛', '關羽'], troop: '盾兵', adv: 5 });
const outB0 = bAdv0.outB.reduce((a, b) => a + b, 0), outB5 = bAdv5.outB.reduce((a, b) => a + b, 0);
const tb2 = outB5 > outB0;
ok = ok && tb2;
console.log(tb2 ? 'PASS' : 'FAIL', '對手進階增強: 敵輸出 ' + outB0 + '→' + outB5);

// ---- v4.2 進階裁決接入：匯出值 ----
const ADV = DATA.adv;
const a1 = ADV['魏延'][1].ls === 0.06;
ok = ok && a1;
console.log(a1 ? 'PASS' : 'FAIL', '魏延t1 ls=' + ADV['魏延'][1].ls, a1 ? '' : '期望 0.06');
const a2 = ADV['馬超'][5].pa === 2.0 && Math.round((ADV['呂玲綺'][5].pa - ADV['呂玲綺'][4].pa) * 100) === 50;
ok = ok && a2;
console.log(a2 ? 'PASS' : 'FAIL', '馬超t5 pa=' + ADV['馬超'][5].pa + ' 呂玲綺t5增量 pa=' + (ADV['呂玲綺'][5].pa - ADV['呂玲綺'][4].pa),
  a2 ? '' : '期望 2.0 / 0.5（v4.5 條件效果全額）');
const a3 = ADV['樂進'][3].spdSm === 0.001 && ADV['典韋'][5].spdSm === 0.001
  && ADV['馬超'][3].spdPa === 0.01 && ADV['張星彩'][3].spdPa === 0.005;
ok = ok && a3;
console.log(a3 ? 'PASS' : 'FAIL', '移速差匯出 樂進t3 spdSm=' + ADV['樂進'][3].spdSm + ' 典韋t5=' + ADV['典韋'][5].spdSm
  + ' 馬超t3 spdPa=' + ADV['馬超'][3].spdPa + ' 張星彩t3=' + ADV['張星彩'][3].spdPa);
const a4 = ADV['程昱'][3].xprob === 0.05 && ADV['荀彧'][3].vp === 0.1 && ADV['劉備'][1].xprob === 0.3
  && (ADV['張飛'][3].sm - ADV['張飛'][2].sm) === 0.15;
ok = ok && a4;
console.log(a4 ? 'PASS' : 'FAIL', 'A組匯出 程昱xprob=' + ADV['程昱'][3].xprob + ' 荀彧vp=' + ADV['荀彧'][3].vp
  + ' 劉備xprob=' + ADV['劉備'][1].xprob + ' 張飛sm增量=' + (ADV['張飛'][3].sm - ADV['張飛'][2].sm),
  a4 ? '' : '期望 0.05/0.1/0.3/0.15（v4.5 全額）');

// ---- v4.2 移速差實算：樂進隊（5階騎1200 vs 敵940 → spdDiff=260）----
// v5.0：spdSmEff = 武將星級0.26 + 兵書0階基礎0.08×260/100=0.208 → 0.468（兵書進階機制納入）
const spdTeam = ['樂進', '貂蟬', '高順'].map((n) => slot(n, '騎兵'));
spdTeam[0].adv = 3;
const rSpdLo = MODEL.compute(spdTeam, 100, 1, { enemySpd: 940 });
const rSpdHi = MODEL.compute(spdTeam, 100, 1, { enemySpd: 1200 });
const spdEff = rSpdLo.slots[0].spdSmEff;
const a5 = spdEff > 0.45 && spdEff < 0.49 && rSpdLo.h17 > rSpdHi.h17;
ok = ok && a5;
console.log(a5 ? 'PASS' : 'FAIL', '移速差 樂進spdSmEff=' + spdEff.toFixed(3) + ' H17: 敵940→' + rSpdLo.h17 + ' vs 敵1200→' + rSpdHi.h17,
  a5 ? '' : '期望 spdSmEff≈0.468(=0.26+兵書0階0.208) 且敵940時H17較高');

// ---- v4.2 普攻增傷實算：趙雲一階 pa+0.3 入 na（v4.7 起 paWin=2.75 常駐，倍率=(4.05+0.3)/4.05） ----
const z0 = [slot('趙雲', '騎兵'), slot('貂蟬', '騎兵'), slot('高順', '騎兵')];
const z1 = [slot('趙雲', '騎兵'), slot('貂蟬', '騎兵'), slot('高順', '騎兵')];
z1[0].adv = 1;
const naZ0 = MODEL.compute(z0, 100, 1).slots[0].na;
const naZ1 = MODEL.compute(z1, 100, 1).slots[0].na;
const ratio = naZ1 / naZ0;
const expectZ = (1 + 2.75 + 0.3 + 0.3) / (1 + 2.75 + 0.3);   // paWin 常駐後一階增量被稀釋
const a6 = Math.abs(ratio - expectZ) < 0.02;
ok = ok && a6;
console.log(a6 ? 'PASS' : 'FAIL', '趙雲一階普攻 na ' + naZ0 + '→' + naZ1 + '（×' + ratio.toFixed(3) + '）', a6 ? '' : '期望 ≈×' + expectZ.toFixed(3));

// ---- v4.3 追擊/反擊 ----
// data.json 結構：趙雲含 chase 欄位、張角/樂進含 counter 欄位
const c1 = DATA.skills['趙雲'].some((e) => e.chase && e.chase.rate > 0)
  && DATA.skills['張角'].some((e) => e.counter && e.counter.rate > 0)
  && DATA.skills['樂進'].some((e) => e.counter && e.counter.coef > 0);
ok = ok && c1;
console.log(c1 ? 'PASS' : 'FAIL', 'data.json 結構 趙雲chase/張角counter/樂進counter 齊全');

// 趙雲追擊：chaseMult>1，且 na90 高於無追擊對照（趙雲→貂蟬，同騎兵0階基礎na相同）
const rZy = MODEL.compute(['趙雲', '貂蟬', '高順'].map((n) => slot(n, '騎兵')), 100, 1);
const rZyRef = MODEL.compute(['貂蟬', '貂蟬', '高順'].map((n) => slot(n, '騎兵')), 100, 1);
const c2 = rZy.slots[0].chaseMult > 1 && rZy.na90 > rZyRef.na90
  && rZy.slots[0].chase.chain >= 5;   // 七進七出連鎖5
ok = ok && c2;
console.log(c2 ? 'PASS' : 'FAIL', '趙雲追擊 chaseMult=' + rZy.slots[0].chaseMult.toFixed(3)
  + ' na90: ' + Math.round(rZy.na90) + ' vs 無追擊 ' + Math.round(rZyRef.na90));

// battle() 反擊：張角隊 counterA>0（100%機率、係數2.6）；無反擊隊伍 counter=0
const bCnt = MODEL.battle(['張角', '貂蟬', '高順'].map((n) => slot(n, '騎兵')), 100, 1, {},
  { names: ['劉備', '張飛', '關羽'], troop: '盾兵', adv: 0 });
const bPlain = MODEL.battle(['呂布', '貂蟬', '高順'].map((n) => slot(n, '騎兵')), 100, 1, {},
  { names: ['劉備', '張飛', '關羽'], troop: '盾兵', adv: 0 });
const c3 = bCnt.counterA > 0 && bPlain.counterA === 0 && bPlain.counterB === 0
  && bCnt.log.every((l) => l.cB === 0);   // 桃園盾無反擊
ok = ok && c3;
console.log(c3 ? 'PASS' : 'FAIL', '反擊 張角隊 counterA=' + bCnt.counterA
  + '；無反擊隊 counterA/B=' + bPlain.counterA + '/' + bPlain.counterB);

console.log(ok ? 'ALL PASS' : 'HAS FAILURES');

// ---- v5.0 兵書星級/專武進階機制 ----
(function () {
  let ok5 = true;
  // 1) 門檻（v5.1）：張飛 wpnLv=3 但 adv=0/bookLv=0 → clamp 0（白板）+ gateNote
  const t1 = [slot('張飛', '盾兵'), slot('劉備', '盾兵'), slot('關羽', '盾兵')];
  t1[0].wpnLv = 3;
  const r1 = MODEL.compute(t1, 100, 1);
  const g1 = r1.gateNotes.length > 0 && r1.slots[0].wpnEff === 0;
  // 2) 滿星滿兵書：wpnLv=5 生效，專武防禦時間軸數值上升（ticks defPct 更高）
  const t2 = [slot('張飛', '盾兵'), slot('劉備', '盾兵'), slot('關羽', '盾兵')];
  t2.forEach((s) => { s.adv = 5; s.bookLv = 5; });
  t2[0].wpnLv = 5;
  const r2 = MODEL.compute(t2, 100, 1);
  const baseDef = r1.ticks.map((t) => t.defPct), upDef = r2.ticks.map((t) => t.defPct);
  const g2 = r2.gateNotes.length === 0 && upDef[10] > baseDef[10];
  // 3) book=N → 曹丕無專武反擊
  const t3 = [slot('曹丕', '騎兵'), slot('曹操', '騎兵'), slot('徐晃', '騎兵')];
  const r3y = MODEL.compute(t3, 100, 1);
  t3[0].book = 'N';
  const r3n = MODEL.compute(t3, 100, 1);
  const g3 = r3y.slots[0].counter && r3y.slots[0].counter.coef === 1.7 && r3n.slots[0].counter === null;
  // 4) 徐晃兵書：bookLv 0→5，H17 提升（全體技傷 7%→17%）
  const t4 = [slot('徐晃', '騎兵'), slot('典韋', '騎兵'), slot('曹操', '騎兵')];
  const r4a = MODEL.compute(t4, 100, 1);
  t4[0].bookLv = 5;
  const r4b = MODEL.compute(t4, 100, 1);
  const g4 = r4b.h17 > r4a.h17;
  // 5) 預設五隊與 v4.9 完全一致（上面主迴圈已鎖 H17/穩態/30秒）
  ok5 = g1 && g2 && g3 && g4;
  console.log(g1 ? 'PASS' : 'FAIL', 'v5.1門檻 wpnLv3+adv0 → clamp0(白板) + gateNote');
  console.log(g2 ? 'PASS' : 'FAIL', 'v5.1滿配 wpnLv5 專武防禦生效 t10def ' + baseDef[10] + '→' + upDef[10]);
  console.log(g3 ? 'PASS' : 'FAIL', 'v5.1 book=Y白板專武 coef1.7；book=N → 反擊關閉(null)');
  console.log(g4 ? 'PASS' : 'FAIL', 'v5.0徐晃兵書 H17 ' + r4a.h17 + '→' + r4b.h17);
  ok = ok && ok5;
})();
