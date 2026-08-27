import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "public/game/engine.js"), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context, { filename: "engine.js" });
const Engine = context.globalThis.DuckEngine;

const referenceRecipes = [
  [5, 5, 5],
  [1, 0, 5],
  [0, 6, 9],
  [0, 7, 10],
  [7, 2, 11],
  [8, 2, 12],
  [8, 6, 13],
];

test("all twelve gene recipes are deterministic and order-independent", () => {
  assert.equal(Engine.RECIPES.length, 12);
  for (const { first, second, target } of Engine.RECIPES) {
    assert.equal(Engine.mixColors(first, second), target);
    assert.equal(Engine.mixColors(second, first), target);
  }
  for (const [first, second, target] of referenceRecipes) {
    assert.equal(Engine.mixColors(first, second), target);
  }
  assert.throws(() => Engine.mixColors(6, 6), { name: "RangeError" });
});

test("reference-image palette keeps all fourteen locked hexadecimal colors", () => {
  assert.deepEqual(
    Array.from(Engine.PALETTE, ({ key, name, hex }) => ({ key, name, hex })),
    [
      { key: "yellow", name: "黃", hex: "#FDEC3D" },
      { key: "red", name: "紅", hex: "#FC3E3E" },
      { key: "blue", name: "藍", hex: "#0043F8" },
      { key: "green", name: "綠", hex: "#3BD36F" },
      { key: "purple", name: "紫", hex: "#9B45F5" },
      { key: "orange", name: "橙", hex: "#FFA13F" },
      { key: "white", name: "白", hex: "#FFFFFF" },
      { key: "light-blue", name: "淺藍", hex: "#3BEEFF" },
      { key: "magenta", name: "紫紅", hex: "#FD3D93" },
      { key: "light-yellow", name: "淺黃", hex: "#FFF890" },
      { key: "pale-green", name: "粉綠", hex: "#B7FE94" },
      { key: "medium-light-blue", name: "稍深的淺藍", hex: "#3EA0FB" },
      { key: "indigo", name: "靛色", hex: "#7B3EFE" },
      { key: "pink-magenta", name: "粉紫紅", hex: "#FA70BE" },
    ],
  );
});

test("round creation uses one answer and excludes every similar-color pair", () => {
  const values = [0.01, 0.41, 0.82, 0.18, 0.73, 0.52, 0.95, 0.27];
  let cursor = 0;
  const rng = () => values[cursor++ % values.length];
  for (let round = 1; round <= 48; round += 1) {
    const result = Engine.createRound(round, round * 5, rng);
    assert.equal(Engine.mixColors(result.first, result.second), result.target);
    assert.equal(result.candidates.filter((value) => value === result.target).length, 1);
    assert.equal(new Set(result.candidates).size, result.candidates.length);
    assert.equal(result.candidates.length, Engine.getCandidateCount(round));
    for (let first = 0; first < result.candidates.length; first += 1) {
      for (let second = first + 1; second < result.candidates.length; second += 1) {
        assert.equal(
          Engine.areColorsTooSimilar(result.candidates[first], result.candidates[second]),
          false,
        );
      }
    }
  }
  assert.equal(Engine.areColorsTooSimilar(8, 13), true);
  assert.equal(Engine.areColorsTooSimilar(4, 8), true);
  assert.equal(Engine.areColorsTooSimilar(7, 11), true);
  assert.equal(Engine.areColorsTooSimilar(2, 7), true);
  assert.equal(Engine.areColorsTooSimilar(0, 1), false);
});

test("jump duration accelerates smoothly by score within replayable limits", () => {
  assert.equal(Engine.getCandidateCount(1), 3);
  assert.equal(Engine.getCandidateCount(5), 4);
  assert.equal(Engine.getCandidateCount(9), 5);
  assert.equal(Engine.getCandidateCount(13), 6);
  assert.equal(Engine.getCandidateCount(100), 6);
  assert.equal(Engine.getRoundDuration(0), 3800);
  assert.equal(Engine.getRoundDuration(50), 3475);
  assert.equal(Engine.getRoundDuration(100), 3150);
  assert.equal(Engine.getRoundDuration(200), 2500);
  assert.equal(Engine.getRoundDuration(300), 1850);
  assert.equal(Engine.getRoundDuration(1000), 1600);
});

