// -----------------------------------------------------------------------------
// Enki outlets / relays <-> Gladys SWITCH feature.
//
// Pure on/off devices (outlets, in-wall relays) driven by the power service:
//   - GET  api-enki-power-prod .../check-electrical-power  -> "ON"/"OFF"
//   - POST api-enki-power-prod .../switch-electrical-power  { value: "ON"|"OFF" }
//
// (Lights, fans and covers carry their own power through richer features, so
// they are never mapped as a plain switch — see capabilities.isSwitch.)
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

import { ENKI_POWER, FEATURE_CODES } from '../constants.js';

/**
 * Read an "ON"/"OFF" power state, whether reported as a bare string or a
 * per-endpoint map (single-endpoint outlets only).
 * @param {*} raw check-electrical-power lastReportedValue
 * @returns {string|null} "ON" / "OFF", or null if unknown
 */
export function normalizePower(raw) {
  if (typeof raw === 'string') {
    return raw.trim().toUpperCase();
  }
  if (raw && typeof raw === 'object') {
    const values = Object.values(raw).filter((v) => typeof v === 'string');
    if (values.length === 1) {
      return values[0].trim().toUpperCase();
    }
  }
  return null;
}

/**
 * Build the Gladys SWITCH feature of an outlet / relay.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @returns {Array<object>} switch features
 */
export function buildSwitchFeatures(ids, profile) {
  if (!profile.isSwitch) {
    return [];
  }
  return [
    {
      name: 'Power',
      external_id: ids.feature(FEATURE_CODES.SWITCH_BINARY),
      read_only: false,
      has_feedback: true,
      min: 0,
      max: 1,
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
    },
  ];
}

/**
 * Build the Gladys states of the switch from a power read.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @param {*} powerValue check-electrical-power lastReportedValue
 * @returns {Array<object>} states (unknown values dropped by the caller)
 */
export function buildSwitchStates(ids, profile, powerValue) {
  if (!profile.isSwitch) {
    return [];
  }
  const power = normalizePower(powerValue);
  let state = null;
  if (power === ENKI_POWER.ON) {
    state = 1;
  } else if (power === ENKI_POWER.OFF) {
    state = 0;
  }
  return [
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.SWITCH_BINARY),
      state,
    },
  ];
}

/**
 * Whether a feature code is a switch feature.
 * @param {string} featureCode last segment of the feature external id
 * @returns {boolean}
 */
export function isSwitchFeature(featureCode) {
  return featureCode === FEATURE_CODES.SWITCH_BINARY;
}

/**
 * Map a Gladys switch command to an Enki power value.
 * @param {number} value 0 or 1
 * @returns {string} "ON" / "OFF"
 */
export function switchCommandValue(value) {
  return value === 1 ? ENKI_POWER.ON : ENKI_POWER.OFF;
}
