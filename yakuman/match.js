"use strict";

const Sanma = (() => {
  const { tiles, orphans, honors, terminals, winds, dragons, green, chuuren, goals, counts, tileName } = Mahjong;
  const names = ["指令CPU", "CPU 1", "CPU 2"];
  const defaultStrategy = { targets: YakumanStrategy.targetIds, skip: true, calls: "allow", defense: "attack" };
  const newTable = () => ({ points: [35000, 35000, 35000], dealer: 0, rotation: 0, honba: 0, pot: 0 });

  function shuffle(list, random) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  const repeat = (tile, n) => Array(n).fill(tile);

  function opportunity(id, random) {
    const pick = (list) => shuffle([...list], random);
    const ids = pick(tiles);
    const triplets = (list) => list.flatMap((tile) => repeat(tile, 3));
    const suit = random() < 0.5 ? 9 : 18;
    switch (id) {
      case "kokushi": return [...orphans, pick(orphans)[0]];
      case "suuankou": return [...triplets(ids.slice(0, 4)), ...repeat(ids[4], 2)];
      case "daisangen": return [...triplets(dragons), suit + 1, suit + 2, suit + 3, ...repeat(suit + 5, 2)];
      case "tsuuiisou": return honors.flatMap((tile) => repeat(tile, 2));
      case "shousuushii": {
        const order = pick(winds);
        return [...triplets(order.slice(0, 3)), ...repeat(order[3], 2), suit + 2, suit + 3, suit + 4];
      }
      case "daisuushii": return [...triplets(winds), ...repeat(ids.find((tile) => !winds.includes(tile)), 2)];
      case "chinroutou": {
        const order = pick(terminals);
        return [...triplets(order.slice(0, 4)), ...repeat(order[4], 2)];
      }
      case "ryuuiisou": return [19, 20, 21, 19, 20, 21, ...triplets([23, 32]), 25, 25];
      case "chuuren": return [...chuuren.flatMap((n, i) => repeat(suit + i, n)), suit + Math.floor(random() * 9)];
      case "suukantsu": return ids.slice(0, 5);
      default: return [9, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24, 25, ids[0], ids[0]];
    }
  }

  function deal(dealer, mode, random) {
    const bag = shuffle(tiles.flatMap((tile) => repeat(tile, 4)), random);
    const hands = [[], [], []];
    const wall = Array(55).fill(null);
    const dead = Array(14).fill(null);
    function reserve(tile) {
      bag.splice(bag.indexOf(tile), 1);
      return tile;
    }
    if (mode === "collection" && random() < 0.78) {
      const eligible = goals.filter((goal) => goal.id !== (dealer === 0 ? "chiihou" : "tenhou"));
      const { id } = eligible[Math.floor(random() * eligible.length)];
      const hand = opportunity(id, random);
      const first = (3 - dealer) % 3;
      if (id === "suukantsu") {
        hands[0] = [...hand.slice(0, 4).flatMap((tile) => repeat(tile, 3)), hand[4]].map(reserve);
        wall[first] = reserve(hand[0]);
        for (let i = 1; i < 5; i++) dead[14 - i] = reserve(hand[i]);
      } else {
        shuffle(hand, random);
        wall[first] = reserve(hand.pop());
        if (id !== "tenhou" && id !== "chiihou") {
          wall[first + 3 * (1 + Math.floor(random() * 3))] = reserve(hand.pop());
          hands[0] = [...hand.map(reserve), bag.pop()];
        } else {
          hands[0] = hand.map(reserve);
        }
      }
    }
    for (const hand of hands) {
      while (hand.length < 13) hand.push(bag.pop());
      hand.sort((a, b) => a - b);
    }
    return { hands, wall: wall.map((tile) => tile ?? bag.pop()), dead: dead.map((tile) => tile ?? bag.pop()) };
  }

  function start(table, mode, strategy, collected, random = Math.random) {
    const { hands, wall, dead } = deal(table.dealer, mode, random);
    const order = YakumanStrategy.restoreOrder(strategy.order);
    const missing = goals.map((goal) => goal.id).filter((id) => !Object.hasOwn(collected, id));
    const targets = order.filter((id) => strategy.targets.includes(id) && (!strategy.skip || missing.includes(id)));
    const round = {
      table, mode, strategy, targets, missing, fallback: order.filter((id) => missing.includes(id)),
      thresholds: YakumanStrategy.restoreThresholds(strategy.thresholds), activated: new Set(),
      wall, dead, kanCount: 0, called: false, turn: table.dealer,
      wind: table.rotation % 6 < 3 ? 27 : 28, phase: "draw", result: null, last: null,
      players: hands.map((hand, i) => ({
        hand, seat: 27 + (i - table.dealer + 3) % 3, melds: [], river: [], turns: 0,
        goal: null, fallbackGoal: false, riichi: 0, ippatsu: false, temporaryFuriten: false, readyWaits: null,
      })),
    };
    updateGoal(round, counts(hands[0]));
    return round;
  }

  function tripletMissing(c, allowed, fixed, sealed, slots, pairOptions, size) {
    const groupCosts = Array(size + 1).fill(0);
    const candidateCosts = new Map();
    let fixedCost = 0;
    for (const tile of allowed) {
      if (sealed.includes(tile)) continue;
      const missing = size - Math.min(size, c[tile]);
      if (fixed.includes(tile)) fixedCost += missing;
      else {
        groupCosts[missing]++;
        candidateCosts.set(tile, missing);
      }
    }
    let best = Infinity;
    for (const pair of pairOptions) {
      if (fixed.includes(pair) || sealed.includes(pair)) continue;
      let remaining = slots - fixed.length;
      let cost = fixedCost + 2 - Math.min(2, c[pair]);
      const pairCost = candidateCosts.get(pair);
      for (let missing = 0; missing <= size && remaining > 0; missing++) {
        const used = Math.min(remaining, groupCosts[missing] - Number(pairCost === missing));
        remaining -= used;
        cost += used * missing;
      }
      if (!remaining) best = Math.min(best, cost);
    }
    return best;
  }

  function distance(id, c, melds) {
    const slots = 4 - melds.length;
    const sealed = melds.map((meld) => meld.tile);
    const isValueSet = (tile) => sealed.includes(tile);
    switch (id) {
      case "kokushi": return melds.length ? Infinity : 14 - orphans.filter((tile) => c[tile]).length - Number(orphans.some((tile) => c[tile] >= 2));
      case "chuuren": return melds.length ? Infinity : Math.min(...[9, 18].map((start) =>
        chuuren.reduce((sum, n, i) => sum + Math.max(0, n - c[start + i]), 0) + Number(!chuuren.some((n, i) => c[start + i] > n))));
      case "suuankou":
        return melds.some((meld) => meld.open) ? Infinity : tripletMissing(c, tiles, [], sealed, slots, tiles, 3);
      case "suukantsu": {
        const upgrades = melds.filter((meld) => meld.kind === "pon" && !c[meld.tile]).length;
        return (upgrades + tripletMissing(c, tiles, [], sealed, slots, tiles, 4)) * 0.76;
      }
      case "daisuushii":
        return sealed.every((tile) => winds.includes(tile)) ? tripletMissing(c, winds, winds.filter((tile) => !isValueSet(tile)), sealed, slots, tiles, 3) : Infinity;
      case "shousuushii": case "daisangen": {
        const required = id === "shousuushii" ? winds : dragons;
        const pairs = id === "shousuushii" ? winds.filter((tile) => !isValueSet(tile)) : tiles.filter((tile) => !dragons.includes(tile));
        let best = Infinity;
        for (const pair of pairs) {
          if (isValueSet(pair)) continue;
          const fixed = required.filter((tile) => tile !== pair && !isValueSet(tile));
          if (fixed.length > slots) continue;
          let cost = 2 - Math.min(2, c[pair]);
          for (const tile of fixed) cost += 3 - Math.min(3, c[tile]);
          if (fixed.length < slots) {
            let overlap = 0;
            for (const tile of tiles) {
              if (!required.includes(tile) && !isValueSet(tile) && tile !== pair) overlap = Math.max(overlap, Math.min(3, c[tile]));
              if (tile >= 9 && tile < 27 && tile % 9 < 7) {
                const fit = [tile, tile + 1, tile + 2].filter((id) => c[id] > (id === pair ? 2 : 0)).length;
                overlap = Math.max(overlap, fit);
              }
            }
            cost += 3 - overlap;
          }
          best = Math.min(best, cost);
        }
        return best;
      }
      case "tsuuiisou": case "chinroutou": {
        const allowed = id === "tsuuiisou" ? honors : terminals;
        if (!sealed.every((tile) => allowed.includes(tile))) return Infinity;
        const setCost = tripletMissing(c, allowed, [], sealed, slots, allowed, 3);
        const pairCost = id === "tsuuiisou" && !melds.length ? honors.reduce((sum, tile) => sum + 2 - Math.min(2, c[tile]), 0) : Infinity;
        return Math.min(setCost, pairCost);
      }
      case "ryuuiisou": {
        if (!sealed.every((tile) => green.includes(tile))) return Infinity;
        const seq = [19, 20, 21];
        let best = Infinity;
        for (let n = 0; n <= slots; n++) {
          const remaining = [...c];
          let cost = 0;
          for (const tile of seq) {
            cost += Math.max(0, n - c[tile]);
            remaining[tile] = Math.max(0, c[tile] - n);
          }
          const allowed = n > 1 ? green.filter((tile) => !seq.includes(tile)) : green;
          const pairs = n > 2 ? allowed : green;
          best = Math.min(best, cost + tripletMissing(remaining, allowed, [], sealed, slots - n, pairs, 3));
        }
        return best;
      }
      default: return Infinity;
    }
  }

  function updateGoal(round, c) {
    const player = round.players[0];
    const waiting = round.targets.filter((id) => !round.activated.has(id));
    for (const id of YakumanStrategy.qualifying(waiting, round.thresholds, c, player.melds)) round.activated.add(id);

    const available = remainingCopies(round);
    const possible = (id) => canMake(round, id, available);
    const qualified = round.targets.find((id) => round.activated.has(id) && possible(id));
    player.goal = qualified ?? round.fallback.find(possible) ?? null;
    player.fallbackGoal = Boolean(player.goal && !qualified);
  }

  // Concealed hands and unseen wall tiles can still supply a winning tile.
  function remainingCopies(round) {
    const unavailable = visibleTiles(round);
    return unavailable.map((count) => 4 - count);
  }

  function hasOpeningDraw(round) {
    return !round.called && round.players[0].turns === 0 && round.wall.length > (3 - round.turn) % 3;
  }

  function canMake(round, id, available) {
    const player = round.players[0];
    if (id === "tenhou" || id === "chiihou") {
      const isDealer = round.table.dealer === 0;
      if ((id === "tenhou") !== isDealer || !hasOpeningDraw(round)) return false;
      const concealed = counts(player.hand);
      return Mahjong.waits(player.hand, player.melds).some((tile) => available[tile] > concealed[tile]);
    }
    if (id === "suukantsu") {
      const needed = 4 - player.melds.filter((meld) => meld.kind === "kan").length;
      if (needed > Math.min(round.wall.length, 4 - round.kanCount)) return false;
    }
    return distance(id, available, player.melds) === 0;
  }

  function canAchieveAny(round, ids) {
    if (round.result) return false;
    const available = remainingCopies(round);
    const concealed = counts(round.players[0].hand);
    const meldCount = round.players.reduce((sum, player) => sum + player.melds.length, 0);
    // Every future draw or pon can supply at most one tile to the focus hand.
    const acquisitions = round.wall.length + 4 - round.kanCount + 12 - meldCount + Number(round.phase !== "draw");
    const melds = round.players[0].melds;
    return ids.some((id) => canMake(round, id, available) && (
      id === "tenhou" || id === "chiihou" || distance(id, concealed, melds) <= acquisitions
    ));
  }

  function skipIfImpossible(round) {
    return !round.result && round.missing.length > 0 && !canAchieveAny(round, round.missing) &&
      settle(round, null, null, null, null, true);
  }

  const waitCache = new WeakMap();
  const openingMissDisplay = new WeakMap();
  const openingTarget = 0.25;
  const collectionOpeningHitRate = 0.47; // Estimated from 100,000 collection-table deals, without calls.
  const notificationRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

  function scoredWaits(round, player, opening) {
    const key = `${player.hand.join()}|${player.melds.map(({ tile, kind, open }) => `${tile}-${kind}-${open}`).join()}|${opening}`;
    const cached = waitCache.get(round);
    if (cached?.key === key) return cached.waits;
    const tsumo = scoreContext(round, 0, true, { first: opening });
    const ron = scoreContext(round, 0, false);
    const waits = Mahjong.waits(player.hand, player.melds).map((tile) => ({
      tile,
      tsumo: Mahjong.score(player, tile, tsumo)?.yakuman ?? [],
      ron: Mahjong.score(player, tile, ron)?.yakuman ?? [],
    }));
    waitCache.set(round, { key, waits });
    return waits;
  }

  function showOpeningChance(round, waiting, available, concealed, random) {
    // Until the first draw, ignore possible calls and follow the current wall order.
    const firstTile = round.wall[(3 - round.turn) % 3];
    if (waiting.includes(firstTile)) return true;
    if (!openingMissDisplay.has(round)) {
      const unseenCopies = (tile) => available[tile] - concealed[tile];
      const winningCopies = waiting.reduce((sum, tile) => sum + unseenCopies(tile), 0);
      const unseenTotal = tiles.reduce((sum, tile) => sum + unseenCopies(tile), 0);
      const hitRate = round.mode === "collection" ? collectionOpeningHitRate : winningCopies / unseenTotal;
      // With every hit kept, keeping this fraction of misses gives the target hit rate.
      // If the original rate is already higher, trim a quarter of the misses for pacing.
      const keepMiss = hitRate < openingTarget
        ? hitRate * (1 - openingTarget) / ((1 - hitRate) * openingTarget)
        : 1 - openingTarget;
      openingMissDisplay.set(round, random() < keepMiss);
    }
    return openingMissDisplay.get(round);
  }

  function yakumanChances(round, random = notificationRandom) {
    const chances = new Map();
    const player = round.players[0];
    if (round.result || !round.missing.length || player.hand.length + 3 * player.melds.length !== 13) return chances;
    const waits = scoredWaits(round, player, hasOpeningDraw(round));
    if (!waits.length) return chances;

    const available = remainingCopies(round);
    const concealed = counts(player.hand);
    const opponentDrawsNext = round.phase === "draw" && round.turn !== 0;
    const canTsumo = round.wall.length > Number(opponentDrawsNext) || round.phase === "rinshan" && round.turn === 0;
    const canRon = !player.temporaryFuriten && !player.river.some(({ tile }) => waits.some((wait) => wait.tile === tile));
    const fourKans = player.melds.length === 4 && player.melds.every(({ kind }) => kind === "kan");
    for (const wait of waits) {
      if (available[wait.tile] <= concealed[wait.tile]) continue;
      const ids = new Set(canTsumo ? wait.tsumo : []);
      if (canRon) for (const id of wait.ron) ids.add(id);
      for (const id of ids) {
        if (!round.missing.includes(id)) continue;
        if (id === "suukantsu" && !fourKans) continue;
        if (!chances.has(id)) chances.set(id, []);
        chances.get(id).push(wait.tile);
      }
    }
    const openingId = round.table.dealer === 0 ? "tenhou" : "chiihou";
    const openingWaits = chances.get(openingId);
    if (openingWaits && !showOpeningChance(round, openingWaits, available, concealed, random)) chances.delete(openingId);
    return chances;
  }

  function visibleTiles(round, index) {
    const visible = counts(round.dead.slice(0, 2 * (round.kanCount + 1)).filter((_, i) => i % 2 === 0));
    for (const player of round.players) {
      for (const entry of player.river) if (!entry.called) visible[entry.tile]++;
      for (const meld of player.melds) visible[meld.tile] += meld.kind === "kan" ? 4 : 3;
    }
    if (index !== undefined) for (const tile of round.players[index].hand) visible[tile]++;
    return visible;
  }

  function tileUtility(c, visible, player, round) {
    const dora = round.dead.slice(0, 2 * (round.kanCount + 1)).filter((_, i) => i % 2 === 0).map(Mahjong.nextDora);
    let utility = 0;
    for (const tile of tiles) {
      if (!c[tile]) continue;
      if (c[tile] > 1) utility += c[tile] * 0.40;
      if (dora.includes(tile)) utility += c[tile] * 0.32;
      if (dragons.includes(tile) || tile === player.seat || tile === round.wind) utility += (4 - visible[tile]) * 0.15 + c[tile] * 0.08;
      if (tile < 9 || tile >= 27) continue;
      for (const offset of [1, 2]) {
        if (tile % 9 + offset < 9 && c[tile + offset]) utility += offset === 1 ? 0.35 : 0.20;
      }
      utility += (4 - Math.abs(tile % 9 - 4)) * 0.06;
    }
    return utility;
  }

  function bestDiscard(round, index, hand, goal) {
    const player = round.players[index];
    const c = counts(hand);
    const visible = visibleTiles(round, index);
    const threats = round.players.filter((other) => other !== player && other.riichi);
    const safety = index > 0 || round.strategy.defense === "safe";
    let best;
    for (const tile of new Set(hand)) {
      const risk = safety ? threats.filter((other) => !other.river.some((entry) => entry.tile === tile)).length : 0;
      c[tile]--;
      const shanten = Mahjong.shanten(c, player.melds.length);
      const remaining = goal ? distance(goal, c, player.melds) : shanten;
      const danger = tile >= 27 ? (4 - visible[tile]) * 0.20 : 0.75;
      const cost = 10 * remaining + (goal ? 0.25 * shanten : 0) - tileUtility(c, visible, player, round) + risk * danger * (index ? 1 : 4);
      if (!best || cost < best.cost) best = { tile, cost, shanten };
      c[tile]++;
    }
    return best;
  }

  function scoreContext(round, index, tsumo, options = {}) {
    const player = round.players[index];
    return {
      tsumo, seat: player.seat, wind: round.wind, dealer: index === round.table.dealer,
      first: tsumo && !round.called && player.turns === 0,
      last: round.wall.length === 0,
      dora: round.dead.filter((_, i) => i <= 2 * round.kanCount && i % 2 === 0),
      ura: round.dead.filter((_, i) => i <= 2 * round.kanCount + 1 && i % 2 === 1),
      ...options,
    };
  }

  const accepts = (round, index, score) => score && (index > 0 || score.yakuman.length > 0 || !round.players[index].goal);

  function ron(round, source, tile, options) {
    for (let offset = 1; offset <= 2; offset++) {
      const index = (source + offset) % 3;
      const player = round.players[index];
      if (player.temporaryFuriten) continue;
      const score = Mahjong.score(player, tile, scoreContext(round, index, false, options));
      if (!score) continue;
      const wait = player.readyWaits ?? Mahjong.waits(player.hand, player.melds);
      if (player.river.some((entry) => wait.includes(entry.tile))) continue;
      if (accepts(round, index, score)) return settle(round, index, tile, score, source);
      player.temporaryFuriten = true;
    }
    return false;
  }

  function settle(round, winner, tile, score, source = null, skipped = false) {
    const table = round.table;
    const points = [...table.points];
    const dealer = table.dealer;
    const roundTo100 = (n) => Math.ceil(n / 100) * 100;
    let gain = 0;
    let repeatDealer = false;
    let tenpai = [];
    if (winner === null && !skipped) {
      tenpai = round.players.map((player, index) => Mahjong.waits(player.hand, player.melds).length ? index : -1).filter((i) => i >= 0);
      if (tenpai.length > 0 && tenpai.length < 3) {
        for (let i = 0; i < 3; i++) points[i] += tenpai.includes(i) ? 3000 / tenpai.length : -3000 / (3 - tenpai.length);
      }
      repeatDealer = tenpai.includes(dealer);
    } else if (winner !== null) {
      for (let i = 0; i < 3; i++) {
        if (i === winner || source !== null && i !== source) continue;
        const multiplier = source !== null ? winner === dealer ? 6 : 4 : winner === dealer || i === dealer ? 2 : 1;
        const amount = roundTo100(score.base * multiplier) + table.honba * (source !== null ? 300 : 100);
        points[i] -= amount;
        gain += amount;
      }
      gain += table.pot;
      points[winner] += gain;
      repeatDealer = winner === dealer;
    }
    const tableAfter = {
      points, dealer: repeatDealer ? dealer : (dealer + 1) % 3,
      rotation: table.rotation + Number(!repeatDealer), honba: repeatDealer || winner === null ? table.honba + 1 : 0,
      pot: winner === null ? table.pot : 0,
    };
    round.result = { winner, source, tile, score, gain, tenpai, tableAfter, points, skipped };
    round.phase = "finished";
    return true;
  }

  function closeCalls(round) {
    round.called = true;
    for (const player of round.players) player.ippatsu = false;
  }

  function canKan(round) {
    return round.kanCount < 4 && round.wall.length > 0;
  }

  function removeTiles(hand, tile, n) {
    for (let i = 0; i < n; i++) hand.splice(hand.indexOf(tile), 1);
  }

  function selfKan(round, index, drawn) {
    const player = round.players[index];
    if (!canKan(round) || player.melds.length === 4 && !player.melds.some((meld) => meld.kind === "pon")) return false;
    if (index === 0 && ["kokushi", "chuuren", "tsuuiisou"].includes(player.goal) && !player.melds.length) {
      const c = counts(player.hand);
      if (player.goal !== "tsuuiisou" || honors.filter((tile) => c[tile] >= 2).length >= 5) return false;
    }
    const concealed = [...new Set(player.hand)].find((tile) => player.hand.filter((id) => id === tile).length === 4 && (!player.riichi || tile === drawn));
    if (concealed !== undefined) {
      const meld = { kind: "kan", tile: concealed, open: false };
      if (player.riichi) {
        const waits = Mahjong.waits(player.hand.filter((tile) => tile !== concealed), [...player.melds, meld]);
        if (waits.join() !== player.readyWaits.join()) return false;
      }
      removeTiles(player.hand, concealed, 4);
      player.melds.push(meld);
      return markKan(round, index, concealed, "暗槓");
    }
    const existing = player.melds.find((meld) => meld.kind === "pon" && player.hand.includes(meld.tile));
    if (existing) {
      if (ron(round, index, existing.tile, { chankan: true })) return true;
      removeTiles(player.hand, existing.tile, 1);
      existing.kind = "kan";
      return markKan(round, index, existing.tile, "加槓");
    }
    return false;
  }

  function markKan(round, index, tile, label) {
    closeCalls(round);
    round.kanCount++;
    round.wall.pop();
    round.turn = index;
    round.phase = "rinshan";
    round.last = { index, tile, text: `${names[index]} が${tileName(tile)}を${label}。` };
    return true;
  }

  function callDiscard(round, source, entry) {
    if (round.wall.length === 0) return false;
    const { tile } = entry;
    for (let offset = 1; offset <= 2; offset++) {
      const index = (source + offset) % 3;
      const player = round.players[index];
      const c = counts(player.hand);
      if (c[tile] < 2 || player.riichi) continue;
      const kan = c[tile] === 3 && canKan(round);
      const meld = { kind: kan ? "kan" : "pon", tile, open: true };
      const melds = [...player.melds, meld];
      const goal = player.goal;
      if (index === 0 && (round.targets.length || round.fallback.length)) {
        if (round.strategy.calls === "closed" || !goal) continue;
        const prior = distance(goal, c, player.melds);
        c[tile] -= kan ? 3 : 2;
        if (!(distance(goal, c, melds) < prior)) continue;
      } else {
        const hasValue = [tile, ...player.melds.map((set) => set.tile)].some((id) => dragons.includes(id) || id === player.seat || id === round.wind);
        if (!hasValue) continue;
        const prior = Mahjong.shanten(c, player.melds.length);
        c[tile] -= kan ? 3 : 2;
        if (Mahjong.shanten(c, melds.length) >= prior) continue;
      }
      closeCalls(round);
      entry.called = true;
      removeTiles(player.hand, tile, kan ? 3 : 2);
      player.melds.push(meld);
      if (kan) {
        const discard = round.last.text;
        markKan(round, index, tile, "大明槓");
        round.last.text = `${discard} ${round.last.text}`;
        return true;
      }
      round.turn = index;
      round.phase = "pon";
      round.last = { index, tile, text: `${round.last.text} ${names[index]} が${tileName(tile)}をポン。` };
      return true;
    }
    return false;
  }

  function step(round) {
    if (round.result) return;
    const index = round.turn;
    const player = round.players[index];
    const drawMode = round.phase;
    const afterPon = drawMode === "pon";
    let drawn;
    if (!afterPon) {
      if (drawMode !== "rinshan" && !round.wall.length) return settle(round, null, null, null);
      drawn = drawMode === "rinshan" ? round.dead[14 - round.kanCount] : round.wall.shift();
      if (!player.riichi) player.temporaryFuriten = false;
      if (index === 0) {
        const c = counts(player.hand);
        c[drawn]++;
        updateGoal(round, c);
      }
      const score = Mahjong.score(player, drawn, scoreContext(round, index, true, { rinshan: drawMode === "rinshan" }));
      player.turns++;
      if (accepts(round, index, score)) return settle(round, index, drawn, score);
      player.hand.push(drawn);
    }
    if (afterPon && index === 0) updateGoal(round, counts(player.hand));
    if (!afterPon && selfKan(round, index, drawn)) return;

    const discard = player.riichi ? { tile: drawn } : bestDiscard(round, index, player.hand, player.goal);
    removeTiles(player.hand, discard.tile, 1);
    player.hand.sort((a, b) => a - b);
    const entry = { tile: discard.tile, riichi: false, called: false };
    player.river.push(entry);
    const drawText = index === 0 && !afterPon ? `${tileName(drawn)}を${drawMode === "rinshan" ? "嶺上ツモ" : "ツモ"}し、` : "";
    round.last = { index, tile: entry.tile, text: `${names[index]} が${drawText}${tileName(entry.tile)}を打牌。` };
    if (ron(round, index, entry.tile)) return;
    if (player.riichi) player.ippatsu = false;
    else if ((index > 0 || !round.targets.length && !round.fallback.length) && discard.shanten === 0 && Mahjong.isClosed(player) &&
      round.table.points[index] >= 1000 && round.wall.length >= 4) {
      const waits = Mahjong.waits(player.hand, player.melds);
      if (waits.length) {
        player.riichi = !round.called && player.turns === 1 ? 2 : 1;
        player.readyWaits = waits;
        player.ippatsu = true;
        round.table.points[index] -= 1000;
        round.table.pot += 1000;
        entry.riichi = true;
        round.last.text = `${names[index]} が${drawText}${tileName(entry.tile)}を切ってリーチ。`;
      }
    }
    if (callDiscard(round, index, entry)) return;
    round.turn = (index + 1) % 3;
    round.phase = "draw";
    if (!round.wall.length) settle(round, null, null, null);
  }

  return { names, defaultStrategy, newTable, start, step, skipIfImpossible, canAchieveAny, yakumanChances };
})();
