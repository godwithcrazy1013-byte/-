// 策定九州傷害模型 v5.0（與 Excel 試算器 v4.2/行動時間軸 v6 公式一致；Node 與瀏覽器共用）
// v5.1（2026-09-19）：S2新武將入模——司馬懿（星流霆擊245+隱忍DOT300+貫門雙龍係數+100；三馬同槽防禦79%常駐）、
//       龐統（索命連環240+鐵索二段100；佻身飛蛾39%×3層常駦；泣麟悲鳳：主將智力最高時主將技能期望×1.26）；
//       兩將被動滿級值=1級→2級線性外推（S2截圖僅有下一等級預覽），待滿級效果截圖驗證；屬性=21級裸+係數×29（滿級50）
// v5.1（用戶 2026-09-18 20:03 指正）：白板制度——兵書0星=白板兵書（基礎效果常駐，非無兵書）；
//       專武0階=白板專武（book=Y 即自動持有 0階兵書+0階專武，基礎值=v0 常駐）。
//       ①slot 新增 bookLv(兵書星0-5,預設0)、wpnLv(專武進階0-5,預設0)。曲線 v(lv)=v0+lv×step。
//       ②門檻規則（用戶2026-09-18確認）：有兵書(book=Y)才解鎖專武0階；wpnLv≥2 需 adv≥5(武將滿星)且 bookLv≥5(兵書滿星)，
//         否則 clamp 到 1 並記 gateNotes；book=N → wpnEff=0、專武反擊/專武防禦全關（修正舊版「無兵書仍有專武反擊」）
//       ③專武曲線（CURVES.wpn）：DB箭頭經截圖證實為「0階→1階」(荀攸/荀彧/程昱/糜竺)，v(lv)=v0+lv×step，lv=1 即舊模型值
//         已接：張飛丈八蛇矛(防禦wstep9.3)、張角黃天御雷幡(防禦18/護盾乘算48+22×階)、諸葛亮神機扇(16.3)、黃月英玄機書卷(2)、
//               反擊係數 張角/甘寧/曹丕/樂進
//       ④兵書曲線（CURVES.book）：只接「新增量」效果（bookLv=0 時貢獻=0，不改舊輸出）：
//         樂進移速差技傷(0.08+0.02×lv %/點)、張星彩移速差普攻(0.36+0.18×lv %/點)、徐晃全體技傷(7+2×lv %)
//       ⑤已收錄未接入（避免改動舊值，列 unmodeled）：其餘兵書/專武曲線（見 CURVES 註解與 Excel「進階曲線」分頁87列），
//         特別是張燕兵書反擊係數(6→7)、程普兵書不屈率——舊模型常駐值對應的參照階不明，待逐條遷移
// v4.9：補上鬥智弓缺失機制——
//       ①黃月英【神工意匠】：部曲中智力最高武將普攻+100%、其每點智力再+1%（上限+200%），buildSlots 團隊級加成到 na
//       ②諸葛亮【八卦陣】：主動技能7.7%機率下一秒雙施法 → 技能傷害期望×1.077
//       ③DEFSYS 補鬥智弓專武防禦：神機扇(智力差動態→以敵智250近似+52%/cast/9s)、玄機書卷(+7%常駐)、面折廷爭(+28%受遠程普攻/3s近似)
//       （仍未建模：隴上妝神擊潰增傷、神機扇智力差的真實動態值、面折廷爭僅遠程生效的區分）
// v4.8：普攻節奏修正——每將每秒普攻1次（用戶實測指正），每tick=3次（NA_HITS=3）；
//       compute()/battle() 普攻總量×3，反擊受擊口徑統一為敵3將×3次=9次/tick（原反擊已是此口徑，v4.7前輸出端誤用1次/tick）
// v4.7：「受武力/智力影響」機率校準——追擊率改用具戰報實測值（趙雲37%/馬超16%/關銀屏19%，RATE_CAL 表），
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
//       護盾（張角斗轉參橫）先吸收傷害再扣兵；實測護盾10974=400×智力/10（≈274智，不乘1.81；該場無專武）
// v5.1.5：張角專武護盾「係數提升48%▶70%」經用戶截圖確認為乘算（0階400×1.48=592，滿階×2.58）；
//         舊模型 bookCoef=470 係誤讀 flat+70，已改 CURVES.wpn.張角.shieldPct(48+22×階) 乘算接入
// v5.1.6：①黃月英滿級裸智力 250→200（用戶截圖成長係數+2.56/級反推：138.56+2.56×24=200；舊250源自錯誤圖鑑）
//         ②加點自訂分配：alloc=自訂 + ptsW/ptsZ（合計≤進階屬性點，溢出截斷）；統率加點明示「不加武/智」
//         ③暴擊/buff歸屬以「發揮智力」排名判定（面板顯示部曲#1👑），供玩家微調「剛好比隊友低」
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
  const NA_HITS = 3;                    // v4.8 普攻節奏：每將每秒1次普攻 → 每tick(3秒)3次（用戶實測指正；反擊受擊口徑本已如此，此版統一）
  const COUNTER_K = 2.0;                // v4.3 反擊校準K：每跳傷害=係數×K（張角實測5.6/次、樂進5.7/次 → K≈2.0-2.5，取2.0保守）
  const TROOP_FAC = { '盾兵': 1, '騎兵': 4, '弓兵': 6 }; // 兵種系數（鎖死：盾5.3/騎≈20/弓≈31-37 每擊校準）
  const MAX_TROOPS = 24000;             // 雙方兵力（8000×3）
  const TROOP_HP = 39.8;                // v4.4 每兵HP（陸服戰報反推；僅用於護盾換算，損兵管線因校準口徑抵消）
  const ATTR_MUL = 1.81;                // v4.4 「受武力/智力/統率影響」放大係數（文案200%→實測362%）
  const HEAL_REF = 240;                 // v5.1.9 治療基準統率：治療=係數×發揮統率/240（240=滿級裸統率基準）
                                      // 錨點2026-09-20：30級劉備(裸180+配29)×1.2=250.8，7級德厚流光實測110.5/次
                                      // （Lv10基準150×250.8/240=157.2→×0.7技能等級線性=110.1）；同場傷害264.4 vs 實測264 交叉驗證
                                      // 單一錨點±2%不確定性；技能等級線性縮放(Lv7≈0.7×Lv10)未入模，模型假設滿級Lv10

  // v4.7 「受武力/智力影響」機率校準表（破賊戰報 2026-09-17：趙雲16/43=37%、馬超5/32=16%、關銀屏≈19%）
  // 公式反推失敗：三將擬合 k 值差五倍，判定每技能獨立係數、無通用公式 → 有實測處用實測值覆寫；
  // 其餘「受影響」機率（嘲諷/易傷/燃燒/虛弱等）維持文案基礎值，UI 以 unmodeled 標註
  const RATE_CAL = {
    '趙雲':   { chase: 0.37, paWin: 2.75 },  // 威震三軍：主動後普攻+275%持續9秒、冷卻9秒 → 常駐近似
    '馬超':   { chase: 0.16 },
    '關銀屏': { chase: 0.19 },
  };

  // ---------- v5.0 進階曲線（兵書星級 / 專武進階） ----------
  // 數據來源：2026-09-18 四十張遊戲內進階預覽截圖（亮星數確認區間）+ 資料庫箭頭（已校準=0階→1階）
  // 公式：v(lv) = v0 + lv × step（0→5 階線性等差；跨武將同效果步長一致，部曲防禦≈6.0/階，已驗證）
  // wpn（專武）：lv=1 即 v4.9 及以前模型所用值（DB 箭頭的「下一階」）。book=N 時整組不生效。
  //   defPct：部曲防禦%（接到 DEFSYS book 條目 wstep）；counterCoef：反擊係數（接到 counterOf）
  // book（兵書/覺醒技進階）：v(lv)=v0+lv×step；白板(0星)即常駐 v0 基礎值（v5.1：0階=白板有基礎效果）
  //   spdSm：每點移速差技能傷害%(0.08=0.08%)；spdPa：每點移速差普攻%；teamSm：全體技能傷害%
  // 已收錄未接入（舊模型常駐值參照階不明，遷移後移出此註解）：
  //   兵書部曲防禦類：糜竺32→36(4→5)/程昱33→36/荀彧19.1→22.8/曹丕60→67/張燕25→31/張寶25→32/張梁54→66/
  //     廖化19→25/關興19.2→25.3/張苞57.4→63.5/孫堅40→59/黃蓋25.3→31.3/程普4.1→5.5+每層普攻12.3→16.2/甘寧60→68/王平65→77/步練師28→31
  //   兵書輸出類：糜竺普攻158→175/程昱多段27→31/荀彧易傷率15.5→18.5/曹丕技傷8.8→9.9/徐晃防禦74.7→85.4/
  //     張寶係數54→67/張梁普攻50→61/廖化武力最高技傷8→10/關興普攻40→52/張苞技傷72→80/孟獲不屈15.4→19.1+係數26→29.8/甘寧泥潭增傷120→140
  //   專武：荀攸/程昱/荀彧/糜竺(技傷+防禦)、曹丕反擊後防禦、徐晃三項、孟獲虛弱、張燕三項、張寶三項、張梁係數21→31、
  //     廖化兩項、關興三項、張苞普攻+固定+1命中、張星彩兩項、孫堅兩項、黃蓋兩項、程普兩項、甘寧防禦26→38、王平兩項
  //   v5.1 S2：司馬懿兵書畢力遐方（隱忍傷害1.1→1.6%/層×14、部曲防禦25→37）、
  //     司馬懿專武玄冥天罡扇（額外隱忍機率7→11%、每跳隱忍後防禦1.8→2.6%×15層）、
  //     龐統兵書鳳鳴鵲唳（自身技傷16→23、部曲防禦24→35、鐵索二段53→78、泥澤移速-5%）、
  //     龐統專武靈霄碧霞棍（技傷30→40、防禦39→57、潰敗追傷3→4%上限39000→57200）、
  //     周瑜兵書烈火雄心（燃燒傷害39→57%、部曲防禦38→55%；2026-09-19補，舊DB誤標專武已更正）
  const CURVES = {
    wpn: {
      '張飛': { defPct: { v0: 20, step: 9.3 } },              // 丈八蛇矛：每命中部曲+防禦%（0階20/1階29.3）
      '張角': { defPct: { v0: 39, step: 18 }, counterCoef: { v0: 1.8, step: 0.8 }, shieldPct: { v0: 48, step: 22 } }, // 黃天御雷幡：反擊文案註明「每秒最多觸發15次」；護盾為乘算提升%(2026-09-19用戶截圖確認，舊誤讀flat+70→470已更正)
      '諸葛亮': { defPct: { v0: 35.7, step: 16.3 } },          // 神機扇：每點智力差0.24→0.35%×敵智差148近似
      '黃月英': { defPct: { v0: 5, step: 2 } },                // 玄機書卷
      '甘寧': { counterCoef: { v0: 0.3, step: 0.1 } },         // 狂瀾鑌鐵刀
      '曹丕': { counterCoef: { v0: 1.7, step: 0.8 } },         // 飛景劍
      '樂進': { counterCoef: { v0: 1.9, step: 0.9 } },         // 雪志無畏刀
    },
    book: {
      '樂進': { spdSm: { v0: 0.08, step: 0.02 } },             // 當敵制決：每點移速差技傷%（2階0.12/3階0.14）
      '張星彩': { spdPa: { v0: 0.36, step: 0.18 } },           // 將門鳳儀：每點移速差普攻%（2階0.72/3階0.90）
      '徐晃': { teamSm: { v0: 7, step: 2 } },                  // 長驅直入：泥潭後全體技傷%（2階11/3階13，6秒窗口常駐近似）
    },
  };
  // v5.0 門檻規則（v5.1 修正）：book=N→無兵書無專武；book=Y→白板兵書+白板專武(0階)常駐；
  // 專武升階(≥1階)需武將滿星(adv≥5)+兵書滿星(bookLv≥5)（用本體+兵書升專武的前置）
  function wpnEffOf(s) {
    if (s.book !== 'Y') return { lv: 0, note: '無兵書→無專武' };
    let lv = s.wpnLv === undefined ? 0 : (s.wpnLv | 0);
    if (lv >= 1 && !((s.adv | 0) >= 5 && (s.bookLv | 0) >= 5)) {
      return { lv: 0, note: s.name + '：專武升階需武將滿星+兵書滿星，已限制為0階（白板）' };
    }
    return { lv: lv, note: '' };
  }

  // 兵種階段移速（兵種基礎數據分頁）；缺省 940。data.json 用中文階數鍵，此處相容阿拉伯數字
  const TIER_CN = { '1階': '一階', '2階': '二階', '3階': '三階', '4階': '四階', '5階': '五階' };
  function speedOf(troop, tier) {
    const t = DATA.troopSpeed && DATA.troopSpeed[troop];
    return (t && (t[tier] || t[TIER_CN[tier]])) || 940;
  }

  function defaultSlot(name) {
    return {
      name: name || '', book: 'Y', bookLv: 0, wpnLv: 0, troop: '騎兵', tier: '5階',
      adv: 0, alloc: '自動', ptsW: '', ptsZ: '', ptsT: '',   // v5.1.7/5.1.8：配點填空（武/智/統，任一非空=自訂，合計上限=進階屬性點）
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
    // v4.7：實測校準覆寫（「受武力影響」加成無通用公式，用戰報實測率）
    const cal = RATE_CAL[name];
    if (cal && cal.chase) rate = cal.chase;
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
  // 每 tick 反擊期望傷害：敵方三將各每秒普攻1次(=受普攻9次/tick)；cap 為每秒上限、tick=3秒 → 次數=min(9, cap×3)
  function counterTick(slot, ratio) {
    if (!slot.counter) return 0;
    return Math.min(9, slot.counter.cap * 3) * slot.counter.rate * slot.counter.coef * COUNTER_K * ratio;
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
  //   關羽青龍偃月刀（按武力差動態）、諸葛亮神機扇（按智力差動態）、呂布方天畫戟（每秒疊加至330%）、
  //   徐晃風掣雷行/典韋冷月追魂戟（按移速差動態）、周瑜鐵劍（按燃燒數）、小喬顧曲唱和（按擊潰數）
  // v5.1 已收錄未接入（見 CURVES 註解與 Excel「進階曲線」分頁）：司馬懿畢力遐方/玄冥天罡扇、龐統鳳鳴鵲唳/靈霄碧霞棍
  const DEFSYS = {
    '張飛': [
      { kind: 'def', skill: '據水斷橋', pct: 160, attr: 'wu', dur: 5, trigger: 'na', maxStack: 3, decayAfter: 1 }, // 2層起衰減70%（層2,3僅30%效果）
      { kind: 'def', skill: '丈八蛇矛', pct: 29.3, wstep: 9.3, attr: 'wu', dur: 9, trigger: 'cast', book: true },   // 專武裝備：每命中1部曲+29.3%(1階,0階20,wstep9.3)，v1視同命中1
    ],
    '張角': [
      { kind: 'def', skill: '黃天當立', pct: 200, attr: 'zhi', dur: 6, trigger: 'cast' },   // 施放時+200%(受智力影響)持續6秒
      { kind: 'def', skill: '如日方升', pct: 40, attr: 'zhi', dur: 99, trigger: 'constant' }, // 原為護盾消失後生效，v1常駐化（簡化）
      { kind: 'def', skill: '黃天御雷幡', pct: 57, wstep: 18, attr: 'zhi', dur: 3, trigger: 'na', maxStack: 1, book: true }, // 專武裝備：受普攻時+57%(1階,0階39,wstep18)持續3秒
      { kind: 'shield', skill: '斗轉參橫', coef: 400, dur: 9, cd: 9, attr: 'zhi' }, // 常駐護盾（9s/冷卻9s）；專武乘算+48%/階步進22（CURVES.wpn.張角.shieldPct，book=Y→0階×1.48=592）
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
      { kind: 'def', skill: '神機扇', pct: 52, wstep: 16.3, attr: 'zhi', dur: 9, trigger: 'cast', book: true }, // v4.9：每點智力差+0.35%持續9秒；動態值以敵智250(智力差≈148)近似→+52%；v5.0 wstep=0.11×148(0階0.24/階)
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
      { kind: 'def', skill: '涎玉嬌姿', pct: 4.8, attr: 'wu', dur: 3, trigger: 'na', maxStack: 1, rate: 0.35 }, // 普攻後35%機率+4.8%，期望値近似
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
      { kind: 'def', skill: '玄機書卷', pct: 7, wstep: 2, attr: 'zhi', dur: 99, trigger: 'constant', book: true }, // v4.9：專武部曲防禦+7%(1階,0階5,wstep2)
    ],
    '法正': [
      { kind: 'def', skill: '孝直避箭', pct: 10, attr: 'zhi', dur: 99, trigger: 'constant' },
      { kind: 'def', skill: '面折廷爭', pct: 28, attr: 'zhi', dur: 3, trigger: 'na', maxStack: 1, book: true }, // v4.9：專武受遠程普攻+28%；文案未標持續，取3秒近似；僅遠程生效（對騎兵隊打折，未區分）
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
    // v5.1 S2新武將（被動滿級值=1級→2級線性外推，待滿級效果截圖驗證）：
    '司馬懿': [
      { kind: 'def', skill: '三馬同槽', pct: 79, attr: 'zhi', dur: 99, trigger: 'constant' }, // 部曲防禦提升（1級7%→2級15%推估滿級79%，受智力影響）；<50%額外+21%未計
    ],
    '龐統': [
      { kind: 'def', skill: '佻身飛蛾', pct: 117, attr: 'zhi', dur: 99, trigger: 'constant' }, // 每次鐵索+39%×3層（1級3%→2級7%推估滿級39%每層，受智力影響），滿層常駐化近似
    ],
  };

  // 展開一側三將的防禦條目（過濾專武、預乘 attr 放大），供時間軸查詢
  // v5.0：book 條目依 wpnEff 用 wstep 換算（wstep=每階增量，e.pct=1階值；wpnEff=0→0階值）
  function defEntries(slots) {
    const out = [];
    slots.forEach((s, idx) => {
      (DEFSYS[s.name] || []).forEach((e) => {
        if (e.kind !== 'def') return;
        if (e.book && s.book !== 'Y') return;
        let pct = e.pct;
        if (e.book && e.wstep) pct = e.pct + ((s.wpnEff === undefined ? 0 : s.wpnEff) - 1) * e.wstep;
        out.push({ idx, e, pct: pct * (e.attr ? ATTR_MUL : 1) });
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
  // v5.1.5 專武護盾改乘算：coef×(1+shieldPct%)，shieldPct 走 CURVES.wpn 並依 wpnEff 階數（該場實測無專武→400）
  function shieldTimeline(slots) {
    const ents = [];
    slots.forEach((s) => {
      (DEFSYS[s.name] || []).forEach((e) => {
        if (e.kind !== 'shield') return;
        if (e.book && s.book !== 'Y') return;
        let coef = e.coef;
        const wSh = CURVES.wpn[s.name] && CURVES.wpn[s.name].shieldPct;
        if (s.book === 'Y' && wSh) coef = e.coef * (1 + (wSh.v0 + wSh.step * (s.wpnEff | 0)) / 100);
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
    const built = team.map((s) => {
      const c = DATA.coef[s.name], a = DATA.aff[s.name], at = DATA.attrs[s.name];
      const av = getAdv(s.name, s.adv);
      const mul = affMul(a[s.troop]);
      const add = (st) => (s.s1.attr === st ? num(s.s1.val) : 0) + (s.s2.attr === st ? num(s.s2.val) : 0);
      // 加點屬性：自動=主屬性（裸智力≥裸武力→智力）；配點填空=武/智/統輸入框任一非空即自訂（v5.1.8 加統率，留白依下拉）
      const autoAttr = at.zhi >= at.wu ? '智力' : '武力';
      let alloc = (!s.alloc || s.alloc === '自動') ? autoAttr : s.alloc;
      const pts = av.pts;
      let ptsW = 0, ptsZ = 0, ptsT = 0, allocNote = '';
      const customW = String(s.ptsW == null ? '' : s.ptsW).trim() !== '' ? num(s.ptsW) : null;
      const customZ = String(s.ptsZ == null ? '' : s.ptsZ).trim() !== '' ? num(s.ptsZ) : null;
      const customT = String(s.ptsT == null ? '' : s.ptsT).trim() !== '' ? num(s.ptsT) : null;
      if (customW !== null || customZ !== null || customT !== null) {   // 填空優先：智→武→統依序截斷
        alloc = '自訂';
        ptsZ = Math.min(Math.max(0, customZ || 0), pts);
        ptsW = Math.min(Math.max(0, customW || 0), pts - ptsZ);
        ptsT = Math.min(Math.max(0, customT || 0), pts - ptsZ - ptsW);
      } else if (alloc === '武力') ptsW = pts;
      else if (alloc === '智力') ptsZ = pts;
      else if (alloc === '統率') { ptsT = pts; allocNote = '統率型武將（劉備/曹操等）建議用配點微調；治療技能（德厚流光）受發揮統率影響（v5.1.9）'; }
      else { alloc = autoAttr; if (alloc === '武力') ptsW = pts; else ptsZ = pts; }   // 自動／舊檔自訂留白→自動
      const spdSmEff = av.spdSm * spdDiff;            // v4.2：移速差→技能傷害
      const chase = chaseOf(s.name);                  // v4.3：追擊（額外普攻期望）
      // ---------- v5.0：兵書星級 / 專武進階 ----------
      const wpn = wpnEffOf(s);
      const bkLv = s.book === 'Y' ? (s.bookLv | 0) : 0;   // 無兵書→兵書效果0
      let counter = counterOf(s.name);
      const wCurve = CURVES.wpn[s.name];
      if (counter && wCurve && wCurve.counterCoef) {      // 專武反擊係數：book=N 無專武→整個反擊關閉
        counter = s.book === 'Y'
          ? Object.assign({}, counter, { coef: wCurve.counterCoef.v0 + wCurve.counterCoef.step * wpn.lv })
          : null;
      }
      const bCurve = CURVES.book[s.name];
      const bkSpdSm = bCurve && bCurve.spdSm ? (bCurve.spdSm.v0 + bCurve.spdSm.step * bkLv) / 100 : 0; // %/點→小數
      const bkSpdPa = bCurve && bCurve.spdPa ? (bCurve.spdPa.v0 + bCurve.spdPa.step * bkLv) / 100 : 0;
      const bkTeamSm = bCurve && bCurve.teamSm ? (bCurve.teamSm.v0 + bCurve.teamSm.step * bkLv) / 100 : 0;
      return Object.assign({}, s, {
        c, fac: a.fac, mul, aff: a[s.troop], av, alloc, allocNote, ptsW, ptsZ, ptsT, spdSmEff: spdSmEff + bkSpdSm * spdDiff,
        wpnEff: wpn.lv, gateNote: wpn.note,
        bookSm: bkTeamSm, bookSpdSm: bkSpdSm, bookSpdPa: bkSpdPa, bookLvEff: bkLv,
        chase, chaseMult: chase ? chase.mult : 1, counter,
        wu: round1(at.wu * mul + add('武力') + ptsW),
        zhi: round1(at.zhi * mul + add('智力') + ptsZ),
        tong: round1((at.tong + ptsT) * mul),   // v5.1.9：遊戲實測訂單=(裸+配點)×兵種係數（治療錨點反推，與武/智訂單不同）
        defP: num(s.s1.defP) + num(s.s2.defP),
        // 滿兵每擊普攻（v5模型；兵力衰減由 battle() 依剩餘兵力動態乘）
        // v4.7：paWin=「主動後普攻增傷窗口」常駐近似（威震三軍+275%/9秒、冷卻9秒→覆蓋率≈100%）
        // v5.1：兵書白板(0星)即常駐 v0；每星再 +step（樂進/張星彩系）
        na: Math.round(NA_K * (fac[s.troop] !== undefined ? fac[s.troop] : 1) * (1 + atkP) / (1 + defP) * (1 + av.pa + av.spdPa * spdDiff + bkSpdPa * spdDiff + (RATE_CAL[s.name] && RATE_CAL[s.name].paWin ? RATE_CAL[s.name].paWin : 0)) * 10) / 10,
      });
    });
    // v4.9 黃月英【神工意匠】：部曲中智力最高武將的普攻傷害+100%，該武將每點智力再+1%，上限+200%
    const yy = built.find((s) => s.name === '黃月英');
    if (yy) {
      const tgt = built.reduce((p, s) => (s.zhi > p.zhi ? s : p), built[0]);
      const paBonus = Math.min(2, 1 + tgt.zhi * 0.01);
      tgt.na = Math.round(tgt.na * (1 + paBonus) * 10) / 10;
      tgt.yyPaBonus = paBonus;   // 供 UI/測試檢視
    }
    return built;
  }

  function dmg(slot, i, t, ctx) {
    const av = slot.av;
    const base = (slot.name === '呂布' && slot.troop !== '騎兵' ? 612 : slot.c.base) + av.base;
    const zhuge = slot.name === '諸葛亮'
      ? 3.6 * Math.max(0, slot.zhi - ctx.enemyInt) * (slot.book === 'Y' ? 1.154 : 1) * (1 + (slot.adv >= 5 ? 0.1 : 0))
      : 0;
    // v5.1 司馬懿【貫門雙龍】：自身技能傷害係數+100（Lv10線性外推 1級+10→2級+20；<50%額外+40未計）
    const sima = slot.name === '司馬懿' ? 100 : 0;
    // v5.1 龐統【泣麟悲鳳】：隊伍含龐統且主將(0號槽)為智力最高時，主將主動期望暴擊 +0.8×32.5%（文案值，未乘ATTR_MUL，保守）
    const ptCrit = ctx.ptCrit || 1;
    let sm = slot.c.sm + av.sm + slot.spdSmEff + (slot.bookSm || 0);   // v5.0：+兵書全體技傷(徐晃系)
    if (t !== null && slot.name === '呂布') {
      sm = (slot.book === 'N' ? 0 : Math.min(0.022 * t, 0.95)) + (t >= 3 * (i + 1) + 9 ? 0.5 : 0);
    }
    const exsm = slot.book === 'N' ? slot.c.exsm : 0;
    const trick = num(slot.s1.traitP) + num(slot.s2.traitP);
    const inner = 1 + sm - exsm + ctx.buff + trick + num(slot.extra);
    // v4.9 諸葛亮【八卦陣】：主動技能7.7%機率下一秒再釋放一次 → 期望+7.7%技能傷害
    const bg = slot.name === '諸葛亮' ? 1.077 : 1;
    return Math.round(
      (base + slot.c.dot + zhuge + sima) * inner
      * (1 + av.xprob) * (1 + ctx.tgtPer * av.tgt)
      * ctx.vuln * (1 + ctx.facB) * ctx.targetCorr * bg * ptCrit
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
    // v5.1 龐統【泣麟悲鳳】：隊伍含龐統且主將(0號槽)為智力最高 → 主將主動技能期望傷害×(1+0.8×0.325)
    const ptCrit = slots.some((s) => s.name === '龐統') && argZ === 0 ? 1 + 0.8 * 0.325 : 1;
    const snap = slots.map((s, i) => dmg(s, i, null, { buff: recv[i], vuln: vulnAll, facB, targetCorr, enemyInt, tgtPer, ptCrit }));

    const ticks = [];
    for (let i = 0; i < 30; i++) {
      const t = 3 * (i + 1), m = i % 3;
      const gB = (s) => slots[s].c.bdur >= 99 ? 1 : (t >= 3 * (s + 1) && (t - 3 * (s + 1)) % 9 < slots[s].c.bdur ? 1 : 0);
      const gV = (s) => (t >= 3 * (s + 1) && (t - 3 * (s + 1)) % 9 < slots[s].c.vdur) ? 1 : 0;
      const buff = grid[0][m] * gB(0) + grid[1][m] * gB(1) + grid[2][m] * gB(2)
        + teamSm + (m === argZ ? intlSm : 0) + (m === argW ? wulSm : 0);
      let vm = 1;
      for (let s = 0; s < 3; s++) vm *= (1 + (slots[s].c.vjp + slots[s].av.vp) * slots[s].c.vk * gV(s));
      const d = dmg(slots[m], m, t, { buff, vuln: vm, facB, targetCorr, enemyInt, tgtPer, ptCrit });
      // v5.1.9：治療受發揮統率影響：係數×發揮統率/HEAL_REF（+進階ls）
      const heal = Math.round(slots[m].c.heal * (slots[m].tong / HEAL_REF) + d * (slots[m].c.ls + slots[m].av.ls));
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
      // v4.3：普攻含追擊期望（各將 na × 自身 chaseMult 後加總）；v4.8：×NA_HITS（每秒1次普攻）
      const naTick = Math.round((slots[0].na * slots[0].chaseMult + slots[1].na * slots[1].chaseMult + slots[2].na * slots[2].chaseMult) * ratio * NA_HITS * 10) / 10;
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
    // v4.5 引擎未建模的效果標記（供 UI 顯示，不發明數值）；v5.1：按用戶要求隱藏校準口徑/收錄進度類說明
    const unmodeled = [];
    if (slots.some((s) => s.name === '左慈')) unmodeled.push('分身（左慈）');
    // v5.0：門檻提示（未滿足滿星+滿兵書卻選專武升階時）
    const gateNotes = slots.map((s) => s.gateNote).filter(Boolean);
    if (gateNotes.length) unmodeled.push('進階門檻：' + gateNotes.join('；'));
    return {
      slots, grid: core.grid, facB: core.facB, h17: core.snap.reduce((a, b) => a + b, 0),
      snap: core.snap, ticks, unmodeled, gateNotes,
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
      const naA = naSumA * ratioA * NA_HITS;      // v4.8：每秒1次普攻 → tick內3次
      const dA = skillA + naA;
      // 敵方→我方
      const skillB = coreB.ticks[i].dmg;
      const naB = naSumB * ratioB * NA_HITS;
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

  return { compute, battle, defaultSlot, num, speedOf, NA_K, COUNTER_K, TROOP_FAC, MAX_TROOPS, TROOP_HP, ATTR_MUL, DEFSYS, CURVES, wpnEffOf, defTimeline, shieldTimeline, stackTimeline };
});
