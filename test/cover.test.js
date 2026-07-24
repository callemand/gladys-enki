import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfile } from '../src/devices/capabilities.js';
import {
  buildCoverFeatures,
  buildCoverStates,
  clampPosition,
  isCoverFeature,
} from '../src/devices/cover.js';
import { REFERENTIEL } from './fixtures.js';
import { fakeIds } from './helpers.js';

const cover = buildProfile(REFERENTIEL.DIO_SHUTTER);
const ids = fakeIds('enki', 'shutter-1');

test('clampPosition constrains to 0..100', () => {
  assert.equal(clampPosition(-5), 0);
  assert.equal(clampPosition(40.6), 41);
  assert.equal(clampPosition(150), 100);
});

test('buildCoverFeatures exposes position + a stop state (when supported)', () => {
  const codes = buildCoverFeatures(ids, cover).map((f) => f.external_id.split(':').pop());
  assert.deepEqual(codes, ['shutter-position', 'shutter-stop']);
});

test('buildCoverFeatures omits stop when unsupported', () => {
  const codes = buildCoverFeatures(ids, { ...cover, supportsShutterStop: false }).map((f) =>
    f.external_id.split(':').pop(),
  );
  assert.deepEqual(codes, ['shutter-position']);
});

test('buildCoverStates maps the position', () => {
  assert.deepEqual(buildCoverStates(ids, cover, 40), [
    { device_feature_external_id: ids.feature('shutter-position'), state: 40 },
  ]);
  assert.equal(buildCoverStates(ids, cover, null)[0].state, null);
});

test('isCoverFeature recognises cover feature codes', () => {
  assert.equal(isCoverFeature('shutter-position'), true);
  assert.equal(isCoverFeature('shutter-stop'), true);
  assert.equal(isCoverFeature('switch-binary'), false);
});
