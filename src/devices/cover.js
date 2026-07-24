// -----------------------------------------------------------------------------
// Enki roller shutters <-> Gladys SHUTTER feature.
//
// Position-based covers driven by the motorization service (api-enki-rolling-prod):
//   - GET  .../check-shutter-position         -> 0..100
//   - POST .../change-shutter-position         { value: 0..100 }
//   - POST .../stop-change-shutter-position    (no body) — optional stop
//
// Gladys SHUTTER.POSITION is 0..100 (0 = closed, 100 = open), matching Enki.
// Covers that only expose switch_roller_shutter (open/close/stop, no position)
// are not handled in this version.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

import { FEATURE_CODES } from '../constants.js';

function toNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Clamp a position into the 0..100 range.
 * @param {number} value requested position
 * @returns {number} clamped position
 */
export function clampPosition(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Build the Gladys SHUTTER features of a roller shutter.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @returns {Array<object>} cover features
 */
export function buildCoverFeatures(ids, profile) {
  if (!profile.isCover) {
    return [];
  }
  const features = [
    {
      name: 'Position',
      external_id: ids.feature(FEATURE_CODES.SHUTTER_POSITION),
      read_only: false,
      has_feedback: true,
      min: 0,
      max: 100,
      category: DEVICE_FEATURE_CATEGORIES.SHUTTER,
      type: DEVICE_FEATURE_TYPES.SHUTTER.POSITION,
    },
  ];
  if (profile.supportsShutterStop) {
    features.push({
      name: 'State',
      external_id: ids.feature(FEATURE_CODES.SHUTTER_STOP),
      read_only: false,
      has_feedback: false,
      min: 0,
      max: 1,
      category: DEVICE_FEATURE_CATEGORIES.SHUTTER,
      type: DEVICE_FEATURE_TYPES.SHUTTER.STATE,
    });
  }
  return features;
}

/**
 * Build the Gladys states of the cover from a position read.
 * @param {object} ids external ids `{ device, feature(code) }`
 * @param {object} profile capability profile
 * @param {*} positionValue check-shutter-position lastReportedValue
 * @returns {Array<object>} states (unknown values dropped by the caller)
 */
export function buildCoverStates(ids, profile, positionValue) {
  if (!profile.isCover) {
    return [];
  }
  const position = toNumber(positionValue);
  return [
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.SHUTTER_POSITION),
      state: position === null ? null : clampPosition(position),
    },
  ];
}

/**
 * Whether a feature code is a cover feature.
 * @param {string} featureCode last segment of the feature external id
 * @returns {boolean}
 */
export function isCoverFeature(featureCode) {
  return (
    featureCode === FEATURE_CODES.SHUTTER_POSITION || featureCode === FEATURE_CODES.SHUTTER_STOP
  );
}
