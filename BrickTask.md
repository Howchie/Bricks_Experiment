# **Conveyor-Belt Bricks Task — Implementation Plan (jsPsych \+ PixiJS)**

This document is a precise, build-ready plan for implementing the “brick experiment” described in the uploaded grant proposal. It assumes an online deployment (JATOS or static hosting), participant recruitment via Prolific is possible, and that all task parameters are configurable at runtime via JSON. The plan yields a custom jsPsych plugin with smooth animations and robust data logging for all required measures (task performance, DRT, and self-report).

## **1\) Tech Stack**

* **jsPsych 7+** for timeline, data handling, keyboard, full-screen, instruction pages, and experiment structure.  
* **Rendering:** **PixiJS** (v6/v7) for GPU-accelerated sprites, easy tweening, and crisp animation at 60fps. (This is superior to vanilla Canvas for this task).  
* **Packaging:** ES modules with Vite or parcel; or a simple \<script\>-tag build with CDN (dev only).  
* **Deployment:**  
  * **JATOS** for robust data storage and study control.  
  * Fallback: jsPsych local save (CSV/JSON) and/or POST to a custom endpoint.  
* **Recruitment:** Prolific integration via URL query params and completion codes.

## **2\) Core Concepts (Terminology)**

* **Conveyor:** A horizontal lane (ID: c\_id) with length L (px or virtual units), speed v (px/s), and a visual belt.  
* **Brick:** A clickable rectangle traveling along one conveyor at speed v(c\_id, t) toward the right edge. It **drops** if \>50% of its width has moved off the right end.  
* **Trial:** A fixed-duration gameplay period (e.g., 2 minutes) where bricks appear, are clicked, or are dropped.  
* **DRT (Detection Response Task):** A concurrent secondary task (audio/visual) requiring a key press, as specified in the grant proposal.  
* **Block Group (“Experiment Block”):** A set of trials under shared manipulation (e.g., higher brick arrival rate). Shown between-block summary.  
* **Experiment:** Instructions → (Block 1 → Self-Report → …) → Debrief/End-of-study.

## **3\) Configurability (All tunables are in JSON, not hardcoded)**

{  
  "display": {  
    "canvasWidth": 1200,  
    "canvasHeight": 700,  
    "backgroundColor": "\#0b1220",  
    "beltColor": "\#2c3e50",  
    "beltHeight": 100,  
    "beltGap": 20,  
    "brickColor": "\#f39c12",  
    "brickWidth": 80,  
    "brickHeight": 60,  
    "brickCornerRadius": 8,  
    "ui": {  
      "showHUD": true,  
      "hudFont": "16px Inter, Arial",  
      "showTimer": true,  
      "showRemainingBlocks": true,  
      "showDroppedBlocks": true  
    }  
  },  
  "conveyors": {  
    "nConveyors": 4,  
    "lengthPx": { "type": "fixed", "value": 1000 },  
    "speedPxPerSec": { "type": "normal", "mu": 220, "sd": 40, "min": 120, "max": 340 }  
  },  
  "bricks": {  
    // Defines \*how\* a brick is "cleared" (for Studies 1-4)  
    "completionMode": "single\_click", // "single\_click", "multi\_click", "cognitive\_task"  
    "completionParams": {  
      "clicks\_required": 1 // e.g., for "multi\_click" mode  
      // "task\_type": "anagram" // e.g., for "cognitive\_task" mode  
    },  
    "initialBricks": { "type": "fixed", "value": 3 },  
    "maxBricksPerTrial": 20,  
    "spawn": {  
      "ratePerSec": { "type": "fixed", "value": 0.5 }, // \>0 for Poisson-like inflow  
      "interSpawnDist": { "type": "exponential", "lambda": 0.35, "min": 0.4, "max": 6.0 },  
      "minSpacingPx": 40,  
      "byConveyor": true,  
      "maxActivePerConveyor": 3  
    }  
  },  
  // \*\*\* NEW: DRT (WORKLOAD) PARAMETERS (from grant) \*\*\*  
  "drt": {  
    "enable": true,  
    "stim\_type": "audio", // 'audio' or 'visual'  
    "stim\_file\_audio": "/assets/drt\_beep.wav",  
    "stim\_visual\_config": { "shape": "circle", "color": "white", "size\_px": 30, "x": 600, "y": 350 },  
    "key": "j",  
    "iti\_sampler": { "type": "uniform", "min": 3000, "max": 7000 } // from grant  
  },  
  "trial": {  
    "mode": "fixed\_time",  
    // Set to 120s (2 min) to match grant's self-report interval  
    "maxTimeSec": 120.0,  
    "seed": 123456789  
  },  
  "experiment": {  
    "fullScreen": true,  
    "preloadAssets": \["/assets/drt\_beep.wav"\],  
    "showBetweenBlockSummary": true,  
    "allowBackOnInstructions": true,  
    "startTrialsOnSpace": true  
  },  
  "manipulations": \[  
    // ... (example unchanged) ...  
  \],  
  "prolific": {  
    // ... (example unchanged) ...  
  },  
  "jatos": {  
    // ... (example unchanged) ...  
  }  
}

