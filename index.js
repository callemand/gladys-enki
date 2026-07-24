// -----------------------------------------------------------------------------
// Entry point of the Gladys Enki (Leroy Merlin) external integration.
//
//   - logs in to the Enki cloud with the credentials from the integration config;
//   - discovers the account's lights and ceiling fans as Gladys devices;
//   - answers Gladys polls with the current device state;
//   - forwards user commands to the Enki micro-services (lighting / airflow).
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';

import { FEATURE_CODES } from './src/constants.js';
import { normalizeConfig } from './src/config.js';
import { EnkiClient } from './src/enki/client.js';
import { buildProfile, isSupported } from './src/devices/capabilities.js';
import {
  convertDevice,
  enkiExternalIds,
  getHomeId,
  getProfile,
} from './src/devices/convertDevice.js';
import { buildLightChange, buildLightStates, mergeLightPayload } from './src/devices/light.js';
import { buildFanStates, directionToRotation, percentToSpeed } from './src/devices/fan.js';
import { buildSwitchStates, isSwitchFeature, switchCommandValue } from './src/devices/switch.js';
import { buildCoverStates, clampPosition } from './src/devices/cover.js';
import { buildSensorStates } from './src/devices/sensors.js';
import { buildHeaterStates, gladysToPilotWire } from './src/devices/heater.js';

const gladys = new GladysIntegration();
const enki = new EnkiClient();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

/**
 * Split a device external id (`ext:<selector>:enki:<nodeId>`) into the Enki
 * node id.
 * @param {string} externalId device external id
 * @returns {string} the Enki node id
 */