test("duck descent is divided into exact score bands from ten to one", () => {
  const duration = 5000;
  assert.equal(Engine.calculateScore(duration, duration), 10);
  for (let expected = 10; expected >= 1; expected -= 1) {
    const band = 10 - expected;
    const position = (band + 0.5) / 10;
    const descentTime = Math.pow(position, 1 / Engine.DESCENT_POWER);
    const elapsedRatio = Engine.RISE_RATIO + (1 - Engine.RISE_RATIO) * descentTime;
    const remaining = duration * (1 - elapsedRatio);
    assert.equal(Engine.calculateScore(duration, remaining), expected);
  }
  assert.equal(Engine.calculateScore(duration, 0), 1);
});

test("offline gene-lab assets and reproducible palette generator exist", () => {
  const required = [
    "public/game/index.html",
    "public/game/game.css",
    "public/game/engine.js",
    "public/game/game.js",
    "public/game/manifest.webmanifest",
    "public/game/sw.js",
    "public/game/assets/duck-gene-palette-sheet.png",
    "public/game/assets/duck-mascot-yellow.png",
    "public/game/assets/dna-helix-ambient.png",
    "scripts/generate_gene_palette_sprites.sh",
  ];
  for (const file of required) assert.ok(fs.statSync(path.join(root, file)).size > 0, file);
  assert.ok(
    fs.statSync(path.join(root, "public/game/assets/duck-gene-palette-sheet.png")).size > 500_000,
  );
  assert.ok(fs.statSync(path.join(root, "public/game/assets/duck-mascot-yellow.png")).size > 50_000);
  assert.ok(fs.statSync(path.join(root, "public/game/assets/dna-helix-ambient.png")).size > 500_000);

  const generator = fs.readFileSync(path.join(root, required.at(-1)), "utf8");
  for (const { hex } of Engine.PALETTE) assert.match(generator, new RegExp(hex));
  assert.match(generator, /channel RGBA -evaluate set 0/);
  assert.match(generator, /Palette corner is not fully transparent/);
});

