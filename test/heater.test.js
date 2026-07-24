import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfile } from '../src/devices/capabilities.js';
import {
  buildHeaterFeatures,
  buildHeaterStates,
  gladysToPilotWire,
  isHeaterFeature,
  pilotWireToGladys,
} from '../src/devices/heater.js';
import { PILOT_WIRE_MODE } from '../src/constants.js';
import { REFERENTIEL } from './fixtures.js';
import { fakeIds } from './helpers.js';

const thermostat = buildProfile(REFERENTIEL.EQUATION_HEATER);
const pilot = buildProfile(REFERENTIEL.LEXMAN_PILOT);
const ids = fakeIds('enki', 'heater-1');

test('buildProfile detects thermostat vs pilot-wire heaters', () => {
  assert.equal(thermostat.isHeater, true);
  assert.equal(thermostat.supportsTargetTemperature, true);
  assert.equal(thermostat.supportsPilotWire, false);
  assert.deepEqual(thermostat.thermostatRange, { min: 7, max: 28 });
  assert.equal(pilot.isHeater, true);
  assert.equal(pilot.supportsPilotWire, true);
  assert.equal(pilot.supportsTargetTemperature, false);
});

test('pilot-wire enum maps 1:1 by name to the Gladys enum', () => {
  assert.equal(pilotWireToGladys('COMFORT'), PILOT_WIRE_MODE.COMFORT);
  assert.equal(pilotWireToGladys('frost_protection'), PILOT_WIRE_MODE.FROST_PROTECTION);
  assert.equal(pilotWireToGladys('nope'), null);
  assert.equal(gladysToPilotWire(PILOT_WIRE_MODE.ECO), 'ECO');
  assert.equal(gladysToPilotWire(PILOT_WIRE_MODE.OFF), 'OFF');
  assert.throws(() => gladysToPilotWire(99), /pilot-wire/);
});

test('buildHeaterFeatures: thermostat target temperature with the referentiel range', () => {
  const features = buildHeaterFeatures(ids, thermostat);
  assert.deepEqual(
    features.map((f) => f.external_id.split(':').pop()),
    ['target-temperature'],
  );
  assert.equal(features[0].category, 'thermostat');
  assert.equal(features[0].min, 7);
  assert.equal(features[0].max, 28);
  assert.equal(features[0].unit, 'celsius');
});

test('buildHeaterFeatures: pilot-wire mode 0..5', () => {
  const features = buildHeaterFeatures(fakeIds('enki', 'pilot-1'), pilot);
  assert.deepEqual(
    features.map((f) => f.external_id.split(':').pop()),
    ['pilot-wire-mode'],
  );
  assert.equal(features[0].category, 'heater');
  assert.equal(features[0].min, 0);
  assert.equal(features[0].max, 5);
});

test('buildHeaterStates maps target temperature and pilot wire', () => {
  assert.deepEqual(buildHeaterStates(ids, thermostat, { targetTemperature: 19.5 }), [
    { device_feature_external_id: ids.feature('target-temperature'), state: 19.5 },
  ]);
  const pilotIds = fakeIds('enki', 'pilot-1');
  assert.deepEqual(buildHeaterStates(pilotIds, pilot, { pilotWire: 'COMFORT' }), [
    {
      device_feature_external_id: pilotIds.feature('pilot-wire-mode'),
      state: PILOT_WIRE_MODE.COMFORT,
    },
  ]);
});

test('isHeaterFeature recognises heating feature codes', () => {
  assert.equal(isHeaterFeature('target-temperature'), true);
  assert.equal(isHeaterFeature('pilot-wire-mode'), true);
  assert.equal(isHeaterFeature('brightness'), false);
});
