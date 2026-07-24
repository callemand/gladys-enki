// -----------------------------------------------------------------------------
// Turn an Enki referentiel device (capabilities + possibleValues) into a small
// capability profile that drives feature building AND polling.
//
// Referentiel capability names use underscores ("change_light_state"); the HTTP
// action paths use hyphens ("change-light-state"). possibleValues is keyed by
// the same underscore names and carries ranges / value lists, e.g.:
//   { "change_brightness": { "range": { "min": 1, "max": 100 } },
//     "change_color_temperature": { "values": ["T2700K", "T4000K", "T6500K"] } }
//
// The resulting profile is JSON-serialisable and stored as a device param so
// the poll handler can rebuild it without another referentiel call.
// -----------------------------------------------------------------------------

import { DEFAULT_BRIGHTNESS_MAX, DEFAULT_THERMOSTAT_RANGE } from '../constants.js';
import { SENSOR_READS } from './sensors.js';

/**
 * Parse the thermostat setpoint bounds (°C) from possibleValues.
 * @param {object} possibleValues referentiel possibleValues
 * @returns {{ min: number, max: number }} setpoint bounds
 */
function parseThermostatRange(possibleValues) {
  const range = possibleValues?.change_thermostat_target_temperature?.range;
  const min = Number.isFinite(range?.min) ? Number(range.min) : DEFAULT_THERMOSTAT_RANGE.MIN;
  const max = Number.isFinite(range?.max) ? Number(range.max) : DEFAULT_THERMOSTAT_RANGE.MAX;
  return { min, max };
}

/**
 * Build the read-only sensor descriptors a device exposes, from its capability
 * set. Deduplicates by feature code (some models advertise two capabilities for
 * the same reading, e.g. motion) and captures each sensor's numeric range.
 * @param {Set<string>} caps capability names present on the device
 * @param {object} possibleValues referentiel possibleValues
 * @returns {Array<object>} sensor descriptors (JSON-serialisable)
 */
function buildSensorDescriptors(caps, possibleValues) {
  const seen = new Set();
  const descriptors = [];
  for (const read of SENSOR_READS) {
    if (!caps.has(read.capability) || seen.has(read.code)) {
      continue;
    }
    seen.add(read.code);
    const range = possibleValues?.[read.capability]?.range;
    descriptors.push({
      code: read.code,
      capability: read.capability,
      service: read.service,
      category: read.category,
      type: read.type,
      unit: read.unit,
      kind: read.kind,
      min: Number.isFinite(range?.min) ? Number(range.min) : read.defaultMin,
      max: Number.isFinite(range?.max) ? Number(range.max) : read.defaultMax,
    });
  }
  return descriptors;
}

/**
 * Build the set of capability names advertised by a referentiel device (from
 * both the `capabilities` list and the `possibleValues` keys).
 * @param {object|null} referentiel referentiel device (may be null)
 * @returns {{ caps: Set<string>, possibleValues: object }}
 */
function readCapabilities(referentiel) {
  const device = referentiel || {};
  const caps = new Set();
  const list = device.capabilities;
  if (Array.isArray(list)) {
    list.forEach((cap) => typeof cap === 'string' && caps.add(cap));
  } else if (list && typeof list === 'object') {
    Object.keys(list).forEach((cap) => caps.add(cap));
  }
  const possibleValues =
    device.possibleValues && typeof device.possibleValues === 'object' ? device.possibleValues : {};
  Object.keys(possibleValues).forEach((cap) => caps.add(cap));
  return { caps, possibleValues };
}

/**
 * Parse the color-temperature kelvin values from possibleValues. Enki lists
 * them as "T2700K" strings.
 * @param {object} possibleValues referentiel possibleValues
 * @returns {Array<number>} sorted kelvin values (empty if none)
 */
function parseColorTempKelvins(possibleValues) {
  const values = possibleValues?.change_color_temperature?.values;
  if (!Array.isArray(values)) {
    return [];
  }
  const kelvins = values
    .map((value) => Number(String(value).replace(/[^0-9]/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(kelvins)].sort((a, b) => a - b);
}

/**
 * Parse the max brightness advertised by the referentiel (Enki brightness
 * scale, e.g. 100 or 254). Defaults to DEFAULT_BRIGHTNESS_MAX.
 * @param {object} possibleValues referentiel possibleValues
 * @returns {number} max brightness
 */
function parseBrightnessMax(possibleValues) {
  const max = possibleValues?.change_brightness?.range?.max;
  return Number.isFinite(max) && max > 0 ? Number(max) : DEFAULT_BRIGHTNESS_MAX;
}

/**
 * Build the capability profile of an Enki device from its referentiel.
 * @param {object|null} referentiel referentiel device (may be null for ESDK fans)
 * @returns {object} profile (JSON-serialisable)
 */
export function buildProfile(referentiel) {
  const { caps, possibleValues } = readCapabilities(referentiel);
  const has = (...names) => names.some((name) => caps.has(name));

  const isFan = has('change_fan_speed', 'check_fan_speed');
  const isLight = has('change_light_state', 'check_light_state');
  const isCover = has('change_shutter_position', 'check_shutter_position');
  const supportsTargetTemperature = has('change_thermostat_target_temperature');
  const supportsPilotWire = has('switch_pilot_wire_mode');
  const isHeater = supportsTargetTemperature || supportsPilotWire;
  // A pure outlet / relay: switchable power, but not a light, fan, cover or
  // heater (those expose their own controls through richer features).
  const isSwitch = has('switch_electrical_power') && !isLight && !isFan && !isCover && !isHeater;

  return {
    isFan,
    isLight,
    isCover,
    isSwitch,
    isHeater,
    supportsBrightness: isLight && has('change_brightness'),
    supportsColorTemperature: isLight && has('change_color_temperature'),
    // Enki RGB bulbs expose color via change_hue + change_saturation (0..1
    // floats in the light state), not a single change_color capability.
    supportsColor: isLight && has('change_hue', 'change_saturation'),
    supportsRotation: isFan && has('change_fan_rotation_direction', 'check_fan_rotation_direction'),
    supportsShutterStop: isCover && has('stop_change_shutter_position'),
    supportsTargetTemperature,
    supportsPilotWire,
    thermostatRange: parseThermostatRange(possibleValues),
    brightnessMax: parseBrightnessMax(possibleValues),
    colorTempKelvins: parseColorTempKelvins(possibleValues),
    sensors: buildSensorDescriptors(caps, possibleValues),
  };
}

/**
 * Whether this integration exposes the device at all.
 * @param {object} profile capability profile
 * @returns {boolean}
 */
export function isSupported(profile) {
  return Boolean(
    profile.isFan ||
    profile.isLight ||
    profile.isCover ||
    profile.isSwitch ||
    profile.isHeater ||
    (profile.sensors && profile.sensors.length > 0),
  );
}
