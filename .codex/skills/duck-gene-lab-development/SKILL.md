---
name: duck-gene-lab-development
description: Maintain, debug, test, document, or extend the mobile-first web game Duck Gene Lab while preserving its color recipes, jump-clock scoring, fair answer choices, responsive layout, audio, and offline behavior.
---

# Duck Gene Lab Development

Work in the existing project structure and preserve the web-first product. Android packaging is historical and is not part of normal maintenance.

## Read the relevant source

- Gameplay data and pure rules: `public/game/engine.js`
- Runtime state, input, audio and round flow: `public/game/game.js`
- Layout, art direction and animation: `public/game/game.css`
- Game document and overlays: `public/game/index.html`
- Offline cache: `public/game/sw.js`
- Locked palette and recipes: `docs/GENE_COLOR_SPEC.md`
- Architecture and decisions: `docs/DEVELOPMENT_REPORT.md`
- Automated checks: `tests/`

Read only the files needed for the requested change, but consult the color specification before changing colors, recipes, candidates or generated duck assets.

## Preserve the gameplay contract

- Keep the 14 palette entries, locked hexadecimal colors and 12 supported recipes synchronized between `engine.js`, `GENE_COLOR_SPEC.md`, the sprite generator and tests.
- Treat parent order as commutative. A supported pair must return the same target in either order.
- Exclude similar colors pairwise across the complete answer row. Do not place close pink, blue, purple or pale variants together merely to increase difficulty.
- Prepare and render the first question before the `3, 2, 1, GO` countdown. The countdown must not reroll parents or candidates.
- Use the duck rise-and-descent animation as the only round clock. Do not add a separate seconds progress bar unless the user explicitly changes the game concept.
- Keep scoring tied to the ten descent bands: highest band awards 10 points and the lowest valid band awards 1 point.
- Preserve score-based pacing unless requested otherwise: `3800 - score * 6.5` milliseconds, clamped to a 1600 millisecond minimum.
- Preserve the candidate progression: start at 3, add one every 4 rounds, and cap at 6.
- Wrong answers and timeouts end the run. Correct answers briefly show feedback before the next prepared round.

## Keep mobile rendering fair and fast

- Support portrait and landscape phones and tablets, safe-area insets, touch input and keyboard input.
- Animate the candidate duck with `transform` and `opacity`; avoid layout-dependent animation, real-time blur, `backdrop-filter`, large moving shadows or forced synchronous layout.
- Keep `.candidate-viewport` clipped so ducks enter and leave through the bottom of their own answer chamber.
- Maintain large readable text and touch targets. Rebalance the whole layout instead of fixing one device with hard-coded pixel positions.
- Keep answer feedback unmistakable: green/check for correct, red/cross for wrong, and reveal the true answer after failure.
- Keep the backdrop heart-free. Use the single large DNA layer at low opacity behind all UI; decorative motion must not intercept input or reduce color readability.
- Add concise comments for non-obvious timing, state transitions, cache invalidation and cross-file invariants. Do not comment obvious syntax line by line.

## Route changes consistently

- Color or recipe change: update `engine.js`, `GENE_COLOR_SPEC.md`, `generate_gene_palette_sprites.sh`, regenerated assets and tests.
- Timing or scoring change: update the engine constants/formulas, matching CSS keyframes, displayed rules, report and tests together.
- UI or animation change: update `game.css` and any required semantic markup in `index.html`; preserve clipping and reduced-motion behavior.
- Runtime or audio change: update `game.js`; keep the phase guards and round token cancellation intact.
- Asset or code URL change: update the query version in `index.html`, `game.css`, `game.js`, `app/page.tsx` and `sw.js`, then increment `CACHE_NAME`.
- Documentation-only change: do not alter gameplay or create a cache version solely for wording that is not shipped to the browser.

## Validate before delivery

Run:

```bash
npm run lint
npm run test
python3 /root/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/duck-gene-lab-development
git diff --check
```

Confirm that tests cover any changed invariant rather than merely checking for a new comment or heading. Browser or device QA is additional and should run only when the user requests it or when the change cannot be meaningfully verified otherwise.

## Package for GitHub

Include source, assets, documentation, tests, lockfile and this skill. Exclude `.git`, `node_modules`, build output, caches, environment files, APKs and the stopped Android wrapper. Keep `README.md` usable as the repository landing page.

Deploy, upload, change sharing, or replace a Drive file only when the user explicitly asks for that external action.
