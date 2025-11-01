import { makeRNG } from './rng.js';
import { createSampler } from './sampling.js';

let globalBrickId = 0;

const BRICK_STATUS = {
  ACTIVE: 'active',
  CLEARED: 'cleared',
  DROPPED: 'dropped'
};

/**
 * Represents the trial-level game state, including conveyors, bricks, and
 * high-level statistics. Rendering and jsPsych plugin orchestrate updates
 * via the public methods exposed here.
 */
export class GameState {
  constructor(config, { onEvent, seed } = {}) {
    this.config = config;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.rng = makeRNG(seed ?? config?.trial?.seed);
    this.elapsed = 0;

    this.events = [];
    this.stats = {
      spawned: 0,
      cleared: 0,
      dropped: 0,
      clickErrors: 0
    };

    this.bricks = new Map();
    this.conveyors = [];
    this.conveyorsById = new Map();
    this.spawnControllers = [];
    this.defaultConveyorLength = this.config.display?.canvasWidth ?? 1000;
    this.brickCategories = this._prepareBrickCategories();
    this._initConveyors();
    this._initBricks();
  }

  _log(type, payload = {}) {
    const event = {
      time: this.elapsed,
      type,
      ...payload
    };
    this.events.push(event);
    this.onEvent(event);
  }

  _initConveyors() {
    const cfg = this.config;
    const n = cfg.conveyors.nConveyors;
    const beltHeight = cfg.display.beltHeight;
    const gap = cfg.display.beltGap;
    const totalHeight = n * beltHeight + (n - 1) * gap;
    const topOffset = (cfg.display.canvasHeight - totalHeight) / 2;
    const lengthSampler = this._makeLengthSampler(cfg.conveyors.lengthPx);
    const speedSampler = createSampler(cfg.conveyors.speedPxPerSec, this.rng);
    const interSpawnSampler = createSampler(cfg.bricks.spawn.interSpawnDist, this.rng);
    let defaultLength = null;
    for (let i = 0; i < n; i += 1) {
      const sampledLength = Number(lengthSampler());
      const minLength = cfg.display.brickWidth * 2;
      const length = Number.isFinite(sampledLength)
        ? Math.max(minLength, sampledLength)
        : Math.max(minLength, cfg.display.canvasWidth);
      const speed = Math.max(0, speedSampler());
      const conveyor = {
        id: `c${i}`,
        index: i,
        y: topOffset + i * (beltHeight + gap),
        length,
        speed,
        interSpawnSampler,
        nextSpawnAt: 0,
        activeIds: []
      };
      if (defaultLength === null) {
        defaultLength = length;
      }
      this.conveyors.push(conveyor);
      this.conveyorsById.set(conveyor.id, conveyor);
    }
    if (defaultLength !== null) {
      this.defaultConveyorLength = defaultLength;
    }
  }

  _initBricks() {
    const cfg = this.config;
    const initialCount = Math.max(0, Math.floor(this._resolveValue(cfg.bricks.initialBricks)));
    if (initialCount === 0) {
      return;
    }
    for (let i = 0; i < initialCount; i += 1) {
      const conveyor = this.conveyors[i % this.conveyors.length];
      const fraction = (i + 1) / (initialCount + 1);
      const length = conveyor.length - cfg.display.brickWidth;
      const x = Math.max(0, fraction * length);
      this._spawnBrick(conveyor, { x, reason: 'initial' });
    }
  }

  _resolveValue(spec) {
    if (typeof spec === 'number') {
      return spec;
    }
    if (spec && typeof spec === 'object' && spec.type === 'fixed') {
      return Number(spec.value);
    }
    return 0;
  }

  _prepareBrickCategories() {
    const palette = this.config?.bricks?.colorCategories;
    if (!Array.isArray(palette) || palette.length === 0) {
      return [];
    }
    return palette
      .map((entry, index) => {
        if (!entry) {
          return null;
        }
        const color = entry.color ?? entry.colour ?? null;
        if (!color) {
          return null;
        }
        return {
          id: entry.id ?? `cat${index + 1}`,
          label: entry.label ?? null,
          color
        };
      })
      .filter(Boolean);
  }

