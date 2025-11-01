import defaultConfig from './config.default.json';

/**
 * Deep clone helper so we never mutate the imported default config object.
 */
const clone = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = clone(value[key]);
      return acc;
    }, {});
  }
  return value;
};

/**
 * Performs a deep merge of source into target. Arrays are replaced, not concatenated.
 */
export const deepMerge = (target, source) => {
  if (!source || typeof source !== 'object') {
    return target;
  }
  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      target[key] = value.map((item) => clone(item));
    } else if (value && typeof value === 'object') {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  });
  return target;
};

/**
 * Parses JSON overrides from the URL query string (e.g., ?overrides=...encodedJSON)
 * so remote testers can tweak parameters without rebuilding.
 */
const parseQueryOverrides = () => {
  const params = new URLSearchParams(window.location.search);
  const overridesParam = params.get('overrides');
  if (!overridesParam) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(overridesParam));
  } catch (error) {
    console.warn('Failed to parse overrides parameter:', error);
    return null;
  }
};

/**
 * Fetches the manipulation definition by id. Returns null if not found.
 */
export const getManipulation = (config, id) => {
  if (!id) {
    return null;
  }
  return (config.manipulations || []).find((manip) => manip.id === id) || null;
};

/**
 * Generates a block plan with overrides applied per block.
 */
export const buildBlockPlan = (config) => {
  const blocks = config.blocks || [];
  return blocks.map((block, index) => {
    const manipulation = getManipulation(config, block.manipulation);
    const blockConfig = clone(config);
    // Apply manipulation overrides first.
    if (manipulation && manipulation.overrides) {
      deepMerge(blockConfig, manipulation.overrides);
    }
    // Apply block-specific overrides next.
    if (block.overrides) {
      deepMerge(blockConfig, block.overrides);
    }
    return {
      index,
      label: block.label ?? `Block ${index + 1}`,
      trials: block.trials ?? 1,
      isPractice: Boolean(block.isPractice),
      manipulation: manipulation ? manipulation.label ?? manipulation.id : null,
      config: blockConfig
    };
  });
};

/**
 * Loads the base configuration, applies optional runtime overrides, and
 * returns a fresh, mutable config object for experiment setup.
 */
export const loadRuntimeConfig = (runtimeOverrides = {}) => {
  const config = clone(defaultConfig);
  const queryOverrides = parseQueryOverrides();
  if (queryOverrides) {
    deepMerge(config, queryOverrides);
  }
  if (runtimeOverrides && Object.keys(runtimeOverrides).length > 0) {
    deepMerge(config, runtimeOverrides);
  }
  return config;
};
