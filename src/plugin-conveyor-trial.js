import { ParameterType } from 'jspsych';
import { GameState } from './game_state.js';
import { ConveyorRenderer } from './renderer_pixi.js';
import { DRTController } from './drt.js';

// Helper to materialize a numeric 32-bit seed from a config value.
const randomUint32 = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] >>> 0;
    }
  } catch (_) {
    // fall through
  }
  return (Math.floor(Math.random() * 0x100000000) >>> 0);
};

const materializeSeed = (seedSpec) => {
  if (seedSpec === undefined || seedSpec === null) {
    return randomUint32();
  }
  if (typeof seedSpec === 'string') {
    const s = seedSpec.trim().toLowerCase();
    if (s === 'random' || s === 'auto') {
      return randomUint32();
    }
    const asNum = Number(s);
    if (Number.isFinite(asNum)) {
      return asNum >>> 0;
    }
    return randomUint32();
  }
  const n = Number(seedSpec);
  return Number.isFinite(n) ? (n >>> 0) : randomUint32();
};

const info = {
  name: 'conveyor-trial',
  parameters: {
    blockLabel: {
      type: ParameterType.STRING,
      default: 'Block'
    },
    blockIndex: {
      type: ParameterType.INT,
      default: 0
    },
    trialIndex: {
      type: ParameterType.INT,
      default: 0
    },
    config: {
      type: ParameterType.OBJECT,
      default: {}
    }
  }
};

export class ConveyorTrialPlugin {
  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  static info = info;