  _makeLengthSampler(lengthSpec) {
    if (typeof lengthSpec === 'number') {
      const value = Number(lengthSpec);
      return () => value;
    }
    if (lengthSpec && typeof lengthSpec === 'object') {
      if (typeof lengthSpec.value === 'number' && !lengthSpec.type) {
        const value = Number(lengthSpec.value);
        return () => value;
      }
      const sampler = createSampler(lengthSpec, this.rng);
      return () => sampler();
    }
    const fallback = this.config.display?.canvasWidth ?? 1000;
    return () => fallback;
  }

  /**
   * Spawns a new brick on the given conveyor if safety constraints permit.
   */
  _spawnBrick(conveyor, { x = 0, reason = 'spawn' } = {}) {
    const cfg = this.config;
    const width = cfg.display.brickWidth;
    const minSpacing = cfg.bricks.spawn.minSpacingPx ?? 0;
    const maxActive = cfg.bricks.spawn.maxActivePerConveyor ?? Infinity;
    const activeBricks = conveyor.activeIds.map((id) => this.bricks.get(id)).filter(Boolean);

    if (activeBricks.length >= maxActive) {
      return false;
    }
    const id = `b${globalBrickId += 1}`;
    const palette = this.brickCategories;
    const category =
      palette.length > 0 ? palette[Math.floor(this.rng.nextRange(0, palette.length))] : null;
    const color = category?.color ?? cfg.display.brickColor;
    const speed = Math.max(0, conveyor.speed);
    const buffer = Math.max(0, minSpacing);
    const newStart = x;
    const newEnd = x + width;
    const overlaps = activeBricks.some((existing) => {
      const existingStart = existing.x;
      const existingEnd = existing.x + existing.width;
      return newStart < existingEnd + buffer && newEnd + buffer > existingStart;
    });
    if (overlaps) {
      return false;
    }
    const brick = {
      id,
      conveyorId: conveyor.id,
      status: BRICK_STATUS.ACTIVE,
      x,
      y: conveyor.y + (cfg.display.beltHeight - cfg.display.brickHeight) / 2,
      speed,
      width,
      height: cfg.display.brickHeight,
      createdAt: this.elapsed,
      clicks: 0,
      color,
      colorCategoryId: category?.id ?? null,
      colorCategoryLabel: category?.label ?? null
    };
    this.bricks.set(id, brick);
    conveyor.activeIds.push(id);
    this.stats.spawned += 1;
    this._log('brick_spawned', {
      brick_id: id,
      conveyor_id: conveyor.id,
      speed_px_s: speed,
      reason,
      color,
      color_category_id: brick.colorCategoryId,
      color_category_label: brick.colorCategoryLabel
    });
    return true;
  }

  /**
   * Removes a brick and updates stats/logging.
   */
  _finalizeBrick(brick, status, payload = {}) {
    if (!brick || brick.status !== BRICK_STATUS.ACTIVE) {
      return;
    }
    brick.status = status;
    const conveyor = this.conveyorsById.get(brick.conveyorId);
    if (conveyor) {
      conveyor.activeIds = conveyor.activeIds.filter((id) => id !== brick.id);
    }
    this.bricks.delete(brick.id);
    const eventType = status === BRICK_STATUS.CLEARED ? 'brick_cleared' : 'brick_dropped';
    if (status === BRICK_STATUS.CLEARED) {
      this.stats.cleared += 1;
    } else if (status === BRICK_STATUS.DROPPED) {
      this.stats.dropped += 1;
    }
    this._log(eventType, {
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      lifetime: this.elapsed - brick.createdAt,
      x: brick.x,
      y: brick.y,
      ...payload
    });
  }

