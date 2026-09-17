// dump webapp compute results for Excel cross-check（鏡像試算器輸入列，含星石）
const fs = require('fs');
const MODEL = require('./public/model.js');
global.DATA = JSON.parse(fs.readFileSync('./public/data.json', 'utf8'));

function slot(name, troop, stone) {
  const s = MODEL.defaultSlot(name);
  s.troop = troop;
  if (stone) {
    s.s1.attr = stone.attr; s.s1.val = stone.val;
    s.s1.trait = stone.trait; s.s1.traitP = stone.traitP;
  }
  return s;
}
// 與 Excel 試算器輸入列一致：劉備(武曲10%/武力+5)、關羽(紫微3.5%/智力+5)、張飛(無)
const base = MODEL.compute([
  slot('劉備', '盾兵', { attr: '武力', val: 5, trait: '武曲', traitP: 0.1 }),
  slot('關羽', '盾兵', { attr: '智力', val: 5, trait: '紫微', traitP: 0.035 }),
  slot('張飛', '盾兵'),
], 100, 1);
// 進階隊：魏延t1/趙雲t1/張飛t3，星石沿用Excel列位（魏延列有武曲、趙雲列有紫微）
const adv = [
  Object.assign(slot('魏延', '盾兵', { attr: '武力', val: 5, trait: '武曲', traitP: 0.1 }), { adv: 1 }),
  Object.assign(slot('趙雲', '盾兵', { attr: '智力', val: 5, trait: '紫微', traitP: 0.035 }), { adv: 1 }),
  Object.assign(slot('張飛', '盾兵'), { adv: 3 }),
];
const advR = MODEL.compute(adv, 100, 1);

const pick = (r) => ({
  h17: r.h17,
  snap: r.snap,
  na: r.slots.map((s) => s.na),
  ticks: r.ticks.map((t) => ({ m: t.m, dmg: t.dmg, heal: t.heal, buff: t.buff })),
});
fs.writeFileSync('_verify_web.json', JSON.stringify({ base: pick(base), adv: pick(advR) }, null, 1));
console.log('dumped base.h17=' + base.h17 + ' adv.h17=' + advR.h17);