test("mobile renderer uses the duck jump itself as the synchronized round clock", () => {
  const css = fs.readFileSync(path.join(root, "public/game/game.css"), "utf8");
  const game = fs.readFileSync(path.join(root, "public/game/game.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public/game/index.html"), "utf8");
  const manifest = fs.readFileSync(path.join(root, "public/game/manifest.webmanifest"), "utf8");

  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /filter:\s*drop-shadow/);
  assert.doesNotMatch(game, /offsetWidth|setTimerProgress|timerFill/);
  assert.doesNotMatch(html, /timer-track|timerFill|progressbar/);
  assert.match(game, /--jump-ms/);
  assert.match(game, /BGM_MELODY/);
  assert.match(game, /function scheduleBgm/);
  assert.match(game, /function startJumpWindow/);
  assert.match(game, /function renderPreparedRound/);
  assert.match(game, /function prepareRound/);
  assert.match(game, /function launchPreparedRound/);
  assert.match(css, /\.animate-wave \.candidate-duck/);
  assert.match(css, /@keyframes gene-jump/);
  assert.match(game, /className = "candidate-viewport"/);
  assert.match(game, /className = "feedback-badge"/);
  assert.match(game, /textContent = "✓"/);
  assert.match(game, /textContent = "×"/);
  assert.match(css, /\.candidate\.correct \.feedback-badge/);
  assert.match(css, /\.candidate\.wrong \.feedback-badge/);
  assert.match(css, /\.round-correct \.round-prompt/);
  assert.match(css, /\.round-wrong \.round-prompt/);
  assert.match(css, /\.candidate-viewport[\s\S]*overflow: hidden/);
  assert.match(css, /\.candidate::after[\s\S]*bottom: 2\.5%/);
  assert.match(css, /\.candidate \{[\s\S]*overflow: hidden/);
  assert.match(css, /translate3d\(0, 138%, 0\)/);
  assert.match(css, /translate3d\(0, 142%, 0\)/);
  assert.match(css, /background-position: var\(--sprite-x-pos/);
  assert.match(css, /duck-gene-palette-sheet\.png\?v=duck-gene-lab-r10/);
  assert.doesNotMatch(css, /background-position:[^;]*calc\([^;]*\*/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) clamp\(48px, 14vw, 76px\) minmax\(0, 1fr\)/);
  assert.match(game, /elements\.grid\.addEventListener\([\s\S]*"pointerdown"/);
  assert.match(game, /\{ passive: true \}/);
  assert.match(css, /@media \(orientation: portrait\)/);
  assert.match(css, /@media \(orientation: landscape\)/);
  assert.match(css, /data-candidates="6"/);
  assert.match(html, /鴨鴨基因實驗室/);
  assert.match(html, /<img class="title-mascot"[^>]+duck-mascot-yellow\.png/);
  assert.match(html, /class="dna-ambient"/);
  assert.match(html, /dna-helix-ambient\.png/);
  assert.match(css, /@keyframes dna-drift/);
  assert.match(css, /\.dna-ambient img[\s\S]*opacity: 0\.34/);
  assert.match(css, /width: min\(118vmax, 1780px\)/);
  assert.match(css, /@keyframes dna-aura/);
  assert.match(css, /rgba\(39, 235, 255, 0\.46\)/);
  assert.match(css, /rgba\(255, 80, 224, 0\.38\)/);
  assert.doesNotMatch(css, /duck-gene-lab-bg\.webp/);
  assert.doesNotMatch(html, /heart-bubble|♥/);
  assert.doesNotMatch(css, /heart-bubble|heart-float/);
  assert.doesNotMatch(html, /class="duck-sprite title-duck/);
  assert.match(html, /class="menu-content"/);
  assert.match(css, /grid-template-columns: minmax\(220px, 0\.78fr\) minmax\(0, 1\.22fr\)/);
  assert.match(game, /Engine\.createRound\(state\.round, state\.score\)/);
  assert.match(game, /124 \+ state\.score \* 0\.08/);
  assert.match(html, /橙＋橙＝橙/);
  assert.doesNotMatch(html, /rotateOverlay|請旋轉裝置|Xiaomi Pad Mini/);
  assert.match(manifest, /"orientation":\s*"any"/);
  assert.match(html, /duck-gene-palette-sheet\.png\?v=duck-gene-lab-r10/);
  assert.doesNotMatch(html, /duck-gene-lab-bg\.webp/);

  const countdownBlock = game.match(
    /function runCountdown\(token\) \{([\s\S]*?)\n  \}\n\n  function startGame/,
  )?.[1];
  const startBlock = game.match(
    /function startGame\(\) \{([\s\S]*?)\n  \}\n\n  function makeCandidate/,
  )?.[1];
  const laterRoundBlock = game.match(
    /function beginRound\(\) \{([\s\S]*?)\n  \}\n\n  function chooseCandidate/,
  )?.[1];
  assert.ok(countdownBlock);
  assert.ok(startBlock);
  assert.ok(laterRoundBlock);
  assert.match(countdownBlock, /state\.phase = "playing";\s+launchPreparedRound\(\)/);
  assert.doesNotMatch(countdownBlock, /beginRound\(\)/);
  assert.ok(startBlock.indexOf("prepareRound();") < startBlock.indexOf("runCountdown(token);"));
  assert.match(laterRoundBlock, /prepareRound\(\);\s+launchPreparedRound\(\);/);
});
