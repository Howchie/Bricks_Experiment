# Conveyor-Belt Bricks Task (Prototype)

This repository contains an offline-ready prototype of the conveyor-belt bricks workload experiment described in *BrickTask.md*. It is built with **jsPsych 7** for experiment control and **PixiJS 7** for smooth GPU-accelerated animation.

The implementation follows the specification in `BrickTask.md`, including:

- Multiple conveyors with animated bricks that move, drop, and respond to clicks.
- Configurable spawn rates, speeds, and completion modes (single-click, multi-click scaffolded).
- A concurrent Detection Response Task (DRT) with audio or visual stimuli, reaction-time logging, and miss detection.
- Blocked timeline structure with instructions, per-trial self-report Likert scales, and between-block summaries.
- Deterministic RNG, seeded spawning, and comprehensive event logging for later analyses.

The build uses **Vite** for module bundling; all assets are local so the prototype runs without network dependencies.

---

## 1. Getting Started

```bash
npm install
npm run dev   # launches Vite dev server (default: http://localhost:5173)
```

The dev server hot-reloads changes. For a static build:

```bash
npm run build
npm run preview
```

---

## 2. Project Structure

```
public/
  index.html         # Shell for the jsPsych experiment
  style.css          # Global styling (Pixi renders the trial display)
  assets/
    drt_beep.wav     # 250 ms tone for audio DRT stimuli
    belt-texture.png # Seamless belt tile (optional)
src/
  main.js                    # jsPsych timeline, blocks, data export
  config.default.json        # Human-readable configuration
  config.js                  # Deep-merge + block-plan helpers
  rng.js, sampling.js        # Deterministic random sampling utilities
  game_state.js              # Core brick/conveyor logic
  brick_logic.js, hud.js     # UI helpers
  renderer_pixi.js           # PixiJS renderer (belts, bricks, HUD, DRT visual)
  drt.js                     # DRT stimulus scheduling and scoring
  plugin-conveyor-trial.js   # Custom jsPsych plugin bridging logic + renderer
  instructions.js            # Instruction and summary timeline nodes
  prolific.js, jatos_hooks.js, data_saver.js # Integrations and persistence
```

---

## 3. Configuration

All runtime parameters live in `src/config.default.json`. Key sections:

- `display`: Canvas size, colors, HUD toggles.
- `conveyors`: Number of lanes, belt length, speed distributions.
- `bricks`: Spawn process, completion modes, spawn spacing, quotas.
- `drt`: Dual-task modality, stimulus asset, ITI sampler, response key.
- `trial`: Duration and RNG seed.
- `experiment`: Fullscreen behaviour, preloads, between-block summaries.
- `blocks` & `manipulations`: Block scheduling and per-condition overrides.
- `selfReport`: Likert prompt and scale labels/values.
- `prolific`, `jatos`, `data`: Integration toggles and local save options.

To override values without editing the file, append a URL parameter:

```
?overrides=%7B%22trial%22%3A%7B%22maxTimeSec%22%3A60%7D%7D
```

(`overrides` expects URI-encoded JSON; the helper deeply merges with the defaults.)

---

## 7. Config Reference

This section documents every configurable option in `src/config.default.json`, including valid types and values.

- Top level keys
  - `display` — Canvas, colors, and HUD.
  - `conveyors` — Lane count, lengths, and belt speeds.
  - `bricks` — Spawn process, completion modes, quotas.
  - `drt` — Detection Response Task controls.
  - `trial` — Trial duration and RNG seed.
  - `experiment` — Fullscreen, preloads, summaries, start behavior.
  - `selfReport` — Likert prompt and labels.
  - `blocks` — The block schedule for the timeline.
  - `manipulations` — Named override bundles for blocks.
  - `instructions` — Instruction pages rendered before trials.
  - `prolific` — URL parameter names if integrating with Prolific.
  - `jatos` — JATOS integration toggles.
  - `data` — Local save options.

Refer to “Sampler Specs” for fields that accept random samplers.

—

