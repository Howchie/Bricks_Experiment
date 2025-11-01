import { makeRNG } from './rng.js';
import { createSampler } from './sampling.js';

let globalStimId = 0;

const normalizeKey = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (value === ' ') {
    return ' ';
  }
  const keyString = String(value).toLowerCase();
  if (keyString === 'space' || keyString === 'spacebar') {
    return ' ';
  }
  return keyString;
};

/**
 * Detection Response Task controller. Keeps timing deterministic and exposes
 * hooks back to the jsPsych plugin for audio/visual presentation.
 */
export class DRTController {
  constructor(config, { onEvent, seed } = {}) {
    this.config = config;
    this.enabled = Boolean(config.enable);
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.rng = makeRNG(seed ?? config?.trial?.seed ?? Date.now());
    this.itiSampler = createSampler(config.iti_sampler || { type: 'uniform', min: 3000, max: 7000 }, this.rng);
    this.deadline = config.response_deadline_ms ?? 1500;
    this.key = normalizeKey(config.key);
    this.activeStim = null;
    this.nextStimAt = 0;
    this.events = [];
    this.stats = {
      presented: 0,
      hits: 0,
      misses: 0,
      falseAlarms: 0
    };
  }

  _log(type, payload = {}) {
    const event = {
      time: payload.time ?? 0,
      type,
      ...payload
    };
    this.events.push(event);
    this.onEvent(event);
  }

  start(startTimeMs = 0) {
    if (!this.enabled) {
      return;
    }
    this.nextStimAt = startTimeMs + this.itiSampler();
  }

  step(nowMs, { onStimStart, onStimEnd } = {}) {
    if (!this.enabled) {
      return;
    }
    if (!this.activeStim && nowMs >= this.nextStimAt) {
      const stim = {
        id: `drt${globalStimId += 1}`,
        start: nowMs,
        responded: false
      };
      this.activeStim = stim;
      this.stats.presented += 1;
      this._log('drt_stimulus_presented', { time: nowMs, stim_id: stim.id });
      if (typeof onStimStart === 'function') {
        onStimStart(stim);
      }
    }
    if (this.activeStim) {
      const stim = this.activeStim;
      if (!stim.responded && nowMs - stim.start >= this.deadline) {
        this.stats.misses += 1;
        this._log('drt_miss', {
          time: nowMs,
          stim_id: stim.id,
          latency: nowMs - stim.start
        });
        // Canonical response event for downstream analyses
        this._log('drt_response', {
          time: nowMs,
          stim_id: stim.id,
          key: this.key,
          hit: false,
          rt_ms: null
        });
        if (typeof onStimEnd === 'function') {
          onStimEnd(stim);
        }
        this.activeStim = null;
        this.nextStimAt = nowMs + this.itiSampler();
      }
    }
  }

  /**
   * Called on every key event so the DRT can score responses.
   */
  handleKey(eventKey, nowMs, { onStimEnd } = {}) {
    if (!this.enabled) {
      return false;
    }
    const key = normalizeKey(eventKey);
    if (key !== this.key) {
      this.stats.falseAlarms += 1;
      this._log('drt_false_alarm', { time: nowMs, key });
      this._log('drt_response', { time: nowMs, stim_id: null, key, hit: false, rt_ms: null });
      return false;
    }
    if (!this.activeStim) {
      this.stats.falseAlarms += 1;
      this._log('drt_false_alarm', { time: nowMs, key, note: 'no_active_stimulus' });
      this._log('drt_response', { time: nowMs, stim_id: null, key, hit: false, rt_ms: null });
      return false;
    }
    const stim = this.activeStim;
    stim.responded = true;
    const rt = nowMs - stim.start;
    this.stats.hits += 1;
    this._log('drt_hit', {
      time: nowMs,
      stim_id: stim.id,
      rt
    });
    this._log('drt_response', {
      time: nowMs,
      stim_id: stim.id,
      key,
      hit: true,
      rt_ms: rt
    });
    if (typeof onStimEnd === 'function') {
      onStimEnd(stim);
    }
    this.activeStim = null;
    this.nextStimAt = nowMs + this.itiSampler();
    return true;
  }

  /**
   * Ensures no stimulus remains active when the trial ends.
   */
  forceEnd(nowMs, { onStimEnd } = {}) {
    if (this.activeStim) {
      const stim = this.activeStim;
      this._log('drt_forced_end', {
        time: nowMs,
        stim_id: stim.id
      });
      if (typeof onStimEnd === 'function') {
        onStimEnd(stim);
      }
      this.activeStim = null;
    }
  }

  exportData() {
    return {
      enabled: this.enabled,
      stats: { ...this.stats },
      events: this.events.slice()
    };
  }
}
