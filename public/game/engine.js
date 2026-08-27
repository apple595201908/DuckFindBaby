(function attachDuckEngine(global) {
  "use strict";

  // Reference colors sampled from IMG_7163–IMG_7169. These values are shared by
  // the deterministic sprite generator and the UI, so the visual answer and
  // game logic always use the same locked hexadecimal color.
  const PALETTE = Object.freeze([
    { id: 0, key: "yellow", name: "黃", mark: "●", hex: "#FDEC3D", ring: "#C4A900", x: 0, y: 0 },
    { id: 1, key: "red", name: "紅", mark: "♥", hex: "#FC3E3E", ring: "#B91F2F", x: 1, y: 0 },
    { id: 2, key: "blue", name: "藍", mark: "▲", hex: "#0043F8", ring: "#062DA8", x: 2, y: 0 },
    { id: 3, key: "green", name: "綠", mark: "◆", hex: "#3BD36F", ring: "#138F46", x: 3, y: 0 },
    { id: 4, key: "purple", name: "紫", mark: "✦", hex: "#9B45F5", ring: "#6522AE", x: 0, y: 1 },
    { id: 5, key: "orange", name: "橙", mark: "★", hex: "#FFA13F", ring: "#C86600", x: 1, y: 1 },
    { id: 6, key: "white", name: "白", mark: "○", hex: "#FFFFFF", ring: "#96A8C4", x: 2, y: 1 },
    { id: 7, key: "light-blue", name: "淺藍", mark: "⬟", hex: "#3BEEFF", ring: "#008FAF", x: 3, y: 1 },
    { id: 8, key: "magenta", name: "紫紅", mark: "⬢", hex: "#FD3D93", ring: "#B51B69", x: 0, y: 2 },
    { id: 9, key: "light-yellow", name: "淺黃", mark: "☀", hex: "#FFF890", ring: "#B9A900", x: 1, y: 2 },
    { id: 10, key: "pale-green", name: "粉綠", mark: "⬣", hex: "#B7FE94", ring: "#4A9B35", x: 2, y: 2 },
    { id: 11, key: "medium-light-blue", name: "稍深的淺藍", mark: "⬡", hex: "#3EA0FB", ring: "#1266B4", x: 3, y: 2 },
    { id: 12, key: "indigo", name: "靛色", mark: "✶", hex: "#7B3EFE", ring: "#4820A8", x: 0, y: 3 },
    { id: 13, key: "pink-magenta", name: "粉紫紅", mark: "✿", hex: "#FA70BE", ring: "#B72F7C", x: 1, y: 3 },
  ]);

  // The seven reference-image recipes come first, followed by the five
  // original same-color / primary-color recipes already present in the game.
  const RECIPES = Object.freeze([
    Object.freeze({ first: 5, second: 5, target: 5 }),
    Object.freeze({ first: 1, second: 0, target: 5 }),
    Object.freeze({ first: 0, second: 6, target: 9 }),
    Object.freeze({ first: 0, second: 7, target: 10 }),
    Object.freeze({ first: 7, second: 2, target: 11 }),
    Object.freeze({ first: 8, second: 2, target: 12 }),
    Object.freeze({ first: 8, second: 6, target: 13 }),
    Object.freeze({ first: 0, second: 0, target: 0 }),
    Object.freeze({ first: 1, second: 1, target: 1 }),
    Object.freeze({ first: 2, second: 2, target: 2 }),
    Object.freeze({ first: 0, second: 2, target: 3 }),
    Object.freeze({ first: 1, second: 2, target: 4 }),
  ]);

  const BASE_COLORS = Object.freeze([0, 1, 2, 5, 6, 7, 8]);
  // Pairs that are too close for a fair, fast answer choice. The target and
  // every decoy are checked against this list, as are decoys against each
  // other, so a round never asks the player to distinguish near-neighbours.
  const SIMILAR_COLOR_PAIRS = Object.freeze([
    Object.freeze([0, 9]),
    Object.freeze([6, 9]),
    Object.freeze([3, 10]),
    Object.freeze([2, 7]),
    Object.freeze([2, 11]),
    Object.freeze([7, 11]),
    Object.freeze([2, 12]),
    Object.freeze([7, 12]),
    Object.freeze([11, 12]),
    Object.freeze([4, 8]),
    Object.freeze([4, 12]),
    Object.freeze([4, 13]),
    Object.freeze([8, 12]),
    Object.freeze([8, 13]),
    Object.freeze([12, 13]),
  ]);
  // Cross-file timing contract: these values mirror @keyframes gene-jump in
  // game.css. If the visual apex changes, update this model and its tests so
  // the awarded band still matches the duck's visible height.
  const RISE_RATIO = 0.14;
  const DESCENT_POWER = 1.45;
  const SIMILAR_COLOR_KEYS = new Set(
    SIMILAR_COLOR_PAIRS.map(([first, second]) =>
      [first, second].sort((a, b) => a - b).join("-"),
    ),
  );
  const MIX_TABLE = Object.freeze(
    Object.fromEntries(
      RECIPES.map(({ first, second, target }) => [
        [first, second].sort((a, b) => a - b).join("-"),
        target,
      ]),
    ),
  );

  function mixColors(first, second) {
    const key = [Number(first), Number(second)].sort((a, b) => a - b).join("-");
    if (!(key in MIX_TABLE)) throw new RangeError("Unsupported parent color pair");
    return MIX_TABLE[key];
  }

  function areColorsTooSimilar(first, second) {
    const firstId = Number(first);
    const secondId = Number(second);
    if (firstId === secondId) return false;
    return SIMILAR_COLOR_KEYS.has([firstId, secondId].sort((a, b) => a - b).join("-"));
  }

  function getRoundDuration(score) {
    const safeScore = Math.max(0, Number(score) || 0);
    // Continuous acceleration avoids sudden difficulty jumps; 1.6 seconds is
    // the tested reaction-time floor for the fastest repeat-play segment.
    return Math.max(1600, Math.round(3800 - safeScore * 6.5));
  }

  function getCandidateCount(round) {
    const safeRound = Math.max(1, Number(round) || 1);
    // Add one visual-search target every four rounds and stop at the six slots
    // supported by both the portrait and landscape layouts.
    return Math.min(6, 3 + Math.floor((safeRound - 1) / 4));
  }

  function shuffle(values, random) {
    const output = values.slice();
    const rng = typeof random === "function" ? random : Math.random;
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
  }

  function createRound(round, score, random) {
    const rng = typeof random === "function" ? random : Math.random;
    const recipe = RECIPES[Math.floor(rng() * RECIPES.length)];
    const reverse = recipe.first !== recipe.second && rng() >= 0.5;
    const first = reverse ? recipe.second : recipe.first;
    const second = reverse ? recipe.first : recipe.second;
    const target = recipe.target;
    const count = getCandidateCount(round);
    const selected = [target];
    const decoys = shuffle(PALETTE.map((color) => color.id).filter((id) => id !== target), rng);
    // Fairness is pairwise: each decoy must differ clearly from the target and
    // every selected decoy, rather than merely avoiding exact duplicates.
    for (const colorId of decoys) {
      if (selected.every((selectedId) => !areColorsTooSimilar(selectedId, colorId))) {
        selected.push(colorId);
      }
      if (selected.length === count) break;
    }
    if (selected.length !== count) throw new Error("Not enough distinct candidate colors");
    const candidates = shuffle(selected, rng);
    return Object.freeze({
      first,
      second,
      target,
      candidates,
      duration: getRoundDuration(score),
    });
  }

  function getDescentPosition(duration, remaining) {
    const safeDuration = Math.max(1, Number(duration) || 1);
    const safeRemaining = Math.max(0, Math.min(safeDuration, Number(remaining) || 0));
    const elapsedRatio = 1 - safeRemaining / safeDuration;
    // No points are lost on the short rise. After the apex, the same eased
    // descent model as CSS maps elapsed time to the duck's visible position.
    if (elapsedRatio <= RISE_RATIO) return 0;
    const descentTime = Math.min(1, (elapsedRatio - RISE_RATIO) / (1 - RISE_RATIO));
    return Math.pow(descentTime, DESCENT_POWER);
  }

  function calculateScore(duration, remaining) {
    const descentPosition = getDescentPosition(duration, remaining);
    // Ten equal descent bands award 10 down to 1. Clamping prevents the exact
    // endpoint from accidentally producing a zero-point answer.
    const band = Math.min(9, Math.floor(descentPosition * 10));
    return 10 - band;
  }

  global.DuckEngine = Object.freeze({
    PALETTE,
    BASE_COLORS,
    RECIPES,
    SIMILAR_COLOR_PAIRS,
    RISE_RATIO,
    DESCENT_POWER,
    mixColors,
    areColorsTooSimilar,
    getRoundDuration,
    getCandidateCount,
    createRound,
    getDescentPosition,
    calculateScore,
  });
})(globalThis);
