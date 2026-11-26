"use strict";

const YakumanStrategy = (() => {
  const { tiles, orphans, honors, terminals, winds, dragons, green } = Mahjong;
  const suits = [9, 18].map((start) => Array.from({ length: 9 }, (_, i) => start + i));

  const field = (id, label, unit, max, initial, measure) => ({ id, label, unit, max, initial, measure });
  const copies = (list) => (hand) => list.reduce((sum, tile) => sum + hand.all[tile], 0);
  const kinds = (list, min) => (hand) => list.filter((tile) => hand.all[tile] >= min).length;
  const countSets = (hand) => tiles.filter((tile) => hand.concealed[tile] >= 3).length;
  const countKans = (hand) => hand.melds.filter((meld) => meld.kind === "kan").length;

  const conditions = new Map([
    ["kokushi", { fields: [
      field("tiles", "么九牌（1・9・字牌）", "枚", 14, 8, copies(orphans)),
      field("kinds", "么九牌の種類", "種", 13, 7, kinds(orphans, 1)),
    ] }],
    ["suuankou", { any: true, fields: [
      field("sets", "暗刻・暗槓", "組", 4, 2, (hand) => countSets(hand) + hand.melds.filter((meld) => !meld.open && meld.kind === "kan").length),
      field("pairs", "対子", "組", 7, 4, (hand) => tiles.filter((tile) => hand.concealed[tile] === 2).length),
    ] }],
    ["daisangen", { fields: [
      field("tiles", "三元牌（白・發・中）", "枚", 12, 5, copies(dragons)),
      field("pairs", "対子以上の三元牌", "種", 3, 2, kinds(dragons, 2)),
    ] }],
    ["tsuuiisou", { fields: [
      field("tiles", "字牌", "枚", 18, 8, copies(honors)),
      field("pairs", "対子以上の字牌", "種", 7, 3, kinds(honors, 2)),
    ] }],
    ["shousuushii", { fields: [
      field("tiles", "風牌（東・南・西・北）", "枚", 16, 7, copies(winds)),
      field("kinds", "風牌の種類", "種", 4, 3, kinds(winds, 1)),
      field("pairs", "対子以上の風牌", "種", 4, 3, kinds(winds, 2)),
    ] }],
    ["daisuushii", { fields: [
      field("sets", "風牌の刻子・槓子", "組", 4, 2, kinds(winds, 3)),
      field("kinds", "風牌の種類", "種", 4, 4, kinds(winds, 1)),
    ] }],
    ["chinroutou", { fields: [
      field("tiles", "数牌の1・9", "枚", 18, 8, copies(terminals)),
      field("pairs", "対子以上の1・9", "種", 6, 3, kinds(terminals, 2)),
    ] }],
    ["ryuuiisou", { fields: [
      field("tiles", "緑牌（2・3・4・6・8索、發）", "枚", 18, 8, copies(green)),
      field("kinds", "緑牌の種類", "種", 6, 4, kinds(green, 1)),
    ] }],
    ["chuuren", { sameSuit: true, fields: [
      field("tiles", "同じ色の数牌", "枚", 14, 9, (hand, suit) => copies(suit)(hand)),
      field("ends", "その色の1・9の合計", "枚", 8, 4, (hand, suit) => hand.all[suit[0]] + hand.all[suit[8]]),
      field("kinds", "その色の数牌の種類", "種", 9, 6, (hand, suit) => kinds(suit, 1)(hand)),
    ] }],
    ["suukantsu", { any: true, fields: [
      field("kans", "槓子", "組", 4, 1, countKans),
      field("sets", "刻子・槓子の合計", "組", 4, 4, (hand) => countSets(hand) + hand.melds.length),
    ] }],
  ]);

  const targetIds = [...conditions.keys()];

  function restoreOrder(saved) {
    const order = Array.isArray(saved) ? saved.filter((id) => conditions.has(id)) : [];
    return [...new Set([...order, ...targetIds])];
  }

  function restoreThresholds(saved) {
    return Object.fromEntries([...conditions].map(([id, { fields }]) => [id, Object.fromEntries(fields.map(({ id: key, initial, max }) => {
      const value = saved?.[id]?.[key];
      return [key, Number.isInteger(value) ? Math.min(max, Math.max(0, value)) : initial];
    }))]));
  }

  function qualifying(targets, thresholds, concealed, melds) {
    if (!targets.length) return [];
    const all = [...concealed];
    for (const meld of melds) all[meld.tile] += meld.kind === "kan" ? 4 : 3;
    const hand = { concealed, all, melds };
    return targets.filter((id) => {
      const { any, sameSuit, fields } = conditions.get(id);
      const qualifies = (suit) => {
        const meets = (field) => field.measure(hand, suit) >= thresholds[id][field.id];
        return any ? fields.some(meets) : fields.every(meets);
      };
      return sameSuit ? suits.some(qualifies) : qualifies();
    });
  }

  return { conditions, targetIds, restoreOrder, restoreThresholds, qualifying };
})();
