"use strict";

const goalById = new Map(Mahjong.goals.map((goal) => [goal.id, goal]));
const modeName = { collection: "収集卓", standard: "通常卓" };
const storageKey = "maked-game-pack.yakuman.1";
const format = new Intl.NumberFormat("ja-JP");
const el = (id) => document.getElementById(id);
const selectFields = ["calls", "defense"];
const pipPositions = [[], [5], [1, 9], [1, 5, 9], [1, 3, 7, 9], [1, 3, 5, 7, 9], [1, 3, 4, 6, 7, 9], [1, 3, 4, 5, 6, 7, 9], [1, 2, 3, 4, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9]];

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function tileElement(tile, modifier = "") {
  const element = node("span", `tile ${modifier}`);
  if (tile === null) {
    element.classList.add("back");
    element.setAttribute("aria-hidden", "true");
    return element;
  }
  const name = Mahjong.tileName(tile);
  element.title = name;
  element.setAttribute("aria-label", name);
  element.setAttribute("role", "img");
  if (tile >= 27) {
    if (tile === 31) element.classList.add("white");
    else element.textContent = name;
    if (tile === 32) element.classList.add("green");
    if (tile === 33) element.classList.add("red");
  } else if (tile < 9) {
    element.classList.add("man");
    element.append(node("span", "", name[0]), node("b", "", "萬"));
  } else {
    element.classList.add(tile < 18 ? "pin" : "sou");
    const rank = tile % 9 + 1;
    const pips = node("span", "pips");
    pips.dataset.rank = rank;
    for (const position of pipPositions[rank]) {
      const pip = node("i", "pip");
      pip.style.gridArea = `${Math.ceil(position / 3)} / ${(position - 1) % 3 + 1}`;
      pips.append(pip);
    }
    element.append(pips);
  }
  return element;
}

function freshRun() {
  return { count: 0, collected: {}, log: [], table: Sanma.newTable() };
}

function load() {
  const fallback = {
    mode: "collection",
    skipImpossible: false,
    highlightChance: false,
    strategy: { ...Sanma.defaultStrategy, targets: [...YakumanStrategy.targetIds], order: YakumanStrategy.restoreOrder(), thresholds: YakumanStrategy.restoreThresholds() },
    best: {}, run: freshRun(),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || !Object.hasOwn(modeName, saved.mode) || !Array.isArray(saved.strategy?.targets) || !saved.run?.table) return fallback;
    const { targets, order, thresholds, skip, calls, defense } = saved.strategy;
    saved.skipImpossible = Boolean(saved.skipImpossible);
    saved.highlightChance = Boolean(saved.highlightChance);
    saved.strategy = {
      targets: YakumanStrategy.targetIds.filter((id) => targets.includes(id)),
      order: YakumanStrategy.restoreOrder(order ?? (thresholds ? undefined : targets)),
      thresholds: YakumanStrategy.restoreThresholds(thresholds),
      skip: skip ?? fallback.strategy.skip,
      calls: calls ?? fallback.strategy.calls,
      defense: defense ?? fallback.strategy.defense,
    };
    return saved;
  } catch {
    return fallback;
  }
}

let data = load();
let round = null;
let timer = null;
let running = false;
let stopAt = Infinity;
let lastPaint = 0;
let recentSummary = "";
let storageOk = true;
let scheduleId = 0;
let chance = null;
const seenChances = new Set();
const batchChannel = new MessageChannel();
batchChannel.port1.onmessage = ({ data: id }) => {
  if (id === scheduleId) tick();
};

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    storageOk = false;
    renderStrategyNote();
  }
}

const completed = () => Mahjong.goals.every((goal) => Object.hasOwn(data.run.collected, goal.id));

function updateMetrics() {
  const best = data.best[data.mode];
  el("total-collected").textContent = Object.keys(data.run.collected).length;
  el("total-rounds").textContent = format.format(data.run.count);
  el("best").textContent = best ? format.format(best) : "—";
  el("best-unit").hidden = !best;
  el("completion").hidden = !completed();
  if (completed()) el("completion").textContent = `全12種をコンプリート！ ${format.format(data.run.count)}局で達成しました。`;
}

