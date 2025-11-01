import { makeRNG } from './rng.js';

/**
 * Utility to clamp a value into [min, max] when bounds are provided.
 */
const clamp = (value, min, max) => {
  let result = value;
  if (typeof min === 'number') {
    result = Math.max(min, result);
  }
  if (typeof max === 'number') {
    result = Math.min(max, result);
  }
  return result;
};

/**
 * Creates a sampler function for the specification shape used in config JSON.
 * Supported types: fixed, uniform, normal, exponential, list.
 */
export const createSampler = (spec, rng = makeRNG()) => {
  if (!spec || typeof spec !== 'object') {
    throw new Error('Sampler spec must be an object.');
  }
  const type = spec.type ?? 'fixed';
  switch (type) {
    case 'fixed': {
      const value = spec.value;
      return () => value;
    }
    case 'uniform': {
      const min = Number(spec.min);
      const max = Number(spec.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        throw new Error(`Invalid uniform sampler bounds: ${min}, ${max}`);
      }
      return () => rng.nextRange(min, max);
    }
    case 'normal': {
      const mu = Number(spec.mu);
      const sd = Number(spec.sd);
      if (!Number.isFinite(mu) || !Number.isFinite(sd) || sd <= 0) {
        throw new Error(`Invalid normal sampler parameters: ${mu}, ${sd}`);
      }
      const min = Number.isFinite(spec.min) ? spec.min : undefined;
      const max = Number.isFinite(spec.max) ? spec.max : undefined;
      return () => clamp(rng.nextNormal(mu, sd), min, max);
    }
    case 'exponential': {
      const lambda = Number(spec.lambda);
      if (!Number.isFinite(lambda) || lambda <= 0) {
        throw new Error(`Invalid exponential lambda: ${lambda}`);
      }
      const min = Number.isFinite(spec.min) ? spec.min : undefined;
      const max = Number.isFinite(spec.max) ? spec.max : undefined;
      return () => {
        // Inverse transform sampling.
        let u = 0;
        while (u === 0) {
          u = rng.nextFloat();
        }
        const sample = -Math.log(1 - u) / lambda;
        return clamp(sample, min, max);
      };
    }
    case 'list': {
      const items = Array.isArray(spec.values) ? spec.values.slice() : [];
      if (!items.length) {
        throw new Error('List sampler requires a non-empty "values" array.');
      }
      return () => items[Math.floor(rng.nextRange(0, items.length))];
    }
    default:
      throw new Error(`Unknown sampler type: ${type}`);
  }
};

/**
 * Helper to materialize a sampler immediately.
 */
export const sampleValue = (spec, rng = makeRNG()) => createSampler(spec, rng)();
