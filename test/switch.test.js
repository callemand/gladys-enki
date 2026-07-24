import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfile } from '../src/devices/capabilities.js';
import {
  buildSwitchFeatures,
  buildSwitchStates,
  isSwitchFeature,
  normalizePower,
  switchCommandValue,
} from '../src/devices/switch.js';
import { REFERENTIEL } from './fixtures.js';
import { fakeIds } from './helpers.js';

const outlet = buildProfile(REFERENTIEL.NODON_OUTLET);
const ids = fakeIds('enki', 'outlet-1');

test('normalizePower handles string and single-endpoint map', () => {
  assert.equal(normalizePower('ON'), 'ON');
  assert.equal(normalizePower('off'), 'OFF');
  assert.equal(normalizePower({ 1: 'ON' }), 'ON');
  assert.equal(normalizePower({ 1: 'ON', 2: 'OFF' }), null); // multi-endpoint: ambiguous
  assert.equal(normalizePower(null), null);
});

test('buildSwitchFeatures exposes a single binary power feature', () => {
  const features = buildSwitchFeatures(ids, outlet);
  assert.equal(features.length, 1);
  assert.equal(features[0].external_id, ids.feature('switch-binary'));
  assert.equal(features[0].category, 'switch');
});

test('buildSwitchStates maps ON/OFF to 1/0', () => {
  assert.deepEqual(buildSwitchStates(ids, outlet, 'ON'), [
    { device_feature_external_id: ids.feature('switch-binary'), state: 1 },
  ]);
  assert.deepEqual(buildSwitchStates(ids, outlet, 'OFF'), [
    { device_feature_external_id: ids.feature('switch-binary'), state: 0 },
  ]);
  assert.equal(buildSwitchStates(ids, outlet, 'weird')[0].state, null);
});

test('command + feature helpers', () => {
  assert.equal(isSwitchFeature('switch-binary'), true);
  assert.equal(isSwitchFeature('brightness'), false);
  assert.equal(switchCommandValue(1), 'ON');
  assert.equal(switchCommandValue(0), 'OFF');
});