  async trial(display_element, trial) {
    const { jsPsych } = this;
    display_element.innerHTML = '<div class="conveyor-container"></div>';
    const container = display_element.querySelector('.conveyor-container');
    container.style.width = `${trial.config.display.canvasWidth}px`;
    container.style.height = `${trial.config.display.canvasHeight}px`;
    container.style.margin = '0 auto';

    const timelineEvents = [];
    const logEvent = (event) => {
      timelineEvents.push(event);
    };

    const baseSeed = materializeSeed(trial.config.trial?.seed);
    const gameState = new GameState(trial.config, {
      onEvent: logEvent,
      seed: baseSeed
    });
    if (trial?.config?.conveyors) {
      trial.config.conveyors.runtimeLengths = gameState.conveyors.map((conveyor) => conveyor.length);
    }

    const trialMode = trial.config.trial?.mode ?? 'fixed_time';
    const brickQuota = Number.isFinite(trial.config.bricks?.maxBricksPerTrial)
      ? trial.config.bricks.maxBricksPerTrial
      : null;
    const enforceBrickQuota = trialMode === 'max_bricks' && brickQuota !== null;
    const maxTimeSecRaw = trial.config.trial?.maxTimeSec;
    const maxDuration =
      Number.isFinite(maxTimeSecRaw) && maxTimeSecRaw !== null
        ? Math.max(0, Math.floor(maxTimeSecRaw * 1000))
        : null;

    const renderer = new ConveyorRenderer(trial.config, {
      // Capture brick clicks with canvas coordinates for precise logging
      onBrickClick: (brickId, x, y) => {
        gameState.handleBrickInteraction(brickId, gameState.elapsed, { x, y });
      }
    });
    await renderer.init(container);
    renderer.toggleVisualDRT(false, trial.config.drt?.stim_visual_config);

    const drtController = new DRTController(trial.config.drt || {}, {
      onEvent: (event) => {
        event.time = gameState.elapsed;
        logEvent(event);
      },
      seed: ((baseSeed >>> 0) + (trial.trialIndex + 1)) >>> 0
    });
    let animationFrameId = null;
    let ended = false;
    const activeAudioNodes = new Set();
    let trialStarted = !trial.config.experiment?.startTrialsOnSpace;

    let startOverlay = null;
    if (!trialStarted) {
      startOverlay = document.createElement('div');
      startOverlay.textContent = 'Press the space bar to begin.';
      startOverlay.style.position = 'absolute';
      startOverlay.style.top = '50%';
      startOverlay.style.left = '50%';
      startOverlay.style.transform = 'translate(-50%, -50%)';
      startOverlay.style.padding = '16px 24px';
      startOverlay.style.background = 'rgba(12, 19, 39, 0.85)';
      startOverlay.style.border = '1px solid rgba(255,255,255,0.2)';
      startOverlay.style.borderRadius = '8px';
      startOverlay.style.color = '#f5f6fa';
      startOverlay.style.fontSize = '20px';
      startOverlay.style.pointerEvents = 'none';
      startOverlay.style.textAlign = 'center';
      startOverlay.style.zIndex = '10';
      container.style.position = 'relative';
      container.appendChild(startOverlay);
    }

    const playDRTAudio = () => {
      if (trial.config.drt?.stim_type !== 'audio') {
        return;
      }
      const url = trial.config.drt?.stim_file_audio;
      if (!url) {
        return;
      }
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = 0.6;
      activeAudioNodes.add(audio);
      audio.addEventListener('ended', () => activeAudioNodes.delete(audio));
      audio.addEventListener('error', () => activeAudioNodes.delete(audio));
      audio.play().catch((error) => {
        console.warn('DRT audio play failed:', error);
        activeAudioNodes.delete(audio);
      });
    };

    let lastFrame = null;
    const tick = (timestamp) => {
      if (ended) {
        return;
      }
      if (lastFrame === null) {
        lastFrame = timestamp;
      }
      const dt = timestamp - lastFrame;
      lastFrame = timestamp;

      gameState.step(dt);
      renderer.updateBelts(gameState.conveyors, dt);
      drtController.step(gameState.elapsed, {
        onStimStart: () => {
          playDRTAudio();
          if (trial.config.drt?.stim_type === 'visual') {
            renderer.toggleVisualDRT(true, trial.config.drt?.stim_visual_config);
          }
        },
        onStimEnd: () => {
          if (trial.config.drt?.stim_type === 'visual') {
            renderer.toggleVisualDRT(false, trial.config.drt?.stim_visual_config);
          }
        }
      });

      renderer.syncBricks(Array.from(gameState.bricks.values()), trial.config.bricks.completionMode, trial.config.bricks.completionParams);
      const remainingMs = maxDuration !== null ? Math.max(0, maxDuration - gameState.elapsed) : null;
      renderer.updateHUD(
        gameState.getHUDStats(),
        remainingMs,
        {
          label: trial.blockLabel,
          drtStats: drtController.stats
        }
      );

      if (enforceBrickQuota) {
        const completed = gameState.stats.cleared + gameState.stats.dropped;
        if (completed >= brickQuota && gameState.bricks.size === 0) {
          endTrial('brick_quota_met');
          return;
        }
      }

      if (maxDuration !== null && gameState.elapsed >= maxDuration) {
        endTrial('time_limit');
        return;
      }
      animationFrameId = requestAnimationFrame(tick);
    };
    const startLoop = () => {
      if (animationFrameId === null) {
        lastFrame = null;
        animationFrameId = requestAnimationFrame(tick);
      }
    };
    if (trialStarted) {
      drtController.start(0);
      startLoop();
    }

    const handleKey = (info) => {
      if (!trialStarted && info.key === ' ') {
        trialStarted = true;
        if (startOverlay && startOverlay.parentNode) {
          startOverlay.parentNode.removeChild(startOverlay);
        }
        drtController.start(gameState.elapsed);
        startLoop();
        return;
      }

      drtController.handleKey(info.key, gameState.elapsed, {
        onStimEnd: () => {
          if (trial.config.drt?.stim_type === 'visual') {
            renderer.toggleVisualDRT(false, trial.config.drt?.stim_visual_config);
          }
        }
      });
    };

    const keyboardListener = this.jsPsych.pluginAPI.getKeyboardResponse({
      callback_function: handleKey,
      valid_responses: 'ALL_KEYS',
      rt_method: 'performance',
      persist: true,
      allow_held_key: false
    });

    if (maxDuration !== null) {
      this.jsPsych.pluginAPI.setTimeout(() => {
        endTrial('time_limit');
      }, maxDuration + 20);
    }

    const cleanup = () => {
      ended = true;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      this.jsPsych.pluginAPI.clearAllTimeouts();
      this.jsPsych.pluginAPI.cancelKeyboardResponse(keyboardListener);
      drtController.forceEnd(gameState.elapsed, {
        onStimEnd: () => renderer.toggleVisualDRT(false, trial.config.drt?.stim_visual_config)
      });
      activeAudioNodes.forEach((audio) => audio.pause());
      activeAudioNodes.clear();
      renderer.destroy();
      display_element.innerHTML = '';
    };

    const endTrial = (reason) => {
      if (ended) {
        return;
      }
      cleanup();
      const gameData = gameState.exportData();
      const drtData = drtController.exportData();
      const trialData = {
        block_label: trial.blockLabel,
        block_index: trial.blockIndex,
        trial_index: trial.trialIndex,
        trial_duration_ms: gameState.elapsed,
        end_reason: reason,
        config_snapshot: trial.config,
        game: gameData,
        drt: drtData,
        timeline_events: timelineEvents
      };
      jsPsych.finishTrial(trialData);
    };
  }
}

ConveyorTrialPlugin.info = info;