function seatView(index, table) {
  const seat = el(`seat-${index}`);
  const player = round?.players[index];
  const won = round?.result?.winner === index;
  const wind = player?.seat ?? 27 + (index - table.dealer + 3) % 3;
  seat.dataset.active = Boolean(round && !round.result && round.turn === index);
  seat.dataset.winner = won;

  const title = node("div", "seat-title");
  const identity = node("div", "seat-name");
  const windMark = node("span", `wind ${wind === 27 ? "dealer" : ""}`, Mahjong.tileName(wind));
  if (wind === 27) windMark.title = "親";
  identity.append(windMark, node("strong", "", Sanma.names[index]));
  if (player?.riichi) identity.append(node("span", "riichi-mark", "立直"));
  if (index === 0 && player && !round.result) {
    if (player.goal) identity.append(node("span", "goal-label", `${goalById.get(player.goal).name}${player.fallbackGoal ? "（優先順）" : ""}`));
    else if (round.missing.length) identity.append(node("span", "goal-label waiting-goal", "自動判定待ち"));
  }
  const points = round?.result?.points ?? table.points;
  title.append(identity, node("span", "seat-points", `${format.format(points[index])} 点`));

  const hand = node("div", "tiles hand");
  hand.setAttribute("aria-label", index === 0 || won ? "手牌" : "伏せられた手牌");
  const display = player && (index === 0 || won) ? player.hand : Array(player?.hand.length ?? 13).fill(null);
  hand.append(...display.map((tile) => tileElement(tile)));
  if (won) hand.append(tileElement(round.result.tile, "winning"));
  for (const meld of player?.melds ?? []) {
    const group = node("span", `meld-group ${meld.open ? "open" : ""}`);
    const openTiles = meld.kind === "kan" ? [meld.tile, meld.tile, meld.tile, meld.tile] : [meld.tile, meld.tile, meld.tile];
    const faces = meld.open || index === 0 || won ? openTiles : [null, meld.tile, meld.tile, null];
    group.append(...faces.map((tile) => tileElement(tile)));
    hand.append(group);
  }
  const river = node("div", "tiles river");
  river.setAttribute("aria-label", "捨て牌");
  for (const entry of player?.river ?? []) river.append(tileElement(entry.tile, `${entry.riichi ? "declaration" : ""} ${entry.called ? "called" : ""}`));
  seat.replaceChildren(title, hand, river);
}

function renderTable() {
  const table = round?.table ?? data.run.table;
  const displayCount = data.run.count + Number(!round?.result);
  const wind = table.rotation % 6 < 3 ? "東" : "南";
  el("round-label").textContent = `第${format.format(displayCount)}局 · ${wind}${table.rotation % 3 + 1}局${table.honba ? ` ${table.honba}本場` : ""}`;
  for (let i = 0; i < 3; i++) seatView(i, table);
  el("wall-count").textContent = round ? `${round.wall.length} 枚` : "—";
  el("riichi-pot").textContent = format.format(round?.result?.tableAfter.pot ?? table.pot);
  const dora = round?.dead.filter((_, index) => index % 2 === 0 && index <= 2 * round.kanCount);
  if (dora) el("dora-tiles").replaceChildren(...dora.map((tile) => tileElement(tile)));
  else el("dora-tiles").textContent = "—";
  el("table-message").textContent = round?.result ? recentSummary : round?.last?.text ?? (round ? "配牌を終えました。" : data.run.count ? "続きの局を開始できます。" : "作戦を選び、対局を開始してください。");
}

function renderControls() {
  const complete = completed();
  const status = el("play-status");
  const state = chance ? "chance" : complete ? "complete" : running ? "running" : round && !round.result ? "paused" : data.run.count ? "waiting" : "ready";
  const labels = { chance: "手動観戦", complete: "収集完了", running: "対局中", paused: "一時停止", waiting: "次局待ち", ready: "開始前" };
  status.dataset.state = state;
  status.textContent = labels[state];
  el("play-button").textContent = running ? "一時停止" : complete ? "収集完了" : round || data.run.count ? "対局再開" : "対局開始";
  el("play-button").disabled = complete || Boolean(chance);
  el("one-round").disabled = complete || running || Boolean(chance);
}