Display (`display`)
- `canvasWidth` (number, px) — Canvas width in pixels.
- `canvasHeight` (number, px) — Canvas height in pixels.
- `backgroundColor` (CSS color) — E.g., `"#0c1327"`, `"#112233"`.
- `beltColor` (CSS color) — Conveyor belt fill color.
- `beltHeight` (number, px) — Height of each belt.
- `beltGap` (number, px) — Vertical spacing between belts.
- `beltTexture` (object) — Optional textured belts using a tiling sprite.
  - `enable` (boolean) — Use the texture instead of a solid fill.
  - `src` (string) — Path/URL to the texture image (default `assets/belt-texture.png`).
  - `alpha` (0–1) — Opacity of the texture layer.
  - `scale` (number) — Uniform scale for the tile; or use `scaleX`/`scaleY` fields for non‑uniform scaling.
  - `tint` (CSS color, optional) — Multiplies the texture color to match theme.
  - `scrollFactor` (number) — Multiplier for scroll speed; 1.0 matches belt speed.
- `brickWidth` (number, px) — Brick width.
- `brickHeight` (number, px) — Brick height.
- `brickCornerRadius` (number, px) — Brick corner radius for rounded rects.
- `brickColor` (CSS color) — Default brick color (overridden by `colorCategories`).
- `ui.showHUD` (boolean) — Show HUD overlay with stats/timer.
- `ui.hudFont` (string) — Font family for HUD text.

Conveyors (`conveyors`)
- `nConveyors` (integer ≥ 1) — Number of belts/lanes.
- `lengthPx` (number | sampler spec)
  - Number: fixed length in px.
  - Sampler: object spec; see “Sampler Specs”. If the object has a numeric `value` but no `type`, it is treated as fixed.
- `speedPxPerSec` (sampler spec) — Belt speed in px/s. Common choices: `uniform`, `normal`, or `fixed`.

Bricks (`bricks`)
- `initialBricks` (number | fixed sampler)
  - Number or `{ "type": "fixed", "value": N }` — Bricks pre-placed across belts at trial start.
- `colorCategories` (array of objects)
  - Each item: `{ id?: string, label?: string, color?: string }`.
  - `color` can also be given as `colour` (alias). Color must be a CSS color string (e.g., `"#1abc9c"`).
- `completionMode` (string enum)
  - `"single_click"` — Single click clears a brick.
  - `"multi_click"` — Requires multiple clicks; see `completionParams`.
- `completionParams` (object)
  - For `multi_click`: `clicks_required` (integer ≥ 1).
- `maxBricksPerTrial` (integer ≥ 0) — Safety cap on active bricks.
- `spawn` (object)
  - `ratePerSec` (fixed sampler) — Positive values enable spawn consideration when `interSpawnDist` is omitted.
  - `interSpawnDist` (sampler spec, seconds) — Interval between spawn attempts; typical types: `exponential`, `uniform`, or `fixed`.
  - `minSpacingPx` (number, px) — Minimum spacing buffer when placing new bricks.
  - `byConveyor` (boolean) — Spawn attempts per conveyor (current implementation schedules spawns per conveyor).
  - `maxActivePerConveyor` (integer ≥ 1) — Limits active bricks on each belt.

DRT (`drt`)
- `enable` (boolean) — Enable the concurrent Detection Response Task.
- `stim_type` (string enum) — `"visual"` or `"audio"`.
- `stim_visual_config` (object, used when `stim_type` = `"visual"`)
  - `shape` (string enum): `"square"` or `"circle"`.
  - `color` (CSS color) — E.g., `"#ff3b30"`.
  - `size_px` (number, px) — Side length for square; diameter for circle.
  - `x`, `y` (numbers, px) — Center position of the indicator.
- `stim_file_audio` (string, URL) — Audio file URL when `stim_type` = `"audio"`.
- `key` (string) — Response key. Accepted: a literal space (`" "`), `"space"`, `"spacebar"`, or any single printable key (e.g., `"j"`).
- `iti_sampler` (sampler spec, milliseconds) — Inter-trial interval between consecutive DRT stimuli.
- `response_deadline_ms` (integer, ms) — Window for a response to be scored as a hit.

Trial (`trial`)
- `mode` (string enum)
  - `"fixed_time"` — Trial ends when `maxTimeSec` elapses.
  - `"max_bricks"` — Trial ends when all spawned bricks up to the quota resolve (cleared or dropped).
- `maxTimeSec` (number | null) — Seconds per trial; set `null` to remove the time cap.
- `seed` (number | `"random"` | `"auto"` | null)
  - Number: deterministic seed for reproducibility (32‑bit unsigned).
  - `"random"`/`"auto"` or `null`: use a random 32‑bit seed per run. Internally, the DRT uses an offset of this seed per trial to decorrelate streams.

Experiment (`experiment`)
- `fullScreen` (boolean) — Enter fullscreen before trials and exit at the end.
- `preloadAssets` (string[]) — URLs to preload (e.g., audio files).
- `showBetweenBlockSummary` (boolean) — Show a summary page between blocks.
- `allowBackOnInstructions` (boolean) — Allow navigating back through instruction pages.
- `startTrialsOnSpace` (boolean) — Require pressing space to start a trial.

Self‑Report (`selfReport`)
- `enable` (boolean) — Show a Likert item after each trial.
- `likertScale` (array) — Items `{ value: number, label: string }` used to label choices.
- `prompt` (string) — HTML/text preamble for the Likert question.

Blocks (`blocks`)
- Array of block objects:
  - `label` (string) — Display name.
  - `trials` (integer ≥ 1) — Number of trials in the block.
  - `manipulation` (string | null) — References an entry in `manipulations` to apply before this block.
  - `isPractice` (boolean) — Marks the block as practice.
  - `overrides` (object) — Deep‑merged onto the base config after `manipulations`.

Manipulations (`manipulations`)
- Array of named override bundles used by blocks:
  - `id` (string) — Unique identifier used by `blocks[*].manipulation`.
  - `label` (string) — Human‑readable name.
  - `overrides` (object) — Deep‑merged onto the base config before block overrides.

Instructions (`instructions`)
- `pages` (array) — Each page: `{ title: string, html: string }`.

Prolific (`prolific`)
- `enable` (boolean) — When true, Prolific query parameters are captured and tagged in the data.
- `participantParam` (string) — Query param name for PID (default `"PROLIFIC_PID"`).
- `sessionParam` (string) — Query param name for session ID (default `"SESSION_ID"`).
- `studyParam` (string) — Query param name for study ID (default `"STUDY_ID"`).

JATOS (`jatos`)
- `enable` (boolean) — Toggle JATOS data submission.
- `componentId` (number | null) — Component ID when running inside JATOS.

Data (`data`)
- `localSave` (boolean) — Download JSON/CSV at the end of the session.
- `filePrefix` (string) — Prefix for local filenames.

—

Sampler Specs
- Many timing and size fields accept a “sampler spec” object to generate values using the trial’s RNG. Supported types:
  - `fixed`: `{ "type": "fixed", "value": number }`
  - `uniform`: `{ "type": "uniform", "min": number, "max": number }` (min < max)
  - `normal`: `{ "type": "normal", "mu": number, "sd": number, "min"?: number, "max"?: number }`
  - `exponential`: `{ "type": "exponential", "lambda": number, "min"?: number, "max"?: number }` (lambda > 0)
  - `list`: `{ "type": "list", "values": any[] }` (random item from the list)

Notes
- If a sampler object has a numeric `value` but no `type`, it is treated as a fixed value.
- `drt.iti_sampler` is measured in milliseconds; `bricks.spawn.interSpawnDist` is measured in seconds.
- `trial.seed` supports numbers, `"random"`/`"auto"`, or `null`. When non‑numeric, a random 32‑bit seed is generated per run and used to seed the game RNG; the DRT RNG uses a per‑trial offset of that seed.

Examples
- Randomize all trials with a unique seed per run:
  - URL overrides: `?overrides=%7B%22trial%22%3A%7B%22seed%22%3A%22random%22%7D%7D`
- Switch to a brick‑quota trial mode with no time cap:
  - `?overrides=%7B%22trial%22%3A%7B%22mode%22%3A%22max_bricks%22%2C%22maxTimeSec%22%3Anull%7D%7D`
- Use audio DRT with fixed 4–5 s ITIs:
  - `?overrides=%7B%22drt%22%3A%7B%22enable%22%3Atrue%2C%22stim_type%22%3A%22audio%22%2C%22stim_file_audio%22%3A%22assets/drt_beep.wav%22%2C%22iti_sampler%22%3A%7B%22type%22%3A%22uniform%22%2C%22min%22%3A4000%2C%22max%22%3A5000%7D%7D%7D`

—

Using Belt Textures
- Place a seamless, tileable texture at `public/assets/belt-texture.png` (or point `display.beltTexture.src` to your file), then enable it with `display.beltTexture.enable: true`.
- Recommended texture specs:
  - Make it horizontally tileable; the renderer repeats it across the belt length.
  - Size: start with 128×128 px or 256×128 px; keep height close to your `beltHeight` (default 128 px) for 1:1 scale. Power‑of‑two sizes (e.g., 128, 256) are convenient but not required.
  - Keep contrast moderate to avoid shimmering; avoid very thin 1‑px diagonals.
  - Transparent background is fine; the belt color will show through if you tint or lower `alpha`.
- Motion: when textures are enabled, belts scroll in the opposite direction of brick movement at each conveyor’s speed. Adjust `display.beltTexture.scrollFactor` to exaggerate or reduce motion.
- Control density with `display.beltTexture.scale` (or `scaleX`/`scaleY`). Example override to enable texture, increase density, and slightly reduce scroll speed:
  - `?overrides=%7B%22display%22%3A%7B%22beltTexture%22%3A%7B%22enable%22%3Atrue%2C%22scale%22%3A0.75%2C%22scrollFactor%22%3A0.9%7D%7D%7D`

## 4. Running the Experiment

1. Start the dev server (`npm run dev`) and open the URL.
2. Instructions can be navigated backward if `experiment.allowBackOnInstructions` is true.
3. Each trial waits for the space bar before starting (if enabled).
4. Bricks clear on click; dropping past the right edge logs as `brick_dropped`.
5. DRT stimuli appear concurrently. Hits, misses, and false alarms are recorded.
6. A Likert scale follows each trial when `selfReport.enable` is true.
7. Between blocks, a summary page aggregates cleared/dropped counts and DRT accuracy.

---

## 5. Data & Export

- Every trial captures:
  - Block metadata (`block_label`, `block_index`, etc.).
  - `game.stats` (spawned/cleared/dropped) and an `events` array (spawn, clear, drop, clicks).
  - `drt.stats` (presented/hits/misses/false alarms) and detailed event timestamps.
  - `timeline_events`: merged chronological log (bricks + DRT).
- Self-report trials append `workload_value` (scale `value`) and `workload_label`.
- When `data.localSave` is enabled (default), JSON and CSV files download automatically at the end of the session (`brick_task_<timestamp>.json/csv`).
- JATOS submission hooks are stubbed (`src/jatos_hooks.js`); enable and configure `config.jatos` to activate once deploying inside JATOS.

---

## 6. Next Steps / Customisation

- **Assets:** Replace `public/assets/belt-texture.png` and `drt_beep.wav` with study-specific art/audio.
- **Completion Modes:** Extend the switch in `GameState.handleBrickInteraction` to plug in cognitive subtasks.
- **Analytics:** `game_state.js` and `drt.js` surface deterministic events for replay or externally scripted analyses.
- **Integrations:** Populate `config.prolific.completionUrl` or JATOS component IDs, then wire completion flows inside `src/main.js`.
- **Testing:** Unit-test modules (`rng`, `sampling`, `drt`, `game_state`) with your preferred harness (Jest/Vitest).

---

Please reach out if any functionality needs clarification or extension; the code is heavily commented so you can adjust parameters with confidence. Happy experimenting!
