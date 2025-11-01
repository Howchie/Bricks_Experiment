import * as PIXI from 'pixi.js';
import { brickProgressTint } from './brick_logic.js';
import { buildHUDLines } from './hud.js';

// Helper to convert CSS color strings or numeric values into Pixi-compatible numbers
const toPixiColor = (value) => PIXI.Color.shared.setValue(value ?? 0xffffff).toNumber();

/**
 * ConveyorRenderer
 * -----------------
 * Responsible for all drawing and pointer interactions using PixiJS.
 * - Draws belts, animated bricks, optional visual DRT indicator, and HUD text.
 * - Exposes onBrickClick callback so higher-level logic controls game state.
 *
 * Notes on PixiJS v7 API:
 * - In v7 the Application constructor accepts options directly. We keep the init
 *   routine synchronous to avoid compatibility issues with older sub-versions.
 * - The canvas element can live on `app.view` or `app.canvas`, so we handle both
 *   cases before appending to the DOM.
 */

/**
 * PixiJS renderer responsible for drawing conveyors, bricks, HUD, and optional
 * visual DRT stimuli. Audio DRT is handled by the jsPsych plugin directly.
 */
export class ConveyorRenderer {
  constructor(config, { onBrickClick } = {}) {
    this.config = config;
    this.onBrickClick = typeof onBrickClick === 'function' ? onBrickClick : () => {};
    this.app = null;
    this.root = null;
    this.brickSprites = new Map();
    this.hudElements = {};
    this.drtGraphics = null;
    this.beltTexture = null;
    this.beltVisuals = [];
  }

  async init(container) {
    if (!container) {
      throw new Error('Renderer requires a DOM container.');
    }
    this.root = container;
    // Initialize Pixi Application (v7 pattern)
    this.app = new PIXI.Application({
      width: this.config.display.canvasWidth,
      height: this.config.display.canvasHeight,
      backgroundColor: toPixiColor(this.config.display.backgroundColor),
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1
    });
    container.innerHTML = '';
    const view = this.app.view || this.app.canvas || null;
    if (view) {
      container.appendChild(view);
    }

    this.beltLayer = new PIXI.Container();
    this.brickLayer = new PIXI.Container();
    this.hudLayer = new PIXI.Container();
    this.drtLayer = new PIXI.Container();

    this.app.stage.addChild(this.beltLayer);
    this.app.stage.addChild(this.brickLayer);
    this.app.stage.addChild(this.drtLayer);
    this.app.stage.addChild(this.hudLayer);

    await this._prepareBeltTexture();
    this._drawBelts();
    this._setupHUD();
  }

  async _prepareBeltTexture() {
    try {
      const texCfg = this.config?.display?.beltTexture || {};
      if (!texCfg.enable) {
        this.beltTexture = null;
        return;
      }
      const src = texCfg.src || 'assets/belt-texture.png';
      if (PIXI.Assets && typeof PIXI.Assets.load === 'function') {
        this.beltTexture = await PIXI.Assets.load(src);
      } else {
        const tex = PIXI.Texture.from(src);
        if (!tex.baseTexture.valid) {
          await new Promise((resolve) => {
            const done = () => resolve();
            tex.baseTexture.once('loaded', done);
            tex.baseTexture.once('update', done);
            tex.baseTexture.once('error', done);
          });
        }
        this.beltTexture = tex;
      }
    } catch (error) {
      console.warn('Failed to load belt texture; falling back to solid fill.', error);
      this.beltTexture = null;
    }
  }

