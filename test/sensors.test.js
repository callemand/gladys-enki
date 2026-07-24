import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfile } from '../src/devices/capabilities.js';
import { buildSensorFeatures, buildSensorStates, mapSensorValue } from '../src/devices/sensors.js';
import { REFERENTIEL } from './fixtures.js';
import { fakeIds } from './helpers.js';

const multi = buildProfile(REFERENTIEL.LEXMAN_MULTI);
const ids = fakeIds('enki', 'sensor-1');

test('mapSensorValue: numbers, binary enums and battery health', () => {
  const num = { kind: 'number' };
  const bin = { kind: 'binary' };
  const bat = { kind: 'battery' };
  assert.equal(mapSensorValue(num, 21.5), 21.5);
  assert.equal(mapSensorValue(num, null), null);
  assert.equal(mapSensorValue(bin, 'MOTION_DETECTED'), 1);
  assert.equal(mapSensorValue(bin, 'NO_MOTION_DETECTED'), 0);
  assert.equal(mapSensorValue(bin, 'OPENED'), 1);
  assert.equal(mapSensorValue(bin, 'CLOSED'), 0);
  assert.equal(mapSensorValue(bin, 'WHATEVER'), null);
  assert.equal(mapSensorValue(bat, 'GOOD'), 0);
  assert.equal(mapSensorValue(bat, 'REPLACE'), 1);
  assert.equal(mapSensorValue(bat, 'LOW'), 1);
  assert.equal(mapSensorValue(bat, 'UNKNOWN'), null);
});

test('buildSensorFeatures builds one read-only feature per descriptor', () => {
  const features = buildSensorFeatures(ids, multi);
  assert.deepEqual(
    features.map((f) => f.external_id.split(':').pop()),
    ['temperature', 'humidity', 'motion', 'battery-low'],
  );
  features.forEach((f) => assert.equal(f.read_only, true));
  const temp = features.find((f) => f.external_id.endsWith(':temperature'));
  assert.equal(temp.unit, 'celsius');
  assert.equal(temp.min, 0);
  assert.equal(temp.max, 40);
  const motion = features.find((f) => f.external_id.endsWith(':motion'));
  assert.equal(motion.min, 0);
  assert.equal(motion.max, 1);
});

test('buildSensorStates maps raw reads keyed by code', () => {
  const states = buildSensorStates(ids, multi, {
    temperature: 21.5,
    humidity: 55,
    motion: 'MOTION_DETECTED',
    'battery-low': 'GOOD',
  });
  assert.deepEqual(states, [
    { device_feature_external_id: ids.feature('temperature'), state: 21.5 },
    { device_feature_external_id: ids.feature('humidity'), state: 55 },
    { device_feature_external_id: ids.feature('motion'), state: 1 },
    { device_feature_external_id: ids.feature('battery-low'), state: 0 },
  ]);
});