function renderChance() {
  const panel = el("chance-panel");
  panel.hidden = !chance;
  if (!chance) return;
  const { ids, waits, outcome } = chance;
  panel.dataset.outcome = outcome?.kind ?? "watching";
  el("chance-title").textContent = outcome?.title ?? "役満チャンス";
  el("chance-action").textContent = outcome ? "OK" : "次へ";
  el("chance-note").textContent = outcome?.message ?? ([...ids].some((id) => waits.has(id)) ? "「次へ」で手番を1手進めます。" : "現在はテンパイを外れています。「次へ」で対局を続けます。");
  el("chance-waits").replaceChildren(...[...(outcome?.achieved ?? ids)].map((id) => {
    const item = node("li");
    item.append(node("strong", "", goalById.get(id).name));
    if (!outcome) {
      const tiles = waits.get(id);
      if (tiles?.length) {
        const waiting = node("span", "tiles");
        waiting.append(...tiles.map((tile) => tileElement(tile)));
        item.append(waiting);
      } else item.append(node("span", "subtle", "待ちなし"));
    }
    return item;
  }));
}

function renderStrategyNote() {
  const note = el("strategy-note");
  note.hidden = storageOk;
  note.textContent = "このブラウザーでは保存できません。";
}

function updateThresholdSummary(row, id, definition) {
  const values = definition.fields.map(({ id: key, unit }) => `${data.strategy.thresholds[id][key]}${unit}`);
  row.querySelector(".threshold-values").textContent = values.join(definition.any ? " または " : " かつ ");
}

function renderTargets() {
  el("targets").replaceChildren(...Mahjong.goals.map(({ id, name, mark, detail }) => {
    const definition = YakumanStrategy.conditions.get(id);
    const row = node("li", definition ? "target" : "target automatic");
    row.dataset.id = id;
    const label = node(definition ? "label" : "div", "target-label");
    if (definition) {
      const input = node("input");
      input.type = "checkbox";
      input.dataset.action = "check";
      label.append(input);
    }
    const title = node("span", "target-title", name);
    title.title = detail;
    title.append(node("small", "collection-status"));
    const tile = tileElement(mark);
    tile.removeAttribute("role");
    tile.removeAttribute("aria-label");
    tile.removeAttribute("title");
    tile.setAttribute("aria-hidden", "true");
    label.append(tile, title);
    if (definition) {
      const heading = node("div", "target-heading");
      const rank = node("select", "target-rank");
      rank.dataset.action = "rank";
      rank.setAttribute("aria-label", `${name}の優先順位`);
      rank.append(...YakumanStrategy.targetIds.map((_, index) => {
        const option = node("option", "", `${index + 1}位`);
        option.value = index;
        return option;
      }));
      heading.append(label, rank);
      row.append(heading);
      const details = node("details", "threshold-options");
      details.open = id === "kokushi";
      const summary = node("summary");
      summary.append(node("span", "", "開始条件"), node("span", "threshold-values"));
      const inputs = node("div", "threshold-inputs");
      const instruction = definition.any ? "いずれかを満たす" : definition.sameSuit ? "筒子か索子の同じ色ですべて満たす" : "すべて満たす";
      inputs.append(node("p", "subtle", instruction));
      for (const { id: key, label: caption, unit, max } of definition.fields) {
        const field = node("label", "threshold-field");
        const number = node("input");
        number.type = "number";
        number.min = "0";
        number.max = max;
        number.step = "1";
        number.value = data.strategy.thresholds[id][key];
        number.dataset.threshold = key;
        number.setAttribute("aria-label", `${name}の${caption}（${unit}以上）`);
        field.append(node("span", "", caption), number, node("span", "", `${unit}以上`));
        inputs.append(field);
      }
      details.append(summary, inputs);
      row.append(details);
      updateThresholdSummary(row, id, definition);
    } else {
      row.append(label, node("span", "subtle automatic-goal", id === "tenhou" ? "配牌で自動判定" : "初ツモで自動判定"));
    }
    return row;
  }));
  orderTargets();
  updateTargets();
}

function orderTargets() {
  const list = el("targets");
  const rows = new Map([...list.children].map((row) => [row.dataset.id, row]));
  const focus = document.activeElement;
  data.strategy.order.forEach((id, index) => {
    const row = rows.get(id);
    if (list.children[index] !== row) list.insertBefore(row, list.children[index]);
    row.querySelector('[data-action="rank"]').value = index;
  });
  if (list.contains(focus)) focus.focus({ preventScroll: true });
}

function updateTargets() {
  const selected = data.strategy.targets;
  for (const row of el("targets").children) {
    const { id } = row.dataset;
    const input = row.querySelector('[data-action="check"]');
    if (input) input.checked = selected.includes(id);
    const found = data.run.collected[id];
    row.dataset.collected = Boolean(found);
    const status = row.querySelector(".collection-status");
    status.hidden = !found;
    if (found) status.textContent = `第${format.format(found.round)}局で収集`;
  }
  el("select-all").disabled = selected.length === YakumanStrategy.targetIds.length;
  el("table-mode").textContent = `現在の卓 · ${modeName[data.mode]}`;
  renderStrategyNote();
}

