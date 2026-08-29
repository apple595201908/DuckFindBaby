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

function hexChannels(hex) {
  return hex.match(/[0-9a-f]{2}/gi).map((channel) => Number.parseInt(channel, 16));
}

function rgbDistance(first, second) {
  const firstChannels = hexChannels(first);
  const secondChannels = hexChannels(second);
  return Math.hypot(...firstChannels.map((channel, index) => channel - secondChannels[index]));
}

function hexSaturation(hex) {
  const channels = hexChannels(hex).map((channel) => channel / 255);
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  return maximum === 0 ? 0 : (maximum - minimum) / maximum;
}

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
      { key: "indigo", name: "靛色", hex: "#2D219F" },
      { key: "pink-magenta", name: "粉紫紅", hex: "#FF96D0" },
    ],
  );
});

test("locked colors stay saturated and visibly separated", () => {
  const vividIds = [0, 1, 2, 3, 4, 5, 7, 8, 11, 12];
  const paleIds = [9, 10, 13];
  for (const id of vividIds) {
    assert.ok(hexSaturation(Engine.PALETTE[id].hex) >= 0.7, Engine.PALETTE[id].name);
  }
  for (const id of paleIds) {
    assert.ok(hexSaturation(Engine.PALETTE[id].hex) >= 0.4, Engine.PALETTE[id].name);
  }
  for (let first = 0; first < Engine.PALETTE.length; first += 1) {
    for (let second = first + 1; second < Engine.PALETTE.length; second += 1) {
      assert.ok(
        rgbDistance(Engine.PALETTE[first].hex, Engine.PALETTE[second].hex) >= 65,
        `${Engine.PALETTE[first].name}/${Engine.PALETTE[second].name}`,
      );
    }
  }
  assert.ok(rgbDistance(Engine.PALETTE[4].hex, Engine.PALETTE[12].hex) >= 140);
  assert.ok(rgbDistance(Engine.PALETTE[2].hex, Engine.PALETTE[12].hex) >= 100);
  assert.ok(rgbDistance(Engine.PALETTE[8].hex, Engine.PALETTE[13].hex) >= 100);
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
  assert.equal(Engine.areColorsTooSimilar(1, 8), true);
  assert.equal(Engine.areColorsTooSimilar(7, 11), true);
  assert.equal(Engine.areColorsTooSimilar(2, 7), true);
  assert.equal(Engine.areColorsTooSimilar(0, 9), true);
  assert.equal(Engine.areColorsTooSimilar(3, 10), true);
  assert.equal(Engine.areColorsTooSimilar(0, 1), false);
});

