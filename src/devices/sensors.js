// -----------------------------------------------------------------------------
// Enki read-only sensors <-> Gladys sensor features.
//
// Each sensor reading is a `check_*` capability served by a dedicated
// micro-service. SENSOR_READS is the routing table (capability -> service +
// Gladys feature). buildProfile() (capabilities.js) turns the capabilities a
// device advertises into per-device descriptors; this module builds the Gladys
// features and maps the raw `lastReportedValue` to a Gladys state.
//
// Value shapes (verified against the live catalog):
//   - temperature / humidity / illuminance: numeric lastReportedValue;
//   - motion / contact / water leak: enum strings (MOTION_DETECTED, OPENED, …);
//   - battery health: enum (GOOD / LOW / REPLACE / CRITICAL / …).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  BATTERY_LOW_STATES,
  BATTERY_OK_STATES,
  BINARY_FALSE_STATES,
  BINARY_TRUE_STATES,
  FEATURE_CODES,
} from '../constants.js';

// Capability -> service + Gladys feature. `code` is the feature-id suffix and
// the dedup key (a device may advertise two capabilities for one reading).
export const SENSOR_READS = [
  {
    capability: 'check_current_temperature',
    service: 'temperature_humidity',
    code: FEATURE_CODES.TEMPERATURE,
    category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
    unit: DEVICE_FEATURE_UNITS.CELSIUS,
    kind: 'number',
    defaultMin: -20,
    defaultMax: 60,
  },
  {
    capability: 'check_current_humidity',
    service: 'temperature_humidity',
    code: FEATURE_CODES.HUMIDITY,
    category: DEVICE_FEATURE_CATEGORIES.HUMIDITY_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
    unit: DEVICE_FEATURE_UNITS.PERCENT,
    kind: 'number',
    defaultMin: 0,
    defaultMax: 100,
  },
  {
    capability: 'check_illuminance_level',
    service: 'luminosity_sensor',
    code: FEATURE_CODES.ILLUMINANCE,
    category: DEVICE_FEATURE_CATEGORIES.LIGHT_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    unit: DEVICE_FEATURE_UNITS.LUX,
    kind: 'number',
    defaultMin: 0,
    defaultMax: 100000,
  },
  {
    capability: 'check_motion_detection',
    service: 'presence_detector',
    code: FEATURE_CODES.MOTION,
    category: DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    kind: 'binary',
  },
  {
    // Alias for models that only expose the detector-state capability.
    capability: 'check_motion_detector_state',
    service: 'presence_detector',
    code: FEATURE_CODES.MOTION,
    category: DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    kind: 'binary',
  },
  {
    capability: 'check_contact_sensor_state',
    service: 'contact_sensor',
    code: FEATURE_CODES.OPENING,
    category: DEVICE_FEATURE_CATEGORIES.OPENING_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    kind: 'binary',
  },
  {
    capability: 'check_water_sensor_state',
    service: 'water_sensor',
    code: FEATURE_CODES.WATER_LEAK,
    category: DEVICE_FEATURE_CATEGORIES.LEAK_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    kind: 'binary',
  },
  {
    capability: 'check_battery_health',
    service: 'battery_health',
    code: FEATURE_CODES.BATTERY_LOW,
    category: DEVICE_FEATURE_CATEGORIES.BATTERY_LOW,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    kind: 'battery',
  },
];

function toNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Map a raw Enki sensor value to a Gladys state, per the descriptor kind.
 * @param {object} descriptor sensor descriptor (from the capability profile)
 * @param {*} raw the Enki lastReportedValue
 * @returns {number|null} the Gladys state, or null when unknown
 */
export function mapSensorValue(descriptor, raw) {
  if (descriptor.kind === 'number') {
    return toNumber(raw);
  }
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : raw;
  if (descriptor.kind === 'battery') {
    if (BATTERY_LOW_STATES.has(value)) return 1;
    if (BATTERY_OK_STATES.has(value)) return 0;
    return null;
  }
  // binary
  if (BINARY_TRUE_STATES.has(value)) return 1;
  if (BINARY_FALSE_STATES.has(value)) return 0;
  return null;
}

/**
 * Build the Gladys features for the sensor descriptors of a profile.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @returns {Array<object>} sensor features
 */
export function buildSensorFeatures(ids, profile) {
  return (profile.sensors || []).map((sensor) => {
    const feature = {
      external_id: ids.feature(sensor.code),
      read_only: true,
      has_feedback: false,
      keep_history: true,
      category: sensor.category,
      type: sensor.type,
    };
    if (sensor.kind === 'number') {
      feature.min = sensor.min;
      feature.max = sensor.max;
      if (sensor.unit) {
        feature.unit = sensor.unit;
      }
    } else {
      feature.min = 0;
      feature.max = 1;
    }
    return feature;
  });
}

/**
 * Build the Gladys states of a profile's sensors from raw reads keyed by code.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @param {Record<string, *>} rawByCode raw lastReportedValue keyed by feature code
 * @returns {Array<object>} states (unknown values dropped by the caller)
 */
export function buildSensorStates(ids, profile, rawByCode) {
  return (profile.sensors || []).map((sensor) => ({
    device_feature_external_id: ids.feature(sensor.code),
    state: mapSensorValue(sensor, rawByCode[sensor.code]),
  }));
}