  _drawBelts() {
    const { beltColor, beltHeight, beltGap, canvasHeight } = this.config.display;
    const n = this.config.conveyors.nConveyors;
    const totalHeight = n * beltHeight + (n - 1) * beltGap;
    const topOffset = (canvasHeight - totalHeight) / 2;
    const runtimeLengths = Array.isArray(this.config.conveyors.runtimeLengths)
      ? this.config.conveyors.runtimeLengths
      : null;
    const fallbackLength = (() => {
      const spec = this.config.conveyors.lengthPx;
      if (typeof spec === 'number') {
        return spec;
      }
      if (spec && typeof spec === 'object') {
        const value = Number(spec.value);
        if (Number.isFinite(value)) {
          return value;
        }
      }
      return this.config.display.canvasWidth;
    })();
    this.beltLayer.removeChildren();
    this.beltVisuals = [];
    const useTexture = !!this.beltTexture && (this.config?.display?.beltTexture?.enable === true);
    const alpha = Number(this.config?.display?.beltTexture?.alpha ?? 1);
    const scaleX = Number(this.config?.display?.beltTexture?.scaleX ?? this.config?.display?.beltTexture?.scale ?? 1);
    const scaleY = Number(this.config?.display?.beltTexture?.scaleY ?? this.config?.display?.beltTexture?.scale ?? 1);
    const tint = this.config?.display?.beltTexture?.tint ?? null;
    for (let i = 0; i < n; i += 1) {
      const y = topOffset + i * (beltHeight + beltGap);
      const sampledLength =
        runtimeLengths && Number.isFinite(runtimeLengths[i])
          ? runtimeLengths[i]
          : fallbackLength;
      const length = Math.max(0, sampledLength);
      if (useTexture) {
        let sprite;
        try {
          sprite = new PIXI.TilingSprite({ texture: this.beltTexture, width: length, height: beltHeight });
        } catch (_) {
          sprite = new PIXI.TilingSprite(this.beltTexture, length, beltHeight);
        }
        sprite.x = 0;
        sprite.y = y;
        sprite.alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
        if (tint) {
          sprite.tint = toPixiColor(tint);
        }
        // Control density of pattern.
        try {
          // Auto-scale texture to fit belt height, preserving aspect ratio.
          const baseScale = beltHeight / sprite.texture.height;
          sprite.tileScale.set(baseScale * scaleX, baseScale * scaleY);
        } catch (_) {
          // Older Pixi versions may use different APIs; ignore.
        }
        try {
          // Reset tile origin so scrolling starts aligned.
          sprite.tilePosition.set(0, 0);
        } catch (_) {
          // ignore
        }
        this.beltLayer.addChild(sprite);
        this.beltVisuals.push({ type: 'tiling', node: sprite });
      } else {
        const g = new PIXI.Graphics();
        g.beginFill(toPixiColor(beltColor));
        g.drawRoundedRect(0, y, length, beltHeight, 12);
        g.endFill();
        this.beltLayer.addChild(g);
        this.beltVisuals.push({ type: 'solid', node: g });
      }
    }
  }

  /**
   * Scrolls belt textures to suggest motion matching each conveyor's speed.
   * Expects the same ordering as created in _drawBelts.
   */
  updateBelts(conveyors, dtMs) {
    if (!this.beltVisuals || !this.beltVisuals.length) {
      return;
    }
    const useTexture = !!this.beltTexture && (this.config?.display?.beltTexture?.enable === true);
    if (!useTexture) {
      return;
    }
    const factor = Number(this.config?.display?.beltTexture?.scrollFactor ?? 1);
    const dt = Math.max(0, Number(dtMs) || 0) / 1000;
    for (let i = 0; i < Math.min(this.beltVisuals.length, conveyors.length); i += 1) {
      const vis = this.beltVisuals[i];
      if (vis.type !== 'tiling' || !vis.node) {
        continue;
      }
      const speed = Number(conveyors[i]?.speed) || 0;
      const shift = -speed * dt * factor; // bricks move +x, scroll texture -x
      try {
        vis.node.tilePosition.x += shift;
      } catch (_) {
        // ignore
      }
    }
  }

  _setupHUD() {
    if (!this.config.display.ui?.showHUD) {
      return;
    }
    const hudStyle = new PIXI.TextStyle({
      fill: 0xf5f6fa,
      fontSize: 16,
      fontFamily: this.config.display.ui.hudFont || 'Inter, Arial'
    });
    // Pixi v7 Text constructor signature: (text, style)
    const hudText = new PIXI.Text('', hudStyle);
    hudText.x = 10;
    hudText.y = 10;
    this.hudLayer.addChild(hudText);
    this.hudElements.status = hudText;
  }