  /**
   * Handles player interaction depending on completion mode.
   */
  handleBrickInteraction(brickId, timestamp, clickPos = {}) {
    const { x = null, y = null } = clickPos || {};
    const brick = this.bricks.get(brickId);
    if (!brick) {
      // Log the attempted click with coordinates even if invalid
      this.stats.clickErrors += 1;
      this._log('brick_click', { brick_id: brickId ?? null, x, y, valid: false });
      this._log('brick_click_invalid', { brick_id: brickId ?? null, x, y });
      return;
    }
    // Log a canonical click event before applying completion logic
    this._log('brick_click', {
      brick_id: brick.id,
      conveyor_id: brick.conveyorId,
      x,
      y,
      valid: true
    });
    const mode = this.config.bricks.completionMode;
    const params = this.config.bricks.completionParams || {};
    if (mode === 'single_click') {
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: mode,
        clicks: brick.clicks + 1,
        x: brick.x,
        y: brick.y
      });
    } else if (mode === 'multi_click') {
      const required = Math.max(1, Number(params.clicks_required ?? 2));
      brick.clicks += 1;
      this._log('brick_click_progress', {
        brick_id: brick.id,
        clicks: brick.clicks,
        required
      });
      if (brick.clicks >= required) {
        this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
          completion_mode: mode,
          clicks: brick.clicks,
          x: brick.x,
          y: brick.y
        });
      }
    } else {
      // Future modes can plug in here (e.g., cognitive tasks).
      this._finalizeBrick(brick, BRICK_STATUS.CLEARED, {
        completion_mode: mode,
        clicks: brick.clicks + 1,
        x: brick.x,
        y: brick.y,
        note: 'Fallback clear for unimplemented mode.'
      });
    }
  }

  /**
   * Advances the simulation by dt milliseconds.
   */
  step(dtMs) {
    const dt = dtMs / 1000;
    this.elapsed += dtMs;

    // Update brick positions and check for drops.
    this.bricks.forEach((brick) => {
      if (brick.status !== BRICK_STATUS.ACTIVE) {
        return;
      }
      const conveyor = this.conveyorsById.get(brick.conveyorId);
      const conveyorLength = conveyor ? conveyor.length : this.defaultConveyorLength;
      const speed = conveyor ? conveyor.speed : brick.speed;
      brick.speed = speed;
      brick.x += speed * dt;
      if (brick.x + brick.width / 2 >= conveyorLength) {
        this._finalizeBrick(brick, BRICK_STATUS.DROPPED, {
          completion_mode: this.config.bricks.completionMode
        });
      }
    });

    // Spawn logic.
    const maxTotal = this.config.bricks.maxBricksPerTrial ?? Infinity;
    const activeCount = this.bricks.size;
    if (activeCount < maxTotal) {
      const spawnRate = this._resolveValue(this.config.bricks.spawn.ratePerSec);
      const shouldConsider = spawnRate > 0 || this.config.bricks.spawn.interSpawnDist;
      if (shouldConsider) {
        this.conveyors.forEach((conveyor) => {
          const nextSpawn = conveyor.nextSpawnAt;
          if (this.elapsed >= nextSpawn) {
            const spawned = this._spawnBrick(conveyor);
            const delay = conveyor.interSpawnSampler();
            conveyor.nextSpawnAt = this.elapsed + delay * 1000;
            if (!spawned) {
              // If spawn failed due to spacing, retry sooner.
              conveyor.nextSpawnAt = this.elapsed + Math.min(1000, delay * 500);
            }
          }
        });
      }
    }
  }

  /**
   * Returns a lightweight snapshot for HUD rendering.
   */
  getHUDStats() {
    return {
      timeElapsedMs: this.elapsed,
      bricksActive: this.bricks.size,
      spawned: this.stats.spawned,
      cleared: this.stats.cleared,
      dropped: this.stats.dropped
    };
  }

  /**
   * Returns serializable data for persistent storage.
   */
  exportData() {
    return {
      stats: { ...this.stats },
      events: this.events.slice()
    };
  }

  /**
   * Cleans up any remaining bricks (used when the trial ends abruptly).
   */
  forceEnd() {
    this.bricks.forEach((brick) => {
      this._finalizeBrick(brick, BRICK_STATUS.DROPPED, { forced: true });
    });
  }
}

export { BRICK_STATUS };
