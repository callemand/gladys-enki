import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfile } from '../src/devices/capabilities.js';
import { convertDevice, getHomeId, getProfile } from '../src/devices/convertDevice.js';
import { REFERENTIEL } from './fixtures.js';
import { fakeIds } from './helpers.js';

const gladys = { externalIds: (slug, id) => fakeIds(slug, id) };

test('convertDevice builds a fan+light device with all features and params', () => {
  const node = {
    nodeId: 'fan-node-1',
    homeId: 'home-1',
    name: 'Living room fan',
    model: 'Siroco+',
    profile: buildProfile(REFERENTIEL.AD_TCFL_1),
  };
  const device = convertDevice(gladys, node);

  assert.equal(device.external_id, 'ext:test:enki:fan-node-1');
  assert.equal(device.name, 'Living room fan');
  assert.equal(device.model, 'Siroco+');
  assert.equal(device.poll_frequency, 15000);
  assert.equal(device.should_poll, true);
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').pop()),
    ['fan-speed', 'airflow-direction', 'light-binary', 'brightness', 'light-temperature'],
  );
  assert.equal(getHomeId(device), 'home-1');
  assert.deepEqual(getProfile(device), node.profile);
});

test('every feature carries a unique selector based on its external_id', () => {
  const node = {
    nodeId: 'fan-node-1',
    homeId: 'home-1',
    name: 'Living room fan',
    model: 'Siroco+',
    profile: buildProfile(REFERENTIEL.AD_TCFL_1),
  };
  const { features } = convertDevice(gladys, node);
  // The selector must equal the (globally-unique) external_id, otherwise Gladys
  // derives it from the name and collides on the global selector constraint.
  features.forEach((f) => assert.equal(f.selector, f.external_id));
  const selectors = features.map((f) => f.selector);
  assert.equal(new Set(selectors).size, selectors.length, 'selectors are unique');
});

test('getHomeId / getProfile throw on a device missing its params', () => {
  assert.throws(() => getHomeId({ external_id: 'x', params: [] }), /homeId/);
  assert.throws(() => getProfile({ external_id: 'x', params: [] }), /enkiMeta/);
});