## **4\) Data Model (what we save)**

### **4.1 Trial-level**

{  
  "trial\_index": 12,  
  "block\_index": 1,  
  "manip\_label": "Medium rate",  
  "trial\_start\_time": 1730341001.123,  
  "trial\_end\_time": 1730341121.145, // 120s duration  
  "trial\_duration\_ms": 120022,  
  "seed": 123456789,  
  "params\_conveyors": { ... }, // snapshot of conveyor params  
  "params\_bricks": { ... },    // snapshot of brick params  
  "params\_drt": { ... },       // snapshot of DRT params  
  "events": \[  
    // see 4.2  
  \],  
  // \*\*\* NEW: DRT (WORKLOAD) LOG (from grant) \*\*\*  
  "drt\_log": \[  
    { "stim\_time\_ms": 4500.1, "response\_time\_ms": 4980.4, "rt\_ms": 480.3, "hit": true },  
    { "stim\_time\_ms": 9800.5, "response\_time\_ms": null, "rt\_ms": null, "hit": false }  
  \],  
  // \*\*\* NEW: SELF-REPORT (WORKLOAD) DATA (from grant) \*\*\*  
  "self\_report\_workload": 7, // (Saved from the Likert scale \*after\* this trial)  
  "summary": {  
    "cleared": 14,  
    "dropped": 3,  
    "remaining": 0,  
    "drt\_hits": 1,  
    "drt\_misses": 1,  
    "drt\_mean\_rt": 480.3  
  }  
}

### **4.2 Event stream (append-only; high granularity)**

Each entry has t\_ms relative to trial\_start\_time.

* spawn: {type:"spawn", t\_ms, brick\_id, c\_id, x0, y, width, height}  
* click: {type:"click", t\_ms, brick\_id, c\_id, x, y}  
* clear: {type:"clear", t\_ms, brick\_id, c\_id, x, y, mode: "single\_click"}  
* drop: {type:"drop", t\_ms, brick\_id, c\_id, x, y}  
* **drt\_stim**: {type:"drt\_stim", t\_ms, stim\_type}  
* **drt\_response**: {type:"drt\_response", t\_ms, key, hit, rt\_ms}  
* trial\_end: {type:"trial\_end", t\_ms, reason:"timeout"}

## **5\) Visual & Animation Specs**

* (All existing specs for Layout, Motion, Drop rule, Clear rule, HUD remain)  
* **DRT Visual (if enabled):** A high-contrast PixiJS Graphics object (e.g., white circle) flashed briefly (e.g., 200ms) at a fixed screen position (e.g., center or corner), rendered on top of all other elements.

## **6\) Game/Trial Logic (State Machine)**

**States:** idle → running → ending → ended

1. **Prepare:** Sample per-conveyor lengthPx\[c\], speedPxPerSec\[c\]; compute belt Y positions. Initialize RNG with trial.seed.  
2. **Initial placement:** Create up to initialBricks bricks using RNG.  
3. **Run:** Start timer; register animation loop; register input handler for bricks.  
4. **DRT (if enabled):** Run a parallel process.  
   * Schedule the first drt\_stim using the drt.iti\_sampler and RNG.  
   * When a stim fires, log it (drt\_stim event), play audio/show visual, and record stim\_time.  
   * A *separate*, high-priority keydown listener (see section 8\) listens for the drt.key.  
5. **Spawning (if rate \> 0):** (Logic unchanged)  
6. **End conditions:** (Logic unchanged, primarily t \>= maxTimeSec)  
7. **On end:** Stop animation; stop DRT process; emit trial\_end event.

## **7\) Collisions & Spacing**

(No changes; logic remains sound)

## **8\) Keyboard & Flow Control**

* **Instructions:** jsPsych instructions plugin (unchanged).  
* **Trial start:** jsPsych html-keyboard-response prompt (unchanged).  
* **DRT Listener:** The custom plugin *must* add a global keydown listener *only* during the running state. This listener checks *only* for drt.key. It calculates rt\_ms, logs the drt\_response event, and updates the drt\_log. It must be cleaned up (removeEventListener) when the trial ends.  
* **Between-block screen:** (Unchanged).  
* **End:** (Unchanged).