function renderHistory() {
  const list = el("history-list");
  list.replaceChildren(...data.run.log.map((entry) => {
    const row = node("li");
    row.append(node("span", "subtle", `第${format.format(entry.round)}局`), node("span", "", entry.summary));
    if (entry.newGoals.length) row.append(node("strong", "unlock", `新規 +${entry.newGoals.length}`));
    return row;
  }));
  el("empty-history").hidden = data.run.log.length > 0;
}

function stop() {
  clearTimeout(timer);
  timer = null;
  scheduleId++;
  running = false;
  stopAt = Infinity;
  renderControls();
}

function finishRound() {
  const { winner, tile, source, score, gain, tenpai, tableAfter, skipped } = round.result;
  const run = data.run;
  run.count++;
  const newGoals = [];
  const yaku = score?.yakuman.length ? score.yakuman.map((id) => goalById.get(id).name).join("・") : score?.yaku.filter(([name]) => name !== "ドラ").map(([name]) => name).join("・");
  if (winner === 0) {
    for (const id of score.yakuman) {
      if (Object.hasOwn(run.collected, id)) continue;
      run.collected[id] = { round: run.count };
      newGoals.push(id);
    }
  }
  const summary = skipped ? "スキップ · 未収集の役満が成立不能" : winner === null ? `流局 · ${tenpai.length}人テンパイ` : `${Sanma.names[winner]} ${source === null ? "ツモ" : "ロン"} · ${yaku} · +${format.format(gain)}点`;
  recentSummary = winner === null ? summary : `${summary} · 和了牌 ${Mahjong.tileName(tile)}`;
  run.table = tableAfter;
  run.log.unshift({ round: run.count, summary, newGoals });
  run.log.length = Math.min(run.log.length, 12);
  if (completed() && (!data.best[data.mode] || run.count < data.best[data.mode])) data.best[data.mode] = run.count;
  if (newGoals.length) updateTargets();
}

function paint() {
  updateMetrics();
  renderTable();
  renderHistory();
  renderControls();
  renderChance();
  lastPaint = performance.now();
}

function chooseNewChances(waits) {
  const fresh = [...waits.keys()].filter((id) => !seenChances.has(id));
  for (const id of fresh) seenChances.add(id);
  return fresh;
}

function beginChance() {
  const waits = Sanma.yakumanChances(round);
  const ids = chooseNewChances(waits);
  if (!ids.length) return false;
  chance = { ids: new Set(ids), waits, outcome: null };
  return true;
}

function advanceRound(autoSkip) {
  if (!autoSkip || !Sanma.skipIfImpossible(round)) Sanma.step(round);
  if (!round.result) return false;
  finishRound();
  return true;
}

function nextChanceTurn() {
  if (advanceRound(false)) {
    const { winner, score, source, tile } = round.result;
    const achieved = winner === 0 ? score.yakuman.filter((id) => round.missing.includes(id)) : [];
    chance.outcome = achieved.length
      ? { kind: "achieved", title: "役満達成", message: `${source === null ? "ツモ" : "ロン"} · 和了牌 ${Mahjong.tileName(tile)}`, achieved }
      : { kind: "missed", title: "役満不成立", message: winner === null ? "流局でこの局が終わりました。" : `${Sanma.names[winner]} が和了し、この局が終わりました。` };
    save();
  } else {
    chance.waits = Sanma.yakumanChances(round);
    for (const id of chooseNewChances(chance.waits)) chance.ids.add(id);
    if (!Sanma.canAchieveAny(round, [...chance.ids])) {
      chance.outcome = { kind: "missed", title: "役満成立不能", message: "残っている牌や手番から、この局での成立が不可能になりました。" };
    }
  }
  paint();
}

function resumeAfterChance() {
  chance = null;
  if (completed() || data.run.count >= stopAt) stop();
  paint();
  if (running) timer = setTimeout(tick, 0);
}