  /**
   * Synchronises PIXI sprites with the logical bricks array.
   */
  syncBricks(bricks, completionMode, completionParams) {
    const seen = new Set();
    bricks.forEach((brick) => {
      let sprite = this.brickSprites.get(brick.id);
      if (!sprite) {
        sprite = this._createBrickSprite(brick);
        this.brickSprites.set(brick.id, sprite);
        this.brickLayer.addChild(sprite);
      }
      const desiredFill = toPixiColor(brick.color ?? this.config.display.brickColor);
      if (
        sprite.fillColorValue !== desiredFill ||
        sprite.brickWidth !== brick.width ||
        sprite.brickHeight !== brick.height
      ) {
        this._drawBrickGraphics(sprite, brick);
      }
      sprite.position.set(brick.x, brick.y);
      if (completionMode === 'multi_click') {
        sprite.alpha = 1 - Math.min(1, (brick.clicks ?? 0) / Math.max(1, completionParams?.clicks_required ?? 2)) * 0.6;
        sprite.tint = brickProgressTint(brick, completionMode, completionParams);
      } else {
        sprite.alpha = 1;
        sprite.tint = 0xffffff;
      }
      seen.add(brick.id);
    });
    // Remove stale sprites.
    Array.from(this.brickSprites.keys()).forEach((id) => {
      if (!seen.has(id)) {
        const sprite = this.brickSprites.get(id);
        if (sprite) {
          sprite.destroy();
        }
        this.brickSprites.delete(id);
      }
    });
  }

  _createBrickSprite(brick) {
    const sprite = new PIXI.Graphics();
    sprite.brickId = brick.id;
    sprite.cursor = 'pointer';
    sprite.interactive = true;
    sprite.on('pointertap', (e) => {
      // FederatedPointerEvent exposes globalX/globalY in v7; fallback to global.x/y
      const gx = (e && (e.globalX ?? (e.global && e.global.x))) ?? 0;
      const gy = (e && (e.globalY ?? (e.global && e.global.y))) ?? 0;
      this.onBrickClick(brick.id, gx, gy);
    });

    this._drawBrickGraphics(sprite, brick);
    return sprite;
  }

  _drawBrickGraphics(sprite, brick) {
    const color = toPixiColor(brick.color ?? this.config.display.brickColor);
    sprite.clear();
    sprite.beginFill(color);
    sprite.drawRoundedRect(0, 0, brick.width, brick.height, this.config.display.brickCornerRadius);
    sprite.endFill();
    sprite.hitArea = new PIXI.Rectangle(0, 0, brick.width, brick.height);
    sprite.fillColorValue = color;
    sprite.brickWidth = brick.width;
    sprite.brickHeight = brick.height;
  }

  updateHUD(stats, remainingMs, blockInfo) {
    const text = this.hudElements.status;
    if (!text) {
      return;
    }
    const lines = buildHUDLines({
      stats,
      remainingMs,
      blockLabel: blockInfo?.label,
      drtStats: blockInfo?.drtStats
    });
    text.text = lines.join('\n');
  }

  /**
   * Shows or hides the visual DRT indicator.
   */
  toggleVisualDRT(show, config) {
    if (!config) {
      return;
    }
    if (!this.drtGraphics) {
      this.drtGraphics = new PIXI.Graphics();
      this.drtLayer.addChild(this.drtGraphics);
    }
    this.drtGraphics.clear();
    if (show) {
      const { shape, color, size_px, x, y } = config;
      const tint = toPixiColor(color || '#ffffff');
      this.drtGraphics.beginFill(tint, 0.9);
      if (shape === 'circle') {
        this.drtGraphics.drawCircle(x, y, size_px / 2);
      } else {
        this.drtGraphics.drawRoundedRect(x - size_px / 2, y - size_px / 2, size_px, size_px, size_px * 0.2);
      }
      this.drtGraphics.endFill();
    }
  }

  destroy() {
    this.brickSprites.forEach((sprite) => sprite.destroy());
    this.brickSprites.clear();
    if (this.app) {
      // Clean up Pixi application and remove canvas from DOM
      this.app.destroy(true, { children: true, texture: true, baseTexture: true });
      const view = this.app.canvas || this.app.view;
      if (this.root && view && view.parentNode === this.root) {
        this.root.removeChild(view);
      }
    }
    this.app = null;
  }
}