## **9\) Randomization & Reproducibility**

* Use a seedable RNG (e.g., seedrandom), seeded per trial.  
* All random draws (lengths, speeds, spawn times, initial conveyor choices, **and DRT ITIs**) must come from this RNG and be **logged** in trial data for exact replay.

## **10\) jsPsych Integration (Timeline Outline)**

const timeline \= \[\];

// 1\) Consent (optional)

// 2\) Instructions (back/next enabled)  
timeline.push({  
  type: jsPsychInstructions,  
  pages: INSTRUCTION\_PAGES, // array of HTML strings  
  show\_clickable\_nav: true,  
  allow\_keys: true,  
  allow\_backward: CONFIG.experiment.allowBackOnInstructions  
});

// 3\) For each manipulation block  
for (const \[bIdx, blockCfg\] of blocksWithOverrides(CONFIG)) {  
  // Between-block header  
  timeline.push({  
    type: jsPsychHtmlKeyboardResponse,  
    stimulus: blockHeaderHTML(blockCfg, aggregateSoFar),  
    choices: \[' '\]  
  });

  // Trials in this block  
  for (let t=0; t\<blockCfg.trials; t++) {  
    timeline.push({ type: StartTrialPrompt, choices: \[' '\] }); // “Press SPACE to start”

    // \*\*\* THE CORE TASK TRIAL \*\*\*  
    timeline.push({  
      type: ConveyorTrialPlugin,  
      params: deriveTrialParams(CONFIG, blockCfg, bIdx, t),  
      on\_finish: (data) \=\> {  
        handleTrialData(data); // append to aggregates  
        // Save the workload score on the trial data that just finished  
        let last\_workload\_score \= jsPsych.data.get().last(1).values()\[0\]?.response.Q0;  
        if (last\_workload\_score) {  
          data.self\_report\_workload \= last\_workload\_score;  
        }  
        // Optionally submit to JATOS  
        // if (CONFIG.jatos.submitEveryTrial) jatos.submitResultData(data);  
      }  
    });

    // \*\*\* NEW: SELF-REPORT LIKERT (from grant) \*\*\*  
    // Follows each trial, as trial duration matches the 2-min interval  
    timeline.push({  
        type: jsPsychSurveyLikert,  
        questions: \[  
            {  
                prompt: "Please rate your mental workload during the last 2 minutes.",  
                labels: \['1 (Very Low)', '2', '3', '4', '5', '6', '7', '8', '9', '10 (Very High)'\],  
                required: true  
            }  
        \],  
        data: {  
            task\_phase: 'self\_report',  
            block\_index: bIdx,  
            trial\_index: t  
        }  
    });  
  } // end trial loop  
} // end block loop

// 4\) End / Debrief / Prolific redirect  
timeline.push(EndScreenOrProlificRedirectPlugin(CONFIG));

## **11\) Custom jsPsych Plugin: plugin-conveyor-trial.js**

### **11.1 Parameters**

const info \= {  
  name: 'conveyor-trial',  
  parameters: {  
    display: { type: jsPsych.NO\_PARAMETERS },  
    conveyors: { type: jsPsych.NO\_PARAMETERS },  
    bricks: { type: jsPsych.NO\_PARAMETERS },  
    trial: { type: jsPsych.NO\_PARAMETERS },  
    // \*\*\* NEW: DRT PARAMS \*\*\*  
    drt: { type: jsPsych.NO\_PARAMETERS }  
  }  
};

### **11.2 Trial Lifecycle (pseudocode)**

trial(display, conveyors, bricks, trialCfg, drtCfg) {  
  initCanvas(); // PixiJS app  
  initRNG(trialCfg.seed);  
  belts \= sampleBelts(conveyors, rng);  
  state \= new GameState(belts, trialCfg);  
  hud \= new HUD();  
  drt \= new DRTManager(drtCfg, rng, state); // DRT logic

  spawnInitialBricks(state, bricks, rng);  
  startTime \= performance.now();

  // Brick input  
  canvas.addEventListener('pointerdown', (e) \=\> {  
    const pt \= getLocalPoint(e);  
    const hit \= state.hitTest(pt);  
    if (hit) state.clearBrick(hit, bricks.completionMode, bricks.completionParams);  
  });

  // DRT input  
  const drtHandler \= (e) \=\> {  
    if (e.key \=== drtCfg.key) drt.onResponse(performance.now());  
  };  
  document.addEventListener('keydown', drtHandler);

  // Main loop  
  let last \= performance.now();  
  const loop \= (now) \=\> {  
    const dt \= clamp(now \- last, 0, 50); // delta time  
    last \= now;  
      
    state.step(dt, now \- startTime); // Move bricks, check drops, spawn new  
    drt.step(dt, now \- startTime);   // Check for new DRT stim  
    render(state, hud, drt);       // Draw everything

    if (\!state.ended) requestAnimationFrame(loop);  
  };  
  requestAnimationFrame(loop);

  // Monitor end conditions (unchanged)  
  // ...

  // On trial end  
  // ...  
  document.removeEventListener('keydown', drtHandler); // CLEANUP  
  endTrialAndSave(state.exportData());  
  // ...  
}

