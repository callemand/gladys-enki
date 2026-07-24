// -----------------------------------------------------------------------------
// Enki lighting <-> Gladys LIGHT features.
//
// Applies to standalone bulbs AND to the light kit of a ceiling fan (both use
// the api-enki-lighting-prod service and the same lastReportedValue shape):
//   { power: "ON"|"OFF", brightness: 0..brightnessMax,
//     colorTemperature: "T2700K", colorMode: "ct"|"hs", hue: 0..1, saturation: 0..1 }
//
// Gladys conventions (server/services/philips-hue):
//   - LIGHT.BINARY       0/1
//   - LIGHT.BRIGHTNESS   0..100 (percent)
//   - LIGHT.TEMPERATURE  mireds (like Philips Hue ct; mired = 1e6 / kelvin)
//   - LIGHT.COLOR        decimal RGB int (0..16777215)
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import { ENKI_POWER, FEATURE_CODES } from '../constants.js';

// --- small numeric / color helpers (kept dependency-free, testable) ----------

/**
 * @param {number} kelvin color temperature in kelvin
 * @returns {number} the equivalent mired value
 */
export function kelvinToMired(kelvin) {
  return Math.round(1e6 / kelvin);
}

/**
 * @param {number} mired mired value
 * @returns {number} the equivalent kelvin value
 */
export function miredToKelvin(mired) {
  return Math.round(1e6 / mired);
}

/**
 * Pick the available Enki kelvin value closest to a target.
 * @param {Array<number>} kelvins available kelvin values
 * @param {number} target target kelvin
 * @returns {number} the closest available kelvin
 */
export function nearestKelvin(kelvins, target) {
  return kelvins.reduce((best, k) => (Math.abs(k - target) < Math.abs(best - target) ? k : best));
}

/** @param {number} intColor 0..16777215 @returns {[number, number, number]} rgb */
export function intToRgb(intColor) {
  const red = intColor >> 16;
  const green = (intColor - (red << 16)) >> 8;
  const blue = intColor - (red << 16) - (green << 8);
  return [red, green, blue];
}

/** @param {[number, number, number]} rgb @returns {number} 0..16777215 */
export function rgbToInt([red, green, blue]) {
  return (red << 16) | (green << 8) | blue;
}

/**
 * Convert RGB to HSB (hue 0..360, sat/bri 0..100), matching Gladys colors.js.
 * @param {[number, number, number]} rgb rgb
 * @returns {[number, number, number]} [hue, saturation, brightness]
 */
export function rgbToHsb([r0, g0, b0]) {
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const v = Math.max(r, g, b);
  const n = v - Math.min(r, g, b);
  let h;
  if (n === 0) {
    h = 0;
  } else if (v === r) {
    h = (g - b) / n;
  } else if (v === g) {
    h = 2 + (b - r) / n;
  } else {
    h = 4 + (r - g) / n;
  }
  return [
    Math.round(60 * (h < 0 ? h + 6 : h)),
    Math.round(v && (n / v) * 100),
    Math.round(v * 100),
  ];
}

/**
 * Convert HSB (hue 0..360, sat/bri 0..100) to RGB, matching Gladys colors.js.
 * @param {[number, number, number]} hsb [hue, saturation, brightness]
 * @returns {[number, number, number]} rgb
 */