test("a long replay session keeps every generated round valid", () => {
  let seed = 0x5f3759df;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let round = 1; round <= 10_000; round += 1) {
    const score = Math.min(2000, round * 3);
    const result = Engine.createRound(round, score, rng);
    assert.equal(result.candidates.filter((color) => color === result.target).length, 1);
    assert.equal(new Set(result.candidates).size, result.candidates.length);
    assert.equal(Engine.getRoundDuration(score) >= 1600, true);
    for (let first = 0; first < result.candidates.length; first += 1) {
      for (let second = first + 1; second < result.candidates.length; second += 1) {
        assert.equal(
          Engine.areColorsTooSimilar(result.candidates[first], result.candidates[second]),
          false,
        );
      }
    }
  }
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
    "public/game/assets/gene-lab-night-bg.webp",
    "scripts/generate_gene_palette_sprites.sh",
  ];
  for (const file of required) assert.ok(fs.statSync(path.join(root, file)).size > 0, file);
  assert.ok(
    fs.statSync(path.join(root, "public/game/assets/duck-gene-palette-sheet.png")).size > 500_000,
  );
  assert.ok(fs.statSync(path.join(root, "public/game/assets/duck-mascot-yellow.png")).size > 50_000);
  assert.ok(fs.statSync(path.join(root, "public/game/assets/gene-lab-night-bg.webp")).size > 50_000);

  const generator = fs.readFileSync(path.join(root, required.at(-1)), "utf8");
  for (const { hex } of Engine.PALETTE) assert.match(generator, new RegExp(hex));
  assert.match(generator, /channel RGBA -evaluate set 0/);
  assert.match(generator, /master-value\.png/);
  assert.match(generator, /target-hue\.png/);
  assert.match(generator, /target-saturation\.png/);
  assert.match(generator, /dark_expression=/);
  assert.match(generator, /orange_expression=/);
  assert.match(generator, /pink_expression=/);
  assert.match(generator, /cream_expression=/);
  assert.doesNotMatch(generator, /index <= 6/);
  assert.doesNotMatch(generator, /color-layer/);
  assert.match(generator, /region 96x72\+0\+0/);
  assert.doesNotMatch(generator, /Dilate Disk:6/);
  assert.match(generator, /Palette corner is not fully transparent/);
  assert.match(generator, /Beak protection failed/);
  assert.match(generator, /connected-components:area-threshold=1000/);
  assert.match(generator, /main connected sprite/);
  assert.match(generator, /outline_color='#2B2632'/);
  assert.match(generator, /outline_radius='4'/);
  assert.match(generator, /outline_opacity='0\.94'/);
  assert.match(generator, /outline_scale='4'/);
  assert.match(generator, /outline_blur='1\.2'/);
  assert.match(generator, /-filter Lanczos/);
  assert.match(generator, /-morphology Dilate "Disk:\$\{outline_disk\}"/);
  assert.match(generator, /transparent corners stay transparent/);
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
  assert.match(game, /MAX_BGM_NOTES_PER_TICK = 8/);
  assert.match(game, /state\.bgmNextNote < now - 0\.1/);
  assert.match(game, /scheduledNotes < MAX_BGM_NOTES_PER_TICK/);
  assert.match(game, /oscillator\.disconnect\(\)/);
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
  assert.match(css, /duck-gene-palette-sheet\.png\?v=duck-gene-lab-r23/);
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
  assert.match(html, /gene-lab-night-bg\.webp/);
  assert.match(html, /theme-color" content="#070b25"/);
  assert.match(css, /@keyframes dna-drift/);
  assert.match(css, /\.dna-ambient img[\s\S]*opacity: 0\.94/);
  assert.match(css, /object-fit: cover/);
  assert.doesNotMatch(css, /@keyframes dna-aura/);
  const dnaImageBlock = css.match(/\.dna-ambient img \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(dnaImageBlock);
  assert.doesNotMatch(dnaImageBlock, /will-change/);
  assert.match(css, /--candy-sky: #8fd8ff/);
  assert.match(css, /--candy-mint: #93e2c2/);
  assert.match(css, /--candy-lemon: #ffe278/);
  assert.match(css, /--candy-coral: #ff9fb7/);
  assert.match(css, /--candy-grape: #b9a5ec/);
  assert.match(css, /\.score-stat[\s\S]*#b9e5fb/);
  assert.match(css, /\.combo-stat[\s\S]*#ffc4d4/);
  assert.match(css, /\.best-stat[\s\S]*#ffe58a/);
  assert.match(css, /\.candidate:nth-child\(6\)/);
  assert.match(css, /\.result-card::before\s*\{[\s\S]*?display: none/);
  assert.match(css, /\.result-duck\s*\{[\s\S]*?z-index: 3/);
  assert.doesNotMatch(css, /#ffc7df|#d9c5f4/);
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
  assert.match(manifest, /"theme_color":\s*"#070b25"/);
  assert.match(html, /duck-gene-palette-sheet\.png\?v=duck-gene-lab-r23/);
  assert.doesNotMatch(html, /duck-gene-lab-bg\.webp/);

  const countdownBlock = game.match(
    /function runCountdown\(token\) \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function startGame/,
  )?.[1];
  const startBlock = game.match(
    /function startGame\(\) \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function makeCandidate/,
  )?.[1];
  const laterRoundBlock = game.match(
    /function beginRound\(\) \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function chooseCandidate/,
  )?.[1];
  assert.ok(countdownBlock);
  assert.ok(startBlock);
  assert.ok(laterRoundBlock);
  assert.match(countdownBlock, /state\.phase = "playing";\s+launchPreparedRound\(\)/);
  assert.doesNotMatch(countdownBlock, /beginRound\(\)/);
  assert.ok(startBlock.indexOf("prepareRound();") < startBlock.indexOf("runCountdown(token);"));
  assert.match(laterRoundBlock, /prepareRound\(\);\s+launchPreparedRound\(\);/);
});