## **12\) JATOS & Prolific**

(No changes; logic remains sound)

## **13\) Performance & QA**

* (All existing QA points remain)  
* **New Test Cases:**  
  *   
    10. DRT stimuli fire (audio/visual) at correct, randomized intervals.  
  *   
    11. DRT responses (hits, misses, RTs) are logged correctly.  
  *   
    12. Self-report Likert scale appears after each trial.  
  *   
    13. completionMode: "multi\_click" requires N clicks to clear a brick.

## **14\) Directory Structure**

/public  
  index.html  
  style.css  
  /assets  
    belt-texture.png  
    drt\_beep.wav  // \*\*\* NEW \*\*\*  
/src  
  config.default.json  
  main.js  
  rng.js  
  sampling.js  
  hud.js  
  game\_state.js  
  drt.js            // \*\*\* NEW \*\*\*  
  renderer\_pixi.js  
  plugin-conveyor-trial.js  
  instructions.js  
  brick\_logic.js    // \*\*\* RENAMED \*\*\*  
  prolific.js  
  jatos\_hooks.js  
/vite.config.js (or parcel config)

## **15\) Build & Run**

(No changes; logic remains sound)

## **16\) Extensions (Future-Proofing for Studies 2-4)**

The config schema's bricks.completionMode and bricks.completionParams are designed for this. The state.clearBrick() function in the plugin will contain a switch statement:

* **case "single\_click": (Study 1\)**  
  * brick.clear() (Default)  
* **case "multi\_click": (Study 2 \- "Physical Effort")**  
  * brick.clicks\_done \= (brick.clicks\_done || 0\) \+ 1;  
  * brick.sprite.alpha \= 1 \- (brick.clicks\_done / params.clicks\_required);  
  * if (brick.clicks\_done \>= params.clicks\_required) { brick.clear(); }  
* **case "cognitive\_task": (Study 3 \- "Cognitive Effort")**  
  * pauseGame();  
  * showCognitiveModal(brick, params.task\_type, (success) \=\> {  
  * if (success) brick.clear();  
  * resumeGame();  
  * });

## **17\) Example Manipulation Design**

(No changes; logic remains sound)

## **18\) Minimal Styling Cues**

(No changes; logic remains sound)

## **19\) Security / Privacy**

(No changes; logic remains sound)

## **20\) Deliverables Checklist for the Implementer**

* $$ $$  
  ConveyorTrialPlugin implemented and unit-tested with deterministic replay.  
* $$ $$  
  Config system with per-block overrides and seeded RNG.  
* $$ $$  
  JATOS hooks and Prolific parameters integrated.  
* $$ $$  
  Instruction pages with back/forward.  
* $$ $$  
  Between-block summaries with counts.  
* $$ $$  
  **DRT logic (concurrent) and Likert scale (sequential) implemented.**  
* $$ $$  
  **completionMode logic hooks are in place.**  
* $$ $$  
  CSV/JSON export mirrors JATOS submissions.  
* $$ $$  
  Visual polish (animations, HUD) meets spec.  
* $$ $$  
  Readme documents all settings and usage.

## **21\) Acceptance Criteria**

1. All parameters listed in §3 are *configurable* via JSON.  
2. **Bricks** travel smoothly; clicking clears (per completionMode), edge overflow drops; all events logged.  
3. Trial ends per configured rule (maxTimeSec).  
4. Between-block screens show cumulative counts (if enabled).  
5. Data saving works with JATOS; fallback to local CSV/JSON.  
6. Experiment structure supports instructions with “go back”, space-to-start trials, block structure, and easy manipulations.  
7. **DRT stimuli are presented concurrently and responses are logged.**  
8. **A self-report workload scale is presented after each trial.**

**End of Plan.**