// -----------------------------------------------------------------------------
// Enki heaters / pilot-wire radiators <-> Gladys THERMOSTAT + HEATER features.
//
//   - Target temperature (THERMOSTAT.TARGET_TEMPERATURE, °C):
//       read  api-enki-thermostat-prod .../check-thermostat-target-temperature
//       write api-enki-command-override-prod override-commands (DEROGATION),
//             falling back to a direct thermostat POST (see client.js).
//   - Pilot-wire mode (HEATER.PILOT_WIRE_MODE): Enki strings map 1:1 by name to
//       the Gladys PILOT_WIRE_MODE enum (OFF/FROST_PROTECTION/ECO/COMFORT_1/
//       COMFORT_2/COMFORT).
//       read  .../check-pilot-wire-state    write .../switch-pilot-wire-mode
//
// The current room temperature is exposed separately as a temperature sensor
// (see sensors.js / check_current_temperature).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import { FEATURE_CODES, PILOT_WIRE_MODE } from '../constants.js';

const GLADYS_TO_ENKI_PILOT_WIRE = Object.fromEntries(
  Object.entries(PILOT_WIRE_MODE).map(([name, code]) => [code, name]),
);

function toNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Map an Enki pilot-wire string ("COMFORT", "ECO", …) to the Gladys enum value.
 * @param {*} value Enki pilot-wire state
 * @returns {number|null} Gladys PILOT_WIRE_MODE value, or null if unknown
 */
export function pilotWireToGladys(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const code = PILOT_WIRE_MODE[value.trim().toUpperCase()];
  return code === undefined ? null : code;
}

/**
 * Map a Gladys PILOT_WIRE_MODE value to the Enki API string.
 * @param {number} value Gladys pilot-wire value
 * @returns {string} Enki pilot-wire string
 */
export function gladysToPilotWire(value) {
  const enki = GLADYS_TO_ENKI_PILOT_WIRE[value];
  if (enki === undefined) {
    throw new Error(`Unsupported pilot-wire mode: ${value}`);
  }
  return enki;
}

/**
 * Build the Gladys heating features of a radiator / thermostat.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @returns {Array<object>} heating features
 */
export function buildHeaterFeatures(ids, profile) {
  const features = [];
  if (profile.supportsTargetTemperature) {
    features.push({
      name: 'Target temperature',
      external_id: ids.feature(FEATURE_CODES.TARGET_TEMPERATURE),
      read_only: false,
      has_feedback: true,
      min: profile.thermostatRange.min,
      max: profile.thermostatRange.max,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
      type: DEVICE_FEATURE_TYPES.THERMOSTAT.TARGET_TEMPERATURE,
    });
  }
  if (profile.supportsPilotWire) {
    features.push({
      name: 'Pilot wire mode',
      external_id: ids.feature(FEATURE_CODES.PILOT_WIRE_MODE),
      read_only: false,
      has_feedback: true,
      min: PILOT_WIRE_MODE.OFF,
      max: PILOT_WIRE_MODE.COMFORT,
      category: DEVICE_FEATURE_CATEGORIES.HEATER,
      type: DEVICE_FEATURE_TYPES.HEATER.PILOT_WIRE_MODE,
    });
  }
  return features;
}

/**
 * Build the Gladys states of the heating features.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @param {{ targetTemperature: *, pilotWire: * }} reads raw thermostat reads
 * @returns {Array<object>} states (unknown values dropped by the caller)
 */
export function buildHeaterStates(ids, profile, { targetTemperature, pilotWire } = {}) {
  const states = [];
  if (profile.supportsTargetTemperature) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_CODES.TARGET_TEMPERATURE),
      state: toNumber(targetTemperature),
    });
  }
  if (profile.supportsPilotWire) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_CODES.PILOT_WIRE_MODE),
      state: pilotWireToGladys(pilotWire),
    });
  }
  return states;
}

/**
 * Whether a feature code is a heating feature.
 * @param {string} featureCode last segment of the feature external id
 * @returns {boolean}
 */
export function isHeaterFeature(featureCode) {
  return (
    featureCode === FEATURE_CODES.TARGET_TEMPERATURE ||
    featureCode === FEATURE_CODES.PILOT_WIRE_MODE
  );
}