function tick() {
  if (!running || chance) return;
  const speed = el("speed").value;
  const end = performance.now() + 16;
  let finished = false;
  const startingCount = data.run.count;
  do {
    if (!round || round.result) {
      const strategy = { ...data.strategy, targets: [...data.strategy.targets] };
      const table = { ...data.run.table, points: [...data.run.table.points] };
      round = Sanma.start(table, data.mode, strategy, data.run.collected);
      seenChances.clear();
    }
    if (data.highlightChance && beginChance()) {
      if (data.run.count !== startingCount) save();
      paint();
      el("chance-action").focus();
      return;
    }
    finished = advanceRound(data.skipImpossible);
    if (finished && (completed() || data.run.count >= stopAt)) {
      save();
      stop();
      paint();
      return;
    }
  } while (speed === "batch" && performance.now() < end);

  if (data.run.count !== startingCount) save();
  if (speed !== "batch" || performance.now() - lastPaint > 125) paint();
  if (speed === "batch") batchChannel.port2.postMessage(scheduleId);
  else timer = setTimeout(tick, speed === "watch" ? (finished ? 1450 : 440) : (finished ? 200 : 20));
}

function play(singleRound) {
  if (completed() || running) return;
  running = true;
  stopAt = singleRound ? data.run.count + 1 : Infinity;
  renderControls();
  timer = setTimeout(tick, 0);
}

el("play-button").addEventListener("click", () => {
  if (running) {
    stop();
    paint();
  } else play(false);
});
el("one-round").addEventListener("click", () => play(true));
el("chance-action").addEventListener("click", () => {
  if (!chance) return;
  if (chance.outcome) {
    resumeAfterChance();
    if (!el("play-button").disabled) el("play-button").focus({ preventScroll: true });
  } else nextChanceTurn();
});
el("help-button").addEventListener("click", () => el("help-dialog").showModal());
el("reset-button").addEventListener("click", () => {
  if (running && !chance) {
    stop();
    paint();
  }
  el("new-mode").value = data.mode;
  el("reset-dialog").returnValue = "cancel";
  el("reset-dialog").showModal();
});
el("reset-dialog").addEventListener("close", (event) => {
  if (event.target.returnValue !== "reset") return;
  stop();
  chance = null;
  data.mode = el("new-mode").value;
  data.run = freshRun();
  round = null;
  recentSummary = "";
  save();
  updateTargets();
  paint();
});

for (const id of selectFields) {
  el(id).value = data.strategy[id];
  el(id).addEventListener("change", (event) => {
    data.strategy[id] = event.target.value;
    save();
  });
}
el("skip").checked = data.strategy.skip;
el("skip").addEventListener("change", (event) => {
  data.strategy.skip = event.target.checked;
  save();
  renderStrategyNote();
});
el("skip-impossible").checked = data.skipImpossible;
el("skip-impossible").addEventListener("change", (event) => {
  data.skipImpossible = event.target.checked;
  save();
});
el("highlight-chance").checked = data.highlightChance;
el("highlight-chance").addEventListener("change", (event) => {
  data.highlightChance = event.target.checked;
  save();
  if (!data.highlightChance && chance) resumeAfterChance();
});
el("targets").addEventListener("change", (event) => {
  const input = event.target;
  const row = input.closest(".target");
  const id = row?.dataset.id;
  if (!YakumanStrategy.conditions.has(id)) return;
  if (input.dataset.action === "rank") {
    const order = data.strategy.order;
    order.splice(order.indexOf(id), 1);
    order.splice(Number(input.value), 0, id);
    orderTargets();
  } else if (input.dataset.action === "check") {
    if (input.checked && !data.strategy.targets.includes(id)) data.strategy.targets.push(id);
    if (!input.checked) data.strategy.targets = data.strategy.targets.filter((goal) => goal !== id);
    updateTargets();
  } else {
    const definition = YakumanStrategy.conditions.get(id);
    const field = definition.fields.find(({ id: key }) => key === input.dataset.threshold);
    if (!field) return;
    const values = data.strategy.thresholds[id];
    if (Number.isFinite(input.valueAsNumber)) values[field.id] = Math.min(field.max, Math.max(0, Math.trunc(input.valueAsNumber)));
    input.value = values[field.id];
    updateThresholdSummary(row, id, definition);
  }
  save();
});
el("select-all").addEventListener("click", () => {
  data.strategy.targets = [...YakumanStrategy.targetIds];
  save();
  updateTargets();
});

el("goal-count").textContent = Mahjong.goals.length;
el("help-goals").append(...Mahjong.goals.flatMap((goal) => [node("dt", "", goal.name), node("dd", "", goal.detail)]));
renderTargets();
paint();