export function hsbToRgb([h, s, b]) {
  const sDivided = s / 100;
  const bDivided = b / 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => bDivided * (1 - sDivided * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return [Math.round(255 * f(5)), Math.round(255 * f(3)), Math.round(255 * f(1))];
}

/**
 * Read a kelvin value from an Enki colorTemperature string ("T2700K").
 * @param {*} value colorTemperature value
 * @returns {number|null} kelvin, or null
 */
function parseEnkiKelvin(value) {
  const kelvin = Number(String(value).replace(/[^0-9]/g, ''));
  return Number.isFinite(kelvin) && kelvin > 0 ? kelvin : null;
}

function enkiToGladysBrightness(brightness, max) {
  if (!Number.isFinite(brightness)) {
    return null;
  }
  return Math.round((brightness * 100) / max);
}

function gladysToEnkiBrightness(percent, max) {
  return Math.round(((percent * max) / 100) * 100) / 100;
}

// --- feature building --------------------------------------------------------

/**
 * Build the Gladys LIGHT features advertised by a profile.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile (see capabilities.js)
 * @returns {Array<object>} light features
 */
export function buildLightFeatures(ids, profile) {
  if (!profile.isLight) {
    return [];
  }
  const features = [
    {
      name: 'Light',
      external_id: ids.feature(FEATURE_CODES.LIGHT_BINARY),
      read_only: false,
      has_feedback: true,
      min: 0,
      max: 1,
      category: DEVICE_FEATURE_CATEGORIES.LIGHT,
      type: DEVICE_FEATURE_TYPES.LIGHT.BINARY,
    },
  ];

  if (profile.supportsBrightness) {
    features.push({
      name: 'Brightness',
      external_id: ids.feature(FEATURE_CODES.BRIGHTNESS),
      read_only: false,
      has_feedback: true,
      min: 0,
      max: 100,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      category: DEVICE_FEATURE_CATEGORIES.LIGHT,
      type: DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS,
    });
  }

  if (profile.supportsColorTemperature && profile.colorTempKelvins.length > 0) {
    const kelvins = profile.colorTempKelvins;
    features.push({
      name: 'Color temperature',
      external_id: ids.feature(FEATURE_CODES.COLOR_TEMPERATURE),
      read_only: false,
      has_feedback: true,
      // Highest kelvin = coldest = smallest mired, and vice versa.
      min: kelvinToMired(kelvins[kelvins.length - 1]),
      max: kelvinToMired(kelvins[0]),
      category: DEVICE_FEATURE_CATEGORIES.LIGHT,
      type: DEVICE_FEATURE_TYPES.LIGHT.TEMPERATURE,
    });
  }

  if (profile.supportsColor) {
    features.push({
      name: 'Color',
      external_id: ids.feature(FEATURE_CODES.COLOR),
      read_only: false,
      has_feedback: true,
      min: 0,
      max: 0,
      category: DEVICE_FEATURE_CATEGORIES.LIGHT,
      type: DEVICE_FEATURE_TYPES.LIGHT.COLOR,
    });
  }

  return features;
}

/**
 * Build the Gladys states of the LIGHT features from an Enki light state.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @param {object} lightState Enki lastReportedValue
 * @returns {Array<object>} states (unknown values dropped by the caller)
 */
export function buildLightStates(ids, profile, lightState) {
  if (!profile.isLight || !lightState) {
    return [];
  }
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.LIGHT_BINARY),
      state: lightState.power === ENKI_POWER.ON ? 1 : 0,
    },
  ];

  if (profile.supportsBrightness) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_CODES.BRIGHTNESS),
      state: enkiToGladysBrightness(Number(lightState.brightness), profile.brightnessMax),
    });
  }

  if (profile.supportsColorTemperature && profile.colorTempKelvins.length > 0) {
    const kelvin = parseEnkiKelvin(lightState.colorTemperature);
    states.push({
      device_feature_external_id: ids.feature(FEATURE_CODES.COLOR_TEMPERATURE),
      state: kelvin === null ? null : kelvinToMired(kelvin),
    });
  }

  if (profile.supportsColor) {
    const { hue, saturation } = lightState;
    let color = null;
    if (Number.isFinite(Number(hue)) && Number.isFinite(Number(saturation))) {
      const rgb = hsbToRgb([Number(hue) * 360, Number(saturation) * 100, 100]);
      color = rgbToInt(rgb);
    }
    states.push({
      device_feature_external_id: ids.feature(FEATURE_CODES.COLOR),
      state: color,
    });
  }

  return states;
}

/**
 * Build the change-light-state field(s) for a Gladys command. Returns null when
 * the feature code is not a lighting feature.
 * @param {string} featureCode last segment of the feature external id
 * @param {number} value value sent by Gladys
 * @param {object} profile capability profile
 * @returns {object|null} the partial change to merge over the current state
 */
export function buildLightChange(featureCode, value, profile) {
  switch (featureCode) {
    case FEATURE_CODES.LIGHT_BINARY:
      return value ? { power: ENKI_POWER.ON } : { power: ENKI_POWER.OFF };
    case FEATURE_CODES.BRIGHTNESS: {
      const enki = gladysToEnkiBrightness(value, profile.brightnessMax);
      if (enki <= 0) {
        return { power: ENKI_POWER.OFF };
      }
      return { power: ENKI_POWER.ON, brightness: enki };
    }
    case FEATURE_CODES.COLOR_TEMPERATURE: {
      const targetKelvin = miredToKelvin(value);
      const kelvin = profile.colorTempKelvins.length
        ? nearestKelvin(profile.colorTempKelvins, targetKelvin)
        : targetKelvin;
      return { power: ENKI_POWER.ON, colorTemperature: `T${kelvin}K`, colorMode: 'ct' };
    }
    case FEATURE_CODES.COLOR: {
      const [h, s] = rgbToHsb(intToRgb(value));
      return {
        power: ENKI_POWER.ON,
        colorMode: 'hs',
        hue: Math.round((h / 360) * 100) / 100,
        saturation: Math.round((s / 100) * 100) / 100,
      };
    }
    default:
      return null;
  }
}

/**
 * Merge a partial change over the current Enki light state. Enki requires the
 * full lastReportedValue on every change-light-state POST; when turning fields
 * on it also expects `power: ON` (Siroco+ kits ignore the command otherwise).
 * @param {object} current current lastReportedValue
 * @param {object} changes partial change (from buildLightChange)
 * @returns {object} the full change-light-state body
 */
export function mergeLightPayload(current, changes) {
  const base = current && typeof current === 'object' ? { ...current } : {};
  if (changes.power === ENKI_POWER.OFF) {
    return { ...base, ...changes };
  }
  const payload = { ...base, ...changes, power: ENKI_POWER.ON };
  // A hue/saturation change and a color-temperature change are mutually
  // exclusive color modes — drop the stale one.
  if (changes.colorMode === 'hs') {
    delete payload.colorTemperature;
  } else if (changes.colorMode === 'ct') {
    delete payload.hue;
    delete payload.saturation;
  }
  return payload;
}
