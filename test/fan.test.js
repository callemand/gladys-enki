import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfile } from '../src/devices/capabilities.js';
import {
  buildFanFeatures,
  buildFanStates,
  directionToRotation,
  percentToSpeed,
  rotationToDirection,
  speedToPercent,
} from '../src/devices/fan.js';
import { FAN_AIRFLOW_DIRECTION } from '../src/constants.js';
import { REFERENTIEL } from './fixtures.js';
import { fakeIds } from './helpers.js';

const fan = buildProfile(REFERENTIEL.AD_TCFL_1);
const ids = fakeIds('enki', 'fan-node-1');

test('speed <-> percent mapping (0..6 <-> 0..100)', () => {
  assert.equal(speedToPercent(0), 0);
  assert.equal(speedToPercent(3), 50);
  assert.equal(speedToPercent(6), 100);
  assert.equal(percentToSpeed(0), 0);
  assert.equal(percentToSpeed(50), 3);
  assert.equal(percentToSpeed(100), 6);
  // A tiny non-zero percentage still turns the fan on (min speed 1).
  assert.equal(percentToSpeed(5), 1);
});

test('rotation mapping', () => {
  assert.equal(rotationToDirection('CLOCKWISE'), FAN_AIRFLOW_DIRECTION.FORWARD);
  assert.equal(rotationToDirection('COUNTERCLOCKWISE'), FAN_AIRFLOW_DIRECTION.REVERSE);
  assert.equal(rotationToDirection({ rotation: 'WINTER' }), FAN_AIRFLOW_DIRECTION.REVERSE);
  assert.equal(rotationToDirection('unknown'), null);
  assert.equal(directionToRotation(FAN_AIRFLOW_DIRECTION.FORWARD), 'CLOCKWISE');
  assert.equal(directionToRotation(FAN_AIRFLOW_DIRECTION.REVERSE), 'COUNTERCLOCKWISE');
});

test('buildFanFeatures exposes speed (percent) + airflow direction', () => {
  const features = buildFanFeatures(ids, fan);
  assert.deepEqual(
    features.map((f) => f.external_id.split(':').pop()),
    ['fan-speed', 'airflow-direction'],
  );
  assert.equal(features[0].max, 100);
});

test('buildFanStates maps raw airflow reads', () => {
  const states = buildFanStates(ids, fan, { speed: 3, rotation: 'CLOCKWISE' });
  assert.deepEqual(states, [
    { device_feature_external_id: ids.feature('fan-speed'), state: 50 },
    {
      device_feature_external_id: ids.feature('airflow-direction'),
      state: FAN_AIRFLOW_DIRECTION.FORWARD,
    },
  ]);
});

test('buildFanStates yields a null speed when the read is missing', () => {
  const [speedState] = buildFanStates(ids, fan, { speed: null, rotation: null });
  assert.equal(speedState.state, null);
});
