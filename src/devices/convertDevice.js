// -----------------------------------------------------------------------------
// Convert a discovered Enki node into a Gladys discovered-device payload.
//
// External id scheme (built with gladys.externalIds(), mandatory prefix
// `ext:<selector>:`):
//   device  -> ext:<selector>:enki:<nodeId>
//   feature -> ext:<selector>:enki:<nodeId>:<featureCode>
//
// A node can be a bulb, a ceiling fan, or a fan+light kit — one Gladys device
// carries every feature the node supports (LIGHT and/or FAN).
//
// The Enki homeId and the capability profile are stored as device params: the
// Gladys core sends the params back with every poll / set-value command, so the
// poll handler needs no extra referentiel call.
// -----------------------------------------------------------------------------

import { ENKI_SLUG, PARAM_HOME_ID, PARAM_META, POLL_FREQUENCY } from '../constants.js';
import { buildLightFeatures } from './light.js';
import { buildFanFeatures } from './fan.js';
import { buildSwitchFeatures } from './switch.js';
import { buildCoverFeatures } from './cover.js';
import { buildSensorFeatures } from './sensors.js';
import { buildHeaterFeatures } from './heater.js';

/**
 * Build the external ids (device + feature factory) of an Enki node.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {string} nodeId Enki node id
 * @returns {{ device: string, feature: (code: string) => string }}
 */
export function enkiExternalIds(gladys, nodeId) {
  return gladys.externalIds(ENKI_SLUG, String(nodeId));
}

/**
 * Stamp an explicit, globally-unique selector on each feature.
 *
 * A Gladys device-feature `selector` is UNIQUE across the whole instance. When
 * a feature is published without one, Gladys derives it from the name
 * (e.g. "Power" -> "power"), which collides with any other device/integration
 * exposing a feature with the same name. Basing it on the already-unique
 * external_id (Gladys slugifies it, e.g. "ext-enki-enki-<nodeId>-power") keeps
 * it globally unique.
 * @param {Array} features Gladys features (each with an external_id)
 * @returns {Array} the same features, each carrying a unique `selector`
 */
function withFeatureSelectors(features) {
  return features.map((feature) => ({ ...feature, selector: feature.external_id }));
}

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} node discovered node `{ nodeId, homeId, name, model, profile }`
 * @returns {object} Gladys discovered device
 */
export function convertDevice(gladys, node) {
  const ids = enkiExternalIds(gladys, node.nodeId);
  const features = withFeatureSelectors([
    ...buildFanFeatures(ids, node.profile),
    ...buildLightFeatures(ids, node.profile),
    ...buildSwitchFeatures(ids, node.profile),
    ...buildCoverFeatures(ids, node.profile),
    ...buildHeaterFeatures(ids, node.profile),
    ...buildSensorFeatures(ids, node.profile),
  ]);

  return {
    name: node.name || String(node.nodeId),
    external_id: ids.device,
    model: node.model || null,
    poll_frequency: POLL_FREQUENCY,
    should_poll: true,
    features,
    params: [
      { name: PARAM_HOME_ID, value: String(node.homeId) },
      { name: PARAM_META, value: JSON.stringify(node.profile) },
    ],
  };
}

/**
 * Read the Enki homeId stored in the device params.
 * @param {object} device Gladys device (as sent with poll / set-value commands)
 * @returns {string} the homeId
 */
export function getHomeId(device) {
  const param = (device.params || []).find(({ name }) => name === PARAM_HOME_ID);
  if (!param) {
    throw new Error(`Enki device "${device.external_id}" has no "${PARAM_HOME_ID}" param`);
  }
  return param.value;
}

/**
 * Read the capability profile stored in the device params.
 * @param {object} device Gladys device
 * @returns {object} the capability profile
 */
export function getProfile(device) {
  const param = (device.params || []).find(({ name }) => name === PARAM_META);
  if (!param) {
    throw new Error(`Enki device "${device.external_id}" has no "${PARAM_META}" param`);
  }
  return JSON.parse(param.value);
}
