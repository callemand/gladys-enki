// -----------------------------------------------------------------------------
// Enki airflow (ceiling fans) <-> Gladys FAN features.
//
//   - Speed: api-enki-airflow-prod check-fan-speed / change-fan-speed.
//     Enki speed is 0 (off) .. 6; mapped to the Gladys FAN.PERCENT feature
//     (0..100), so a single feature does on/off AND speed.
//   - Blade rotation (optional): check-fan-rotation-direction /
//     change-fan-rotation-direction. CLOCKWISE = forward, COUNTERCLOCKWISE =
//     reverse; mapped to the Gladys FAN.AIRFLOW_DIRECTION feature (0/1).
//
// A ceiling fan node usually also has a light kit — those features are built by
// devices/light.js against the same node.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  ENKI_ROTATION,
  FAN_AIRFLOW_DIRECTION,
  FAN_SPEED_MAX,
  FEATURE_CODES,
} from '../constants.js';

/**
 * Map an Enki fan speed (0..6) to a Gladys percentage (0..100).
 * @param {number} speed Enki fan speed
 * @returns {number} percentage
 */
export function speedToPercent(speed) {
  if (!Number.isFinite(speed) || speed <= 0) {
    return 0;
  }
  return Math.round((speed * 100) / FAN_SPEED_MAX);
}

/**
 * Map a Gladys percentage (0..100) to an Enki fan speed (0..6, 0 = off).
 * @param {number} percent Gladys percentage
 * @returns {number} Enki fan speed
 */
export function percentToSpeed(percent) {
  if (!Number.isFinite(percent) || percent <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(FAN_SPEED_MAX, Math.round((percent * FAN_SPEED_MAX) / 100)));
}

/**
 * Extract a rotation string from an Enki check-fan-rotation-direction value
 * (string, or an object wrapping it).
 * @param {*} value lastReportedValue
 * @returns {string|null} normalized uppercase rotation, or null
 */
function readRotation(value) {
  let raw = value;
  if (raw && typeof raw === 'object') {
    const key = ['rotation', 'rotationDirection', 'bladeDirection', 'direction', 'mode'].find(
      (name) => name in raw,
    );
    raw = key ? raw[key] : null;
  }
  return typeof raw === 'string' ? raw.trim().toUpperCase() : null;
}

/**
 * Map an Enki rotation value to a Gladys FAN_AIRFLOW_DIRECTION (0/1).
 * @param {*} value lastReportedValue of check-fan-rotation-direction
 * @returns {number|null} FORWARD (0), REVERSE (1), or null if unknown
 */
export function rotationToDirection(value) {
  const rotation = readRotation(value);
  if (rotation === null) {
    return null;
  }
  if (['COUNTERCLOCKWISE', 'COUNTER_CLOCKWISE', 'CCW', 'REVERSE', 'WINTER'].includes(rotation)) {
    return FAN_AIRFLOW_DIRECTION.REVERSE;
  }
  if (['CLOCKWISE', 'CW', 'FORWARD', 'SUMMER'].includes(rotation)) {
    return FAN_AIRFLOW_DIRECTION.FORWARD;
  }
  return null;
}

/**
 * Map a Gladys FAN_AIRFLOW_DIRECTION (0/1) to an Enki rotation value.
 * @param {number} direction FORWARD (0) or REVERSE (1)
 * @returns {string} Enki rotation value
 */
export function directionToRotation(direction) {
  return Number(direction) === FAN_AIRFLOW_DIRECTION.REVERSE
    ? ENKI_ROTATION.COUNTERCLOCKWISE
    : ENKI_ROTATION.CLOCKWISE;
}

/**
 * Build the Gladys FAN features advertised by a profile.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile (see capabilities.js)
 * @returns {Array<object>} fan features
 */
export function buildFanFeatures(ids, profile) {
  if (!profile.isFan) {
    return [];
  }
  const features = [
    {
      name: 'Fan speed',
      external_id: ids.feature(FEATURE_CODES.FAN_SPEED),
      read_only: false,
      has_feedback: true,
      min: 0,
      max: 100,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      category: DEVICE_FEATURE_CATEGORIES.FAN,
      type: DEVICE_FEATURE_TYPES.FAN.PERCENT,
    },
  ];

  if (profile.supportsRotation) {
    features.push({
      name: 'Airflow direction',
      external_id: ids.feature(FEATURE_CODES.AIRFLOW_DIRECTION),
      read_only: false,
      has_feedback: true,
      min: FAN_AIRFLOW_DIRECTION.FORWARD,
      max: FAN_AIRFLOW_DIRECTION.REVERSE,
      category: DEVICE_FEATURE_CATEGORIES.FAN,
      type: DEVICE_FEATURE_TYPES.FAN.AIRFLOW_DIRECTION,
    });
  }

  return features;
}

/**
 * Build the Gladys states of the FAN features from raw airflow reads.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @param {{ speed: *, rotation: * }} reads airflow lastReportedValues
 * @returns {Array<object>} states (unknown values dropped by the caller)
 */
export function buildFanStates(ids, profile, { speed, rotation } = {}) {
  if (!profile.isFan) {
    return [];
  }
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.FAN_SPEED),
      state: speed === undefined || speed === null ? null : speedToPercent(Number(speed)),
    },
  ];

  if (profile.supportsRotation) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_CODES.AIRFLOW_DIRECTION),
      state: rotationToDirection(rotation),
    });
  }

  return states;
}
