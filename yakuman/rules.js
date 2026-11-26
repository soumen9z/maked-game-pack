"use strict";

// Tile IDs retain the usual 34-tile indexing. 2–8 man are absent from the wall.
const Mahjong = (() => {
  const tiles = [0, 8, ...Array.from({ length: 25 }, (_, i) => i + 9)];
  const orphans = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const honors = [27, 28, 29, 30, 31, 32, 33];
  const terminals = orphans.slice(0, 6);
  const green = [19, 20, 21, 23, 25, 32];
  const winds = honors.slice(0, 4);
  const dragons = honors.slice(4);
  const chuuren = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  const numbers = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const honorNames = ["東", "南", "西", "北", "白", "發", "中"];

  const goals = [
    { id: "kokushi", name: "国士無双", mark: 0, detail: "13種類の么九牌を各1枚と、そのうち1種類をもう1枚。門前限定。" },
    { id: "suuankou", name: "四暗刻", mark: 22, detail: "暗刻・暗槓を合計4組。ロンなら単騎待ち。" },
    { id: "daisangen", name: "大三元", mark: 33, detail: "白・發・中をすべて刻子か槓子にする。" },
    { id: "tsuuiisou", name: "字一色", mark: 27, detail: "字牌だけで和了する。七対子も対象。" },
    { id: "shousuushii", name: "小四喜", mark: 28, detail: "風牌3種類の刻子か槓子と、残りの風牌の雀頭。" },
    { id: "daisuushii", name: "大四喜", mark: 29, detail: "東・南・西・北をすべて刻子か槓子にする。" },
    { id: "chinroutou", name: "清老頭", mark: 8, detail: "数牌の1と9だけで和了する。" },
    { id: "ryuuiisou", name: "緑一色", mark: 32, detail: "二・三・四・六・八索と發だけで和了する。" },
    { id: "chuuren", name: "九蓮宝燈", mark: 17, detail: "門前で、筒子か索子の1112345678999に同じ色の数牌を1枚足す。" },
    { id: "suukantsu", name: "四槓子", mark: 26, detail: "4組すべてを槓子にして和了する。明槓も対象。" },
    { id: "tenhou", name: "天和", mark: 9, detail: "親が配牌の14枚で和了する。" },
    { id: "chiihou", name: "地和", mark: 18, detail: "子が誰も鳴いていない最初のツモで和了する。" },
  ];

  function tileName(tile) {
    return tile >= 27 ? honorNames[tile - 27] : numbers[tile % 9] + "萬筒索"[Math.floor(tile / 9)];
  }

  function counts(hand) {
    const result = Array(34).fill(0);
    for (const tile of hand) result[tile]++;
    return result;
  }

  function sequenceStart(tile) {
    return tile >= 9 && tile < 27 && tile % 9 < 7;
  }

  function allShapes(handCounts, meldCount, visit) {
    const groups = [];
    function search(pair) {
      const tile = handCounts.findIndex(Boolean);
      if (tile < 0) return pair >= 0 && groups.length + meldCount === 4 && visit(pair, groups);
      if (pair < 0 && handCounts[tile] >= 2) {
        handCounts[tile] -= 2;
        const stop = search(tile);
        handCounts[tile] += 2;
        if (stop) return true;
      }
      if (groups.length + meldCount === 4) return false;
      if (handCounts[tile] >= 3) {
        handCounts[tile] -= 3;
        groups.push({ tile, kind: "triplet" });
        const stop = search(pair);
        groups.pop();
        handCounts[tile] += 3;
        if (stop) return true;
      }
      if (sequenceStart(tile) && handCounts[tile + 1] && handCounts[tile + 2]) {
        handCounts[tile]--;
        handCounts[tile + 1]--;
        handCounts[tile + 2]--;
        groups.push({ tile, kind: "sequence" });
        const stop = search(pair);
        groups.pop();
        handCounts[tile]++;
        handCounts[tile + 1]++;
        handCounts[tile + 2]++;
        if (stop) return true;
      }
      return false;
    }
    return search(-1);
  }

  const kokushi = (c) => orphans.every((tile) => c[tile]) && orphans.some((tile) => c[tile] === 2);
  const sevenPairs = (c) => c.filter((n) => n === 2).length === 7;
  const isYao = (tile) => tile < 9 || tile >= 27 || tile % 9 === 0 || tile % 9 === 8;
  const isClosed = (player) => player.melds.every((meld) => !meld.open);

  function winShape(c, meldCount) {
    return (!meldCount && (kokushi(c) || sevenPairs(c))) || allShapes(c, meldCount, () => true);
  }

  function waits(hand, melds) {
    const c = counts(hand);
    const exposed = counts(melds.flatMap((meld) => Array(meld.kind === "kan" ? 4 : 3).fill(meld.tile)));
    return tiles.filter((tile) => {
      if (c[tile] + exposed[tile] >= 4) return false;
      c[tile]++;
      const complete = winShape(c, melds.length);
      c[tile]--;
      return complete;
    });
  }

  function nextDora(tile) {
    if (tile < 9) return tile === 0 ? 8 : 0;
    if (tile < 27) return tile % 9 === 8 ? tile - 8 : tile + 1;
    if (tile < 31) return tile === 30 ? 27 : tile + 1;
    return tile === 33 ? 31 : tile + 1;
  }

  function valueWind(tile, ctx) {
    return Number(tile === ctx.seat) + Number(tile === ctx.wind);
  }

  function commonYaku(all, closed, player, ctx) {
    const yaku = [];
    if (player.riichi) yaku.push([player.riichi === 2 ? "ダブル立直" : "立直", player.riichi]);
    if (player.ippatsu && player.riichi) yaku.push(["一発", 1]);
    if (ctx.tsumo && closed) yaku.push(["門前清自摸和", 1]);
    if (ctx.rinshan) yaku.push(["嶺上開花", 1]);
    if (ctx.chankan) yaku.push(["槍槓", 1]);
    if (ctx.last && !ctx.rinshan && !ctx.chankan) yaku.push([ctx.tsumo ? "海底摸月" : "河底撈魚", 1]);
    if (all.every((tile) => !isYao(tile))) yaku.push(["断么九", 1]);
    const suits = new Set(all.filter((tile) => tile < 27).map((tile) => Math.floor(tile / 9)));
    if (suits.size === 1) {
      if (all.some((tile) => tile >= 27)) yaku.push(["混一色", closed ? 3 : 2]);
      else yaku.push(["清一色", closed ? 6 : 5]);
    }
    if (all.every(isYao)) yaku.push(["混老頭", 2]);
    return yaku;
  }

  function ordinaryYaku(groups, pair, winningGroup, tile, closed, ctx, common) {
    const yaku = [...common];
    const sequences = groups.filter((group) => group.kind === "sequence");
    const sets = groups.filter((group) => group.kind !== "sequence");
    let waitFu = 0;
    if (!winningGroup || winningGroup.kind === "sequence" && (
      tile === winningGroup.tile + 1 ||
      winningGroup.tile % 9 === 0 && tile === winningGroup.tile + 2 ||
      winningGroup.tile % 9 === 6 && tile === winningGroup.tile
    )) waitFu = 2;

    const pairFu = dragons.includes(pair) ? 2 : 2 * valueWind(pair, ctx);
    const pinfu = closed && sequences.length === 4 && !pairFu && !waitFu;
    if (pinfu) yaku.push(["平和", 1]);
    if (closed) {
      const repeated = counts(sequences.map((group) => group.tile)).filter((n) => n >= 2).reduce((sum, n) => sum + Math.floor(n / 2), 0);
      if (repeated === 2) yaku.push(["二盃口", 3]);
      else if (repeated === 1) yaku.push(["一盃口", 1]);
    }
    const sequenceTiles = sequences.map((group) => group.tile);
    if ([9, 18].some((start) => [0, 3, 6].every((offset) => sequenceTiles.includes(start + offset)))) {
      yaku.push(["一気通貫", closed ? 2 : 1]);
    }
    if (sequences.length && isYao(pair) && sets.every((group) => isYao(group.tile)) &&
      sequences.every((group) => [0, 6].includes(group.tile % 9))) {
      if (pair >= 27 || sets.some((group) => group.tile >= 27)) yaku.push(["混全帯么九", closed ? 2 : 1]);
      else yaku.push(["純全帯么九", closed ? 3 : 2]);
    }
    if (sets.length === 4) yaku.push(["対々和", 2]);
    const concealed = sets.filter((group) => !group.open && (ctx.tsumo || group !== winningGroup));
    if (concealed.length === 3) yaku.push(["三暗刻", 2]);
    if (sets.filter((group) => group.kind === "kan").length === 3) yaku.push(["三槓子", 2]);
    const setTiles = sets.map((group) => group.tile);
    if ([0, 8].some((rank) => [rank, rank + 9, rank + 18].every((id) => setTiles.includes(id)))) yaku.push(["三色同刻", 2]);
    if (dragons.includes(pair) && setTiles.filter((id) => dragons.includes(id)).length === 2) yaku.push(["小三元", 2]);
    for (const id of setTiles) {
      const han = dragons.includes(id) ? 1 : valueWind(id, ctx);
      if (han) yaku.push([`役牌 ${tileName(id)}`, han]);
    }

    let fu = 20 + pairFu + waitFu;
    if (ctx.tsumo && !pinfu) fu += 2;
    if (!ctx.tsumo && closed) fu += 10;
    for (const group of sets) {
      const open = group.open || !ctx.tsumo && group === winningGroup;
      fu += 2 * (open ? 1 : 2) * (isYao(group.tile) ? 2 : 1) * (group.kind === "kan" ? 4 : 1);
    }
    if (!closed && fu === 20) fu = 30;
    return { yaku, fu: Math.ceil(fu / 10) * 10, concealed: concealed.length };
  }

  function score(player, tile, ctx) {
    const hand = [...player.hand, tile];
    const c = counts(hand);
    const melds = player.melds;
    const closed = isClosed(player);
    if (hand.length + 3 * melds.length !== 14 || !winShape(c, melds.length)) return null;

    const all = [...hand];
    for (const meld of melds) all.push(...Array(meld.kind === "kan" ? 4 : 3).fill(meld.tile));
    const yakuman = new Set();
    if (ctx.first && ctx.tsumo) yakuman.add(ctx.dealer ? "tenhou" : "chiihou");
    if (!melds.length && kokushi(c)) yakuman.add("kokushi");
    if (all.every((id) => id >= 27)) yakuman.add("tsuuiisou");
    if (all.every((id) => terminals.includes(id))) yakuman.add("chinroutou");
    if (all.every((id) => green.includes(id))) yakuman.add("ryuuiisou");
    if (closed && !melds.length && [9, 18].some((start) => all.every((id) => id >= start && id < start + 9) &&
      chuuren.every((n, i) => c[start + i] >= n))) yakuman.add("chuuren");

    const common = commonYaku(all, closed, player, ctx);
    const indicators = player.riichi ? [...ctx.dora, ...ctx.ura] : ctx.dora;
    const bonus = indicators.reduce((sum, id) => sum + all.filter((tileId) => tileId === nextDora(id)).length, 0);
    let best = null;
    function offer(yaku, fu) {
      if (!yaku.length) return;
      const han = yaku.reduce((sum, entry) => sum + entry[1], bonus);
      const base = han >= 11 ? 6000 : han >= 8 ? 4000 : han >= 6 ? 3000 : han === 5 ? 2000 : Math.min(2000, fu * 2 ** (han + 2));
      if (!best || base > best.base || base === best.base && han > best.han) {
        best = { base, han, fu, yaku: bonus ? [...yaku, ["ドラ", bonus]] : yaku, yakuman: [] };
      }
    }
    if (!melds.length && sevenPairs(c)) offer([...common, ["七対子", 2]], 25);

    allShapes(c, melds.length, (pair, concealedGroups) => {
      const groups = [...concealedGroups, ...melds];
      const setTiles = groups.filter((group) => group.kind !== "sequence").map((group) => group.tile);
      if (dragons.every((id) => setTiles.includes(id))) yakuman.add("daisangen");
      const windSets = winds.filter((id) => setTiles.includes(id)).length;
      if (windSets === 4) yakuman.add("daisuushii");
      if (windSets === 3 && winds.includes(pair)) yakuman.add("shousuushii");
      if (melds.filter((group) => group.kind === "kan").length === 4) yakuman.add("suukantsu");
      const placements = concealedGroups.filter((group) => group.kind === "triplet" ? group.tile === tile : tile >= group.tile && tile <= group.tile + 2);
      if (pair === tile) placements.push(null);
      for (const placement of placements) {
        const result = ordinaryYaku(groups, pair, placement, tile, closed, ctx, common);
        if (result.concealed === 4) yakuman.add("suuankou");
        offer(result.yaku, result.fu);
      }
      return false;
    });
    if (yakuman.size) return { base: 8000 * yakuman.size, yaku: [], yakuman: [...yakuman] };
    return best;
  }

  // Cache the possible groups within each suit independently to keep CPU turns quick.
  const suitCache = new Map([[0, [0]]]);
  const powers = Array.from({ length: 9 }, (_, i) => 5 ** i);

  function suitGroups(code) {
    if (suitCache.has(code)) return suitCache.get(code);
    const c = powers.map((power) => Math.floor(code / power) % 5);
    const i = c.findIndex(Boolean);
    const power = powers[i];
    const result = new Set(suitGroups(code - power));
    function add(rest, value) {
      for (const entry of suitGroups(rest)) {
        if (value === 1 && entry % 2) continue;
        result.add(entry + value);
      }
    }
    if (c[i] >= 2) {
      add(code - 2 * power, 1);
      add(code - 2 * power, 2);
    }
    if (c[i] >= 3) add(code - 3 * power, 16);
    if (c[i + 1]) add(code - power - powers[i + 1], 2);
    if (c[i + 2]) {
      add(code - power - powers[i + 2], 2);
      if (c[i + 1]) add(code - power - powers[i + 1] - powers[i + 2], 16);
    }
    const options = [...result];
    suitCache.set(code, options);
    return options;
  }

  function shanten(c, meldCount) {
    const suits = [9, 18].map((start) => suitGroups(powers.reduce((code, power, i) => code + c[start + i] * power, 0)));
    const loose = [0, 8, ...honors];
    let sets = 0;
    let pairs = 0;
    for (const tile of loose) {
      if (c[tile] >= 3) sets++;
      else if (c[tile] === 2) pairs++;
    }
    let best = 8;
    for (const first of suits[0]) {
      for (const second of suits[1]) {
        const heads = first % 2 + second % 2;
        if (heads > 1) continue;
        const m = meldCount + sets + (first >> 4) + (second >> 4);
        if (m > 4) continue;
        const t = pairs + ((first >> 1) & 7) + ((second >> 1) & 7);
        const head = Number(heads > 0 || pairs > 0);
        best = Math.min(best, 8 - 2 * m - Math.min(4 - m, t - (heads ? 0 : head)) - head);
      }
    }
    if (!meldCount) {
      const pairsInHand = c.filter((n) => n >= 2).length;
      best = Math.min(best, 6 - pairsInHand + Math.max(0, 7 - c.filter(Boolean).length));
      best = Math.min(best, 13 - orphans.filter((id) => c[id]).length - Number(orphans.some((id) => c[id] >= 2)));
    }
    return best;
  }

  return { tiles, orphans, honors, terminals, winds, dragons, green, chuuren, goals, tileName, counts, isClosed, waits, score, shanten, nextDora };
})();
