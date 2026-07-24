import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfile } from '../src/devices/capabilities.js';
import {
  buildLightChange,
  buildLightFeatures,
  buildLightStates,
  hsbToRgb,
  intToRgb,
  kelvinToMired,
  mergeLightPayload,
  miredToKelvin,
  nearestKelvin,
  rgbToHsb,
  rgbToInt,
} from '../src/devices/light.js';
import { REFERENTIEL } from './fixtures.js';
import { fakeIds } from './helpers.js';

const bulb = buildProfile(REFERENTIEL.LEXMAN_BULB);
const ids = fakeIds('enki', 'bulb-1');

test('mired <-> kelvin round-trips', () => {
  assert.equal(kelvinToMired(2700), 370);
  assert.equal(kelvinToMired(6500), 154);
  assert.equal(miredToKelvin(370), 2703);
});

test('nearestKelvin snaps to the closest available value', () => {
  assert.equal(nearestKelvin([2700, 4000, 6500], 2703), 2700);
  assert.equal(nearestKelvin([2700, 4000, 6500], 5000), 4000);
});

test('rgb/int/hsb color round-trips (pure red)', () => {
  assert.deepEqual(intToRgb(0xff0000), [255, 0, 0]);
  assert.deepEqual(rgbToHsb([255, 0, 0]), [0, 100, 100]);
  assert.deepEqual(hsbToRgb([0, 100, 100]), [255, 0, 0]);
  assert.equal(rgbToInt([255, 0, 0]), 0xff0000);
});

test('buildLightFeatures exposes binary + brightness + temperature (in mireds)', () => {
  const features = buildLightFeatures(ids, bulb);
  const byCode = Object.fromEntries(features.map((f) => [f.external_id.split(':').pop(), f]));
  assert.deepEqual(Object.keys(byCode), ['light-binary', 'brightness', 'light-temperature']);
  assert.equal(byCode.brightness.max, 100);
  // Coldest kelvin (6500) is the smallest mired.
  assert.equal(byCode['light-temperature'].min, kelvinToMired(6500));
  assert.equal(byCode['light-temperature'].max, kelvinToMired(2700));
});

test('buildLightStates maps an ON tunable-white state', () => {
  const states = buildLightStates(ids, bulb, {
    power: 'ON',
    brightness: 0.8, // Enki 0..1 float -> 80 %
    colorTemperature: 'T2700K',
  });
  assert.deepEqual(states, [
    { device_feature_external_id: ids.feature('light-binary'), state: 1 },
    { device_feature_external_id: ids.feature('brightness'), state: 80 },
    { device_feature_external_id: ids.feature('light-temperature'), state: kelvinToMired(2700) },
  ]);
});

test('buildLightChange: binary on/off', () => {
  assert.deepEqual(buildLightChange('light-binary', 1, bulb), { power: 'ON' });
  assert.deepEqual(buildLightChange('light-binary', 0, bulb), { power: 'OFF' });
});

test('buildLightChange: brightness turns off at 0', () => {
  // 60 % of the 0..1 Enki scale -> 0.6.
  assert.deepEqual(buildLightChange('brightness', 60, bulb), { power: 'ON', brightness: 0.6 });
  assert.deepEqual(buildLightChange('brightness', 0, bulb), { power: 'OFF' });
});

test('buildLightChange: color temperature snaps to nearest kelvin', () => {
  const change = buildLightChange('light-temperature', kelvinToMired(2700), bulb);
  assert.deepEqual(change, { power: 'ON', colorTemperature: 'T2700K', colorMode: 'ct' });
});

test('buildLightChange: unknown feature returns null', () => {
  assert.equal(buildLightChange('fan-speed', 1, bulb), null);
});

test('mergeLightPayload keeps the full state and forces power ON', () => {
  const current = { power: 'OFF', brightness: 50, colorTemperature: 'T4000K', colorMode: 'ct' };
  const merged = mergeLightPayload(current, { brightness: 90 });
  assert.deepEqual(merged, {
    power: 'ON',
    brightness: 90,
    colorTemperature: 'T4000K',
    colorMode: 'ct',
  });
});

test('mergeLightPayload drops the stale color mode on an hs change', () => {
  const current = { power: 'ON', colorTemperature: 'T4000K', colorMode: 'ct' };
  const merged = mergeLightPayload(current, { colorMode: 'hs', hue: 0.5, saturation: 1 });
  assert.equal(merged.colorTemperature, undefined);
  assert.equal(merged.colorMode, 'hs');
});

test('brightness scales to a non-100 device max', () => {
  const profile = { ...bulb, brightnessMax: 254 };
  assert.deepEqual(buildLightChange('brightness', 50, profile), { power: 'ON', brightness: 127 });
  const [state] = buildLightStates(ids, profile, { power: 'ON', brightness: 127 }).filter((s) =>
    s.device_feature_external_id.endsWith(':brightness'),
  );
  assert.equal(state.state, 50);
});
