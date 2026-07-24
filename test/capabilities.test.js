import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfile, isSupported } from '../src/devices/capabilities.js';
import { REFERENTIEL } from './fixtures.js';

test('buildProfile detects a fan + light kit', () => {
  const profile = buildProfile(REFERENTIEL.AD_TCFL_1);
  assert.equal(profile.isFan, true);
  assert.equal(profile.isLight, true);
  assert.equal(profile.supportsRotation, true);
  assert.equal(profile.supportsBrightness, true);
  assert.equal(profile.supportsColorTemperature, true);
  // Enki brightness is a 0..1 float scale, read from the referentiel.
  assert.equal(profile.brightnessMax, 1);
  assert.deepEqual(profile.colorTempKelvins, [2750, 3500, 4000, 5000, 6500]);
});

test('buildProfile detects a tunable-white bulb and parses its color temp values', () => {
  const profile = buildProfile(REFERENTIEL.LEXMAN_BULB);
  assert.equal(profile.isFan, false);
  assert.equal(profile.isLight, true);
  assert.equal(profile.supportsColorTemperature, true);
  assert.deepEqual(profile.colorTempKelvins, [2700, 4000, 6500]);
});

test('buildProfile detects an RGB bulb via change_hue + change_saturation', () => {
  const profile = buildProfile({
    type: 'lights',
    capabilities: [
      'check_light_state',
      'change_light_state',
      'change_brightness',
      'change_color_temperature',
      'change_hue',
      'change_saturation',
    ],
    possibleValues: { change_brightness: { range: { min: 0, max: 1 } } },
  });
  assert.equal(profile.supportsColor, true);
});

test('buildProfile handles a null referentiel (ESDK 404)', () => {
  const profile = buildProfile(null);
  assert.equal(profile.isFan, false);
  assert.equal(profile.isLight, false);
  assert.equal(isSupported(profile), false);
});

test('buildProfile detects an outlet (switch), not a light/fan/cover', () => {
  const p = buildProfile(REFERENTIEL.NODON_OUTLET);
  assert.equal(p.isSwitch, true);
  assert.equal(p.isLight, false);
  assert.equal(p.isFan, false);
  assert.equal(p.isCover, false);
});

test('buildProfile detects a roller shutter with a stop command', () => {
  const p = buildProfile(REFERENTIEL.DIO_SHUTTER);
  assert.equal(p.isCover, true);
  assert.equal(p.supportsShutterStop, true);
  assert.equal(p.isSwitch, false); // a cover is never also a plain switch
});

test('buildProfile builds sensor descriptors (temp, humidity, motion, battery)', () => {
  const p = buildProfile(REFERENTIEL.LEXMAN_MULTI);
  assert.deepEqual(
    p.sensors.map((s) => s.code),
    ['temperature', 'humidity', 'motion', 'battery-low'],
  );
  const temp = p.sensors.find((s) => s.code === 'temperature');
  assert.equal(temp.kind, 'number');
  assert.equal(temp.min, 0);
  assert.equal(temp.max, 40);
  assert.equal(p.sensors.find((s) => s.code === 'motion').kind, 'binary');
});

test('isSupported covers lights, fans, switches, covers and sensors', () => {
  assert.equal(isSupported(buildProfile(REFERENTIEL.AD_TCFL_1)), true);
  assert.equal(isSupported(buildProfile(REFERENTIEL.LEXMAN_BULB)), true);
  assert.equal(isSupported(buildProfile(REFERENTIEL.NODON_OUTLET)), true);
  assert.equal(isSupported(buildProfile(REFERENTIEL.DIO_SHUTTER)), true);
  assert.equal(isSupported(buildProfile(REFERENTIEL.LEXMAN_MULTI)), true);
  // A remote with only button states exposes nothing we can model.
  const remote = buildProfile({
    type: 'remote_controls_and_switches',
    capabilities: ['check_top_left_button_state'],
    possibleValues: {},
  });
  assert.equal(isSupported(remote), false);
});