function parseNodeId(externalId) {
  const prefix = gladys.externalId('');
  if (!externalId || !externalId.startsWith(prefix)) {
    throw new Error(
      `Enki device external_id is invalid: "${externalId}" should start with "${prefix}"`,
    );
  }
  const parts = externalId.slice(prefix.length).split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Enki device external_id is invalid: "${externalId}" should be "${prefix}enki:<nodeId>"`,
    );
  }
  return parts[1];
}

/**
 * Log in to Enki with the current config. Returns false (without throwing) when
 * the credentials are not filled in yet.
 * @returns {Promise<boolean>} whether the client is logged in
 */
async function connectToEnki() {
  if (!config.email || !config.password) {
    enki.logout();
    logger.warn(
      'Enki is not configured yet: fill in the email and password in the integration settings',
    );
    return false;
  }
  await enki.login(config.email, config.password);
  return true;
}

/**
 * Discover every supported Enki node (lights + ceiling fans) across all homes.
 * @returns {Promise<Array<object>>} discovered nodes ready for convertDevice
 */
async function discoverNodes() {
  const homes = await enki.listHomes();
  const nodes = [];
  for (const homeId of homes) {
    const items = await enki.listDashboardItems(homeId);
    const discovered = await Promise.all(
      items
        .filter((item) => item.metadata && item.metadata.nodeId && item.metadata.deviceId)
        .map(async (item) => {
          const { nodeId, deviceId } = item.metadata;
          const referentiel = await enki.getReferentielDevice(deviceId);
          const profile = buildProfile(referentiel);
          if (!isSupported(profile)) {
            return null;
          }
          return {
            nodeId,
            homeId,
            name: (item.title && item.title.label) || nodeId,
            model: (referentiel && (referentiel.modelNumber || referentiel.reference)) || null,
            profile,
          };
        }),
    );
    nodes.push(...discovered.filter(Boolean));
  }
  return nodes;
}

/**
 * Load the Enki devices and publish them as discovered devices.
 */
async function publishDevices() {
  const nodes = await discoverNodes();
  logger.info(`${nodes.length} Enki device(s) found (lights + ceiling fans)`);
  await gladys.publishDiscoveredDevices(nodes.map((node) => convertDevice(gladys, node)));
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> loading Enki devices');
  if (!enki.isLoggedIn() && !(await connectToEnki())) {
    throw new Error('Enki is not configured');
  }
  await publishDevices();
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  const nodeId = parseNodeId(device.external_id);
  const homeId = getHomeId(device);
  const profile = getProfile(device);
  const featureCode = feature.external_id.split(':').pop();

  if (featureCode === FEATURE_CODES.FAN_SPEED) {
    await enki.airflowPost(homeId, nodeId, 'change-fan-speed', percentToSpeed(value));
    return;
  }
  if (featureCode === FEATURE_CODES.AIRFLOW_DIRECTION) {
    await enki.airflowPost(
      homeId,
      nodeId,
      'change-fan-rotation-direction',
      directionToRotation(value),
    );
    return;
  }
  if (isSwitchFeature(featureCode)) {
    await enki.switchElectricalPower(homeId, nodeId, switchCommandValue(value));
    return;
  }
  if (featureCode === FEATURE_CODES.SHUTTER_POSITION) {
    await enki.shutterPost(homeId, nodeId, 'change-shutter-position', clampPosition(value));
    return;
  }
  if (featureCode === FEATURE_CODES.SHUTTER_STOP) {
    await enki.shutterPost(homeId, nodeId, 'stop-change-shutter-position');
    return;
  }
  if (featureCode === FEATURE_CODES.TARGET_TEMPERATURE) {
    await enki.setThermostatTargetTemperature(homeId, nodeId, value);
    return;
  }
  if (featureCode === FEATURE_CODES.PILOT_WIRE_MODE) {
    await enki.thermostatPost(homeId, nodeId, 'switch-pilot-wire-mode', gladysToPilotWire(value));
    return;
  }

  const change = buildLightChange(featureCode, value, profile);
  if (!change) {
    throw new Error(`Enki feature "${feature.external_id}" is not controllable`);
  }
  const current = await enki.getLightState(homeId, nodeId);
  await enki.changeLightState(homeId, nodeId, mergeLightPayload(current, change));
});

// --- Polling: Gladys asks to refresh a device --------------------------------
gladys.onPoll(async (device) => {
  const nodeId = parseNodeId(device.external_id);
  const homeId = getHomeId(device);
  const profile = getProfile(device);
  const ids = enkiExternalIds(gladys, nodeId);
  const states = [];

  if (profile.isFan) {
    const [speedData, rotationData] = await Promise.all([
      enki.airflowGet(homeId, nodeId, 'check-fan-speed'),
      profile.supportsRotation
        ? enki.airflowGet(homeId, nodeId, 'check-fan-rotation-direction')
        : Promise.resolve(null),
    ]);
    states.push(
      ...buildFanStates(ids, profile, {
        speed: speedData ? speedData.lastReportedValue : null,
        rotation: rotationData ? rotationData.lastReportedValue : null,
      }),
    );
  }

  if (profile.isLight) {
    const lightState = await enki.getLightState(homeId, nodeId);
    states.push(...buildLightStates(ids, profile, lightState));
  }

  if (profile.isSwitch) {
    const power = await enki.getElectricalPower(homeId, nodeId);
    states.push(...buildSwitchStates(ids, profile, power));
  }

  if (profile.isCover) {
    const positionData = await enki.shutterGet(homeId, nodeId, 'check-shutter-position');
    states.push(
      ...buildCoverStates(ids, profile, positionData ? positionData.lastReportedValue : null),
    );
  }

  if (profile.isHeater) {
    const [targetTemperature, pilotWire] = await Promise.all([
      profile.supportsTargetTemperature
        ? enki.sensorGet('thermostat', homeId, nodeId, 'check_thermostat_target_temperature')
        : Promise.resolve(null),
      profile.supportsPilotWire
        ? enki.sensorGet('thermostat', homeId, nodeId, 'check_pilot_wire_state')
        : Promise.resolve(null),
    ]);
    states.push(...buildHeaterStates(ids, profile, { targetTemperature, pilotWire }));
  }

  if (profile.sensors && profile.sensors.length > 0) {
    const rawByCode = {};
    await Promise.all(
      profile.sensors.map(async (sensor) => {
        rawByCode[sensor.code] = await enki.sensorGet(
          sensor.service,
          homeId,
          nodeId,
          sensor.capability,
        );
      }),
    );
    states.push(...buildSensorStates(ids, profile, rawByCode));
  }

  const publishable = states.filter((state) => state.state !== null && state.state !== undefined);
  if (publishable.length > 0) {
    await gladys.publishStates(publishable);
  }
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> reconnecting to Enki');
  config = normalizeConfig(newConfig);
  try {
    if (await connectToEnki()) {
      await publishDevices();
    }
  } catch (err) {
    logger.error('Reconnection to Enki failed', err);
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  logger.info('WebSocket connected to Gladys');
  try {
    config = normalizeConfig(await gladys.getConfig());
    if (await connectToEnki()) {
      await publishDevices();
    }
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
  }
});

gladys.on('disconnected', () => {
  logger.warn('WebSocket disconnected - the SDK will try to reconnect');
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Enki integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
