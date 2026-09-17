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
// v4.4：battle() 導入「防禦%→除法減傷→損兵」結算管線（DEFSYS 結構化防禦表）
//       公式來源：B站 BV1383Jz9E2b 陸服戰報 R2~R10 五筆反推（±2%）：
//         損兵 = 原始傷害 ÷ (1+目標部曲防禦%) ÷ TROOP_HP(39.8)；防禦%為除法遞減、增益滾動疊加到期消退
//       「受武力/智力/統率影響」放大係數 ATTR_MUL=1.81（張角黃天當立 文案200%→實測362%）
//       護盾（張角斗轉參橫）先吸收傷害再扣兵；實測護盾10974=400×智力/10（≈274智，不乘1.81）
//       注意：本模型既有傷害數值由台服戰報「損兵數」校準，39.8 在「模型傷害↔損兵」間自相抵消，
//             故整合僅加 (1+D) 除法層與護盾層，不再把所有數字÷39.8
//       已知簡化：張飛不屈層數=每 tick 1 層（實為敵方3將普攻，5秒窗口至多2層）、
//                 如日方升/太平清領/八卦陣等「護盾消失後/無持續」效果常駐化、
//                 率馬以驥等「按命中數」視同命中1部曲、敵方不給星石、杯影戲梟無地形判斷常駐、
//                 于吉道心澤世（按統率和）/司馬懿/龐統 防禦數值文案不明，暫略（見 DEFSYS 註解）
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
  const TROOP_HP = 39.8;                // v4.4 每兵HP（陸服戰報反推；僅用於護盾換算，損兵管線因校準口徑抵消）
  const ATTR_MUL = 1.81;                // v4.4 「受武力/智力/統率影響」放大係數（文案200%→實測362%）

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

  // ---------- v4.4 防禦系統（DEFSYS） ----------
  // 結構化防禦資料表；資料來源：技能數據庫 Lv10 文案（public/data.json skills[].desc，B站 BV1383Jz9E2b 驗算框架）
  // 條目格式：
  //   { kind:'def',    pct, attr, dur, trigger, maxStack?, decayAfter?, rate?, book? }
  //   { kind:'shield', coef, bookCoef?, dur, cd, attr, book? }
  //   attr: 'wu'/'zhi'/'tong' 表示「受武力/智力/統率影響」→ 結算時 ×ATTR_MUL(1.81)；無 attr 為固定值
  //   trigger: 'na'=受普攻滾動疊層（敵方每 tick 有普攻 → 每 tick 可疊1層，dur 秒窗口）；
  //            'cast'=跟主動技施放節奏（同 gV 模式：t≥3*(idx+1) 且 (t-3*(idx+1))%9<dur）；
  //            'constant'=常駐（dur 給 99）
  //   maxStack/decayAfter: 從第 decayAfter+1 層起僅 30% 效果（張飛式衰減）
  //   rate: 觸發機率（期望値近似，如程普25%、關銀屏35%）
  //   book: true 表示專武裝備效果，僅 slot.book==='Y' 時啟用；護盾 bookCoef=專武後係數
  // 已收錄（Lv10 文案值）；未收錄（數值不明/過度情境化，待補）：于吉道心澤世（每10統率+0.9%）、
  //   司馬懿三馬同槽/畢力遐方/玄冥天罡扇（無具體%）、龐統佻身飛鏃/鳳鳴鶴唳（無具體%）、
  //   關羽青龍偃月刀（按武力差動態）、諸葛亮神機扇（按智力差動態）、呂布方天畫戟（每秒疊加至330%）、
  //   徐晃風掣雷行/典韋冷月追魂戟（按移速差動態）、周瑜鐵劍（按燃燒數）、小喬顧曲唱和（按擊潰數）
  const DEFSYS = {
    '張飛': [
      { kind: 'def', skill: '據水斷橋', pct: 160, attr: 'wu', dur: 5, trigger: 'na', maxStack: 3, decayAfter: 1 }, // 2層起衰減70%（層2,3僅30%效果）
      { kind: 'def', skill: '丈八蛇矛', pct: 29.3, attr: 'wu', dur: 9, trigger: 'cast', book: true },              // 專武裝備：每命中1部曲+29.3%，v1視同命中1
    ],
    '張角': [
      { kind: 'def', skill: '黃天當立', pct: 200, attr: 'zhi', dur: 6, trigger: 'cast' },   // 施放時+200%(受智力影響)持續6秒
      { kind: 'def', skill: '如日方升', pct: 40, attr: 'zhi', dur: 99, trigger: 'constant' }, // 原為護盾消失後生效，v1常駐化（簡化）
      { kind: 'def', skill: '黃天御雷幡', pct: 57, attr: 'zhi', dur: 3, trigger: 'na', maxStack: 1, book: true }, // 專武裝備：受普攻時+57%持續3秒
      { kind: 'shield', skill: '斗轉參橫', coef: 400, bookCoef: 470, dur: 9, cd: 9, attr: 'zhi' }, // 常駐護盾（9s/冷卻9s）；專武係數400→470
    ],
    '關羽': [
      { kind: 'def', skill: '率馬以驥', pct: 108, attr: 'wu', dur: 5, trigger: 'cast' },    // 主動命中後+108%持續5秒（v1視同命中1部曲、跟主動節奏）
      { kind: 'def', skill: '水淹七軍', pct: 90, attr: 'wu', dur: 99, trigger: 'constant' }, // 原條件：部曲兵力高於50%，v1常駐化（簡化）
      { kind: 'def', skill: '千里走單騎', pct: 25, attr: 'wu', dur: 99, trigger: 'constant' }, // 每敵部曲+25%最多5層；1v1對打僅1敵部曲 → +25%
    ],
    '于吉': [
      { kind: 'def', skill: '太平清領', pct: 190, attr: 'zhi', dur: 9, trigger: 'constant' }, // 原為護盾消失時+190%持續9秒，v1常駐化（簡化）
    ],
    '諸葛亮': [
      { kind: 'def', skill: '臥龍出山', pct: 84, attr: 'zhi', dur: 3, trigger: 'na', maxStack: 1 }, // 受普攻時+84%持續3秒不可疊加
      { kind: 'def', skill: '八卦陣', pct: 37, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '左慈': [
      { kind: 'def', skill: '遁甲天書', pct: 105, attr: 'zhi', dur: 6, trigger: 'cast' },   // 按分身數量+105%，v1視同1分身
      { kind: 'def', skill: '太虛引靈', pct: 40, attr: 'zhi', dur: 9, trigger: 'cast' },    // 施放主動後+40%（文案未標持續，取9秒近似）
      { kind: 'def', skill: '杯影戲梟', pct: 50, dur: 99, trigger: 'constant' },            // 原為橋/峽谷/樹林地形+50%，v1常駐化（簡化，無attr）
      // 幻霧遁形為「分身使受到技能傷害-12.5%」（減傷非護盾），無護盾係數，v1不實作
    ],
    '劉備': [
      { kind: 'def', skill: '三顧茅廬', pct: 87, attr: 'tong', dur: 99, trigger: 'constant' },
      { kind: 'def', skill: '躍馬檀溪', pct: 21, attr: 'tong', dur: 99, trigger: 'constant' }, // 可疊3層；1v1對打僅1敵部曲 → 1層
    ],
    '關銀屏': [
      { kind: 'def', skill: '將門虎女', pct: 30, attr: 'wu', dur: 99, trigger: 'constant' },
      { kind: 'def', skill: '遲玉嬌姿', pct: 4.8, attr: 'wu', dur: 3, trigger: 'na', maxStack: 1, rate: 0.35 }, // 普攻後35%機率+4.8%，期望値近似
    ],
    '呂布': [
      { kind: 'def', skill: '氣冠三軍', pct: 125, attr: 'wu', dur: 99, trigger: 'constant' },
    ],
    '貂蟬': [
      { kind: 'def', skill: '鳳儀相會', pct: 115, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '馬超': [
      { kind: 'def', skill: '鐵馬戰行', pct: 115, attr: 'wu', dur: 99, trigger: 'constant' },
    ],
    '孫堅': [
      { kind: 'def', skill: '銳意疾風', pct: 155, attr: 'tong', dur: 99, trigger: 'constant' }, // 主目標野怪額外+20%不適用PVP，略
    ],
    '典韋': [
      { kind: 'def', skill: '義戰宛城', pct: 110, attr: 'wu', dur: 99, trigger: 'constant' },
    ],
    '孫權': [
      { kind: 'def', skill: '乘馬射虎', pct: 93, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '甘寧': [
      { kind: 'def', skill: '言笑解懼', pct: 45.5, attr: 'wu', dur: 99, trigger: 'constant' },
    ],
    '張苞': [
      { kind: 'def', skill: '兵無常勢', pct: 50, attr: 'wu', dur: 99, trigger: 'constant' },
    ],
    '徐晃': [
      { kind: 'def', skill: '橫刀立馬', pct: 10.5, attr: 'wu', dur: 99, trigger: 'constant' },
    ],
    '曹操': [
      { kind: 'def', skill: '短歌行', pct: 130, attr: 'tong', dur: 6, trigger: 'na', maxStack: 1 }, // 受普攻時+130%持續6秒不可疊加
    ],
    '曹丕': [
      { kind: 'def', skill: '覽照幽微', pct: 5, dur: 99, trigger: 'constant' },
      { kind: 'def', skill: '兄弟參商', pct: 23, attr: 'tong', dur: 5, trigger: 'na', maxStack: 1 }, // 受普攻後100%+23%持續5秒
    ],
    '呂玲綺': [
      { kind: 'def', skill: '松貞玉剛', pct: 30.5, attr: 'wu', dur: 5, trigger: 'na', maxStack: 1 }, // 受普攻時+30.5%持續5秒不可疊加
    ],
    '魏延': [
      { kind: 'def', skill: '孤膽衝鋒', pct: 25, attr: 'wu', dur: 5, trigger: 'cast' },      // 每命中1部曲+25%，v1視同命中1
    ],
    '陳宮': [
      { kind: 'def', skill: '謀斷危局', pct: 50, attr: 'zhi', dur: 6, trigger: 'cast' },    // 每命中1部曲+50%，v1視同命中1
    ],
    '小喬': [
      { kind: 'def', skill: '韶華如夢', pct: 64, attr: 'zhi', dur: 99, trigger: 'constant' }, // 樹林內額外+80%無地形判斷，略
    ],
    '黃月英': [
      { kind: 'def', skill: '鏤月裁雲', pct: 11.4, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '法正': [
      { kind: 'def', skill: '孝直避箭', pct: 10, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '魯肅': [
      { kind: 'def', skill: '安車軟輪', pct: 10, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '徐庶': [
      { kind: 'def', skill: '江山巧計', pct: 10, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '荀攸': [
      { kind: 'def', skill: '奇策十三', pct: 10, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '程昱': [
      { kind: 'def', skill: '知足不辱', pct: 10, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '糜竺': [
      { kind: 'def', skill: '應者雲集', pct: 10, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '王平': [
      { kind: 'def', skill: '穩守禦敵', pct: 10.5, attr: 'zhi', dur: 99, trigger: 'constant' },
    ],
    '公孫瓚': [
      { kind: 'def', skill: '我武惟揚', pct: 15, attr: 'wu', dur: 99, trigger: 'constant' },
    ],
    '程普': [
      { kind: 'def', skill: '興王定霸', pct: 40, attr: 'tong', dur: 2, trigger: 'na', maxStack: 1, rate: 0.25 }, // 25%機率+40%持續2秒，期望値近似
    ],
    '孟獲': [
      { kind: 'def', skill: '憑河暴虎', pct: 30, attr: 'tong', dur: 5, trigger: 'cast' },   // 每命中1部曲+30%，v1視同命中1
    ],
  };

  // 展開一側三將的防禦條目（過濾專武、預乘 attr 放大），供時間軸查詢
  function defEntries(slots) {
    const out = [];
    slots.forEach((s, idx) => {
      (DEFSYS[s.name] || []).forEach((e) => {
        if (e.kind !== 'def') return;
        if (e.book && s.book !== 'Y') return;
        out.push({ idx, e, pct: e.pct * (e.attr ? ATTR_MUL : 1) });
      });
    });
    return out;
  }

  // v4.4 防禦%時間軸：回傳 (t)=>當下防禦%（滾動疊加/到期消退已內建）
  function defTimeline(slots) {
    const ents = defEntries(slots);
    if (!ents.length) return function () { return 0; };
    return function (t) {
      let sum = 0;
      for (let k = 0; k < ents.length; k++) {
        const idx = ents[k].idx, e = ents[k].e, pct = ents[k].pct;
        if (e.trigger === 'constant') { sum += pct; continue; }
        if (e.trigger === 'cast') {
          // 主動技施放節奏（同 gV 模式）：t≥3*(idx+1) 且 (t-3*(idx+1))%9<dur
          if (t >= 3 * (idx + 1) && (t - 3 * (idx + 1)) % 9 < e.dur) sum += pct;
          continue;
        }
        // 'na'：受普攻疊層——敵方每 tick 有普攻，每 tick 疊1層，數 dur 秒窗口內的層數
        let layers = 0;
        for (let tau = 3; tau <= t; tau += 3) if (tau > t - e.dur) layers++;
        layers = Math.min(layers, e.maxStack || 1);
        let mult = 1;
        if (e.decayAfter && layers > e.decayAfter) mult = 1 + 0.3 * (layers - e.decayAfter);
        sum += pct * (e.rate || 1) * mult;
      }
      return sum;
    };
  }

  // v4.5 不屈疊層時間軸：'na' 觸發且 maxStack>1 的條目（張飛據水斷橋式），回傳該 tick 隊伍最高層數
  function stackTimeline(slots) {
    const ents = [];
    slots.forEach((s) => {
      (DEFSYS[s.name] || []).forEach((e) => {
        if (e.kind !== 'def' || e.trigger !== 'na' || !(e.maxStack > 1)) return;
        if (e.book && s.book !== 'Y') return;
        ents.push(e);
      });
    });
    if (!ents.length) return function () { return 0; };
    return function (t) {
      let mx = 0;
      ents.forEach((e) => {
        let layers = 0;
        for (let tau = 3; tau <= t; tau += 3) if (tau > t - e.dur) layers++;
        layers = Math.min(layers, e.maxStack);
        if (layers > mx) mx = layers;
      });
      return mx;
    };
  }

  // v4.4 護盾時間軸：值=coef×該將zhi/10÷TROOP_HP（損兵單位；實測 400×274/10=10974 不乘1.81）
  // dur 9 / cd 9 → 常駐護盾：t%(dur+cd)<dur 時在場（進入戰鬥即獲得）
  function shieldTimeline(slots) {
    const ents = [];
    slots.forEach((s) => {
      (DEFSYS[s.name] || []).forEach((e) => {
        if (e.kind !== 'shield') return;
        if (e.book && s.book !== 'Y') return;
        const coef = (e.bookCoef && s.book === 'Y') ? e.bookCoef : e.coef;
        ents.push({ val: coef * s.zhi / 10 / TROOP_HP, dur: e.dur, cd: e.cd });
      });
    });
    if (!ents.length) return { on: function () { return false; }, full: 0 };
    const full = ents.reduce((p, e) => p + e.val, 0);
    return {
      full,
      on: function (t) {
        for (let k = 0; k < ents.length; k++) if (t % (ents[k].dur + ents[k].cd) < ents[k].dur) return true;
        return false;
      },
    };
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
    // v4.5 隊伍防禦狀態時間軸（與 battle() 同一口徑：全隊各將生效防禦增益總和 / 護盾窗口 / 不屈層數）
    const defT = defTimeline(slots), shT = shieldTimeline(slots), stT = stackTimeline(slots);
    const ticks = core.ticks.map((tk) => {
      const s = slots[tk.m];
      cumD += tk.dmg; cumH += tk.heal;
      // v4.3：普攻含追擊期望（各將 na × 自身 chaseMult 後加總）
      const naTick = Math.round((slots[0].na * slots[0].chaseMult + slots[1].na * slots[1].chaseMult + slots[2].na * slots[2].chaseMult) * ratio * 10) / 10;
      cumNA = Math.round((cumNA + naTick) * 10) / 10;
      return Object.assign({}, tk, {
        actor: s.name, skill: s.c.skill, vuln: 0, buff: 0, na: naTick, cumD, cumH, cumNA, myBuffs: null, enemyFx: null, apply: s.c.vfx,
        // v4.5：每 tick 隊伍防禦狀態
        defPct: Math.round(defT(tk.t) * 10) / 10,
        defStacks: stT(tk.t),
        shield: shT.on(tk.t) ? Math.round(shT.full) : 0,
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
    // v4.5 引擎未建模的效果標記（供 UI 顯示免責說明，不發明數值）
    const unmodeled = slots.some((s) => s.name === '左慈') ? ['分身（左慈）'] : [];
    return {
      slots, grid: core.grid, facB: core.facB, h17: core.snap.reduce((a, b) => a + b, 0),
      snap: core.snap, ticks, unmodeled,
      steady: ticks[9].dmg + ticks[10].dmg + ticks[11].dmg,
      cum30: ticks[9].cumD, cum60: ticks[19].cumD, cum90: ticks[29].cumD, heal90: ticks[29].cumH,
      na90, total90: ticks[29].cumD + na90,
    };
  }

  // ---------- 簡易對打 ----------
  // enemy: { names:[3], troop:'盾兵', adv:0-5 }；對手無星石/兵書Y/無額外增傷/目標修正1
  // 規則：雙方同用 opts 的攻%/防%（鏡像）；技能傷害不吃 opts 防%（本模型口徑），但吃 DEFSYS 部曲防禦%（v4.4）；
  //       結算管線 v4.4：raw(技能+普攻+反擊) → 目標護盾先擋 → loss=raw/(1+目標防禦%/100) → 扣兵力；
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
    const outA = [0, 0, 0], outB = [0, 0, 0];   // 各武將累計實際損兵輸出（v4.4：結算後口徑）
    const naSumA = A.reduce((p, s) => p + s.na * s.chaseMult, 0);   // v4.3：普攻含追擊期望
    const naSumB = B.reduce((p, s) => p + s.na * s.chaseMult, 0);
    let winner = 'draw', ticksUsed = 30, counterA = 0, counterB = 0;   // v4.3：反擊累計
    const log = [];

    // v4.4 防禦/護盾時間軸（雙方各自獨立）
    const defA = defTimeline(A), defB = defTimeline(B);
    const shA = shieldTimeline(A), shB = shieldTimeline(B);
    const stAfn = stackTimeline(A), stBfn = stackTimeline(B);   // v4.5：不屈疊層
    let poolA = 0, poolB = 0, wasA = false, wasB = false;   // 護盾剩餘（損兵單位）

    for (let i = 0; i < 30; i++) {
      const t = coreA.ticks[i].t;
      const ratioA = Math.max(troopsA, 0) / MAX_TROOPS;
      const ratioB = Math.max(troopsB, 0) / MAX_TROOPS;
      // 我方→敵方
      const skillA = coreA.ticks[i].dmg;
      const naA = naSumA * ratioA;
      const dA = skillA + naA;
      // 敵方→我方
      const skillB = coreB.ticks[i].dmg;
      const naB = naSumB * ratioB;
      const dB = skillB + naB;
      // v4.3 反擊：受敵方三將普攻觸發，依我方剩餘兵力衰減；傷害打回敵方
      const cntA = A.map((s) => counterTick(s, ratioA));
      const cntB = B.map((s) => counterTick(s, ratioB));
      const cntSumA = cntA.reduce((p, v) => p + v, 0);
      const cntSumB = cntB.reduce((p, v) => p + v, 0);

      // v4.4 結算管線：raw（技能+普攻+反擊）→ 目標護盾先擋 → loss=raw/(1+目標防禦%/100) → 扣兵力
      const dPctA = defA(t), dPctB = defB(t);
      const rawA = Math.round((dA + cntSumA) * 10) / 10;   // 我方打出的結算前總傷害
      const rawB = Math.round((dB + cntSumB) * 10) / 10;
      const onA = shA.on(t), onB = shB.on(t);
      if (onA && !wasA) poolA = shA.full;                  // 護盾窗口開始時補滿
      if (onB && !wasB) poolB = shB.full;
      wasA = onA; wasB = onB;
      const absB = Math.min(poolB, rawA); poolB = Math.round((poolB - absB) * 10) / 10;
      const absA = Math.min(poolA, rawB); poolA = Math.round((poolA - absA) * 10) / 10;
      const lossInfA = Math.round((rawA - absB) / (1 + dPctB / 100) * 10) / 10;  // A 造成 B 實際損兵
      const lossInfB = Math.round((rawB - absA) / (1 + dPctA / 100) * 10) / 10;  // B 造成 A 實際損兵

      troopsB = Math.max(0, Math.round((troopsB - lossInfA) * 10) / 10);
      troopsA = Math.max(0, Math.round((troopsA - lossInfB) * 10) / 10);
      // 治療（各回各的、上限初始兵力）
      troopsA = Math.min(MAX_TROOPS, Math.round((troopsA + coreA.ticks[i].heal) * 10) / 10);
      troopsB = Math.min(MAX_TROOPS, Math.round((troopsB + coreB.ticks[i].heal) * 10) / 10);

      // 輸出歸屬：按各來源佔 raw 比例分攤結算後實際損兵
      const shareA = rawA > 0 ? lossInfA / rawA : 0;
      const shareB = rawB > 0 ? lossInfB / rawB : 0;
      outA[coreA.ticks[i].m] += (skillA + naA) * shareA;
      outB[coreB.ticks[i].m] += (skillB + naB) * shareB;
      for (let j = 0; j < 3; j++) { outA[j] += cntA[j] * shareA; outB[j] += cntB[j] * shareB; }
      counterA += cntSumA; counterB += cntSumB;
      log.push({ t,
        rawA, rawB,                                     // v4.4：結算前雙方總傷害
        defA: Math.round(dPctA * 10) / 10, defB: Math.round(dPctB * 10) / 10,   // 當下防禦%
        shA: Math.round(poolA), shB: Math.round(poolB),                          // 護盾剩餘
        stA: stAfn(t), stB: stBfn(t),                 // v4.5：不屈疊層數
        lossA: lossInfB, lossB: lossInfA,              // v4.4：雙方實際損兵
        dA: Math.round(lossInfA), dB: Math.round(lossInfB),   // 兼容舊欄位=實際損兵
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

  return { compute, battle, defaultSlot, num, speedOf, NA_K, COUNTER_K, TROOP_FAC, MAX_TROOPS, TROOP_HP, ATTR_MUL, DEFSYS, defTimeline, shieldTimeline, stackTimeline };
});
