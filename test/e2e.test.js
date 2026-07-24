// End-to-end test: boots the REAL integration process (index.js) against a
// fake Gladys host (WebSocket + REST, same contract as the SDK) and a fake Enki
// cloud (Keycloak token endpoint + gateway micro-services), then exercises the
// full flows: discovery, scan request, poll and set-value commands.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import {
  DASHBOARD_RESPONSE,
  FAN_ROTATION,
  FAN_SPEED,
  HOMES_RESPONSE,
  LIGHT_STATE,
  POWER_STATE,
  REFERENTIEL,
  SENSOR_STATE,
  SHUTTER_POSITION,
  THERMOSTAT_STATE,
} from './fixtures.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELECTOR = 'enki-test';
const TOKEN = 'test-token';

async function waitUntil(predicate, what, timeoutMs = 10000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// --- Fake Enki cloud (Keycloak + gateway) ------------------------------------
function startFakeEnki() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      requests.push({
        method: req.method,
        path,
        body:
          body && req.headers['content-type']?.includes('json') ? JSON.parse(body) : body || null,
      });
      const json = (obj, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };

      if (path === '/token') {
        json({ access_token: 'access', refresh_token: 'refresh', expires_in: 300 });
      } else if (path === '/api-enki-home-prod/v1/homes') {
        json(HOMES_RESPONSE);
      } else if (path === '/api-enki-mobile-bff-prod/v1/dashboard/homes/home-1') {
        json(DASHBOARD_RESPONSE);
      } else if (path.startsWith('/api-enki-referentiel-agg-prod/v1/devices/')) {
        const deviceId = path.split('/').pop();
        if (REFERENTIEL[deviceId]) {
          json(REFERENTIEL[deviceId]);
        } else {
          json({}, 404);
        }
      } else if (path.endsWith('/check-light-state')) {
        const node = path.split('/')[4];
        json(LIGHT_STATE[node] || { lastReportedValue: {} });
      } else if (path.endsWith('/check-fan-speed')) {
        const node = path.split('/')[4];
        json(FAN_SPEED[node] || {});
      } else if (path.endsWith('/check-fan-rotation-direction')) {
        const node = path.split('/')[4];
        json(FAN_ROTATION[node] || {});
      } else if (path.endsWith('/check-electrical-power')) {
        json(POWER_STATE[path.split('/')[4]] || {});
      } else if (path.endsWith('/check-shutter-position')) {
        json(SHUTTER_POSITION[path.split('/')[4]] || {});
      } else if (path.includes('/api-enki-thermostat-prod/') && req.method === 'GET') {
        const node = path.split('/')[4];
        const action = path.split('/')[5];
        json((THERMOSTAT_STATE[node] && THERMOSTAT_STATE[node][action]) || {});
      } else if (/-sensor-prod\/|-detector-prod\/|battery-health-prod\//.test(path)) {
        const node = path.split('/')[4];
        const action = path.split('/')[5];
        json((SENSOR_STATE[node] && SENSOR_STATE[node][action]) || {});
      } else if (req.method === 'POST') {
        json({}, 202); // command endpoints answer 202 Accepted
      } else {
        json({});
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }));
  });
}

// --- Fake Gladys host (REST + WebSocket) -------------------------------------
function startFakeGladys() {
  const state = { discoveredDevicePosts: [], statePosts: [], commandResults: [], ws: null };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const respond = (json) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.method === 'GET' && req.url === '/api/integration/v1/device') {
        respond([]);
      } else if (req.method === 'GET' && req.url === '/api/integration/v1/config') {
        respond({ config: { email: 'user@example.com', password: 'secret' } });
      } else if (req.method === 'POST' && req.url === '/api/integration/v1/discovered_device') {
        const parsed = JSON.parse(body);
        state.discoveredDevicePosts.push(parsed.devices);
        respond({ success: true, count: parsed.devices.length });
      } else if (req.method === 'POST' && req.url === '/api/integration/v1/state') {
        state.statePosts.push(JSON.parse(body).states);
        respond({ success: true });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    state.ws = ws;
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'authenticate.integration-request' && message.payload.token === TOKEN) {
        ws.send(JSON.stringify({ type: 'authentication.connected', payload: {} }));
      }
      if (message.type === 'external-integration.command-result') {
        state.commandResults.push(message.payload);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port }));
  });
}

test('the integration discovers, polls and controls Enki lights and fans', async (t) => {
  const enki = await startFakeEnki();
  const gladys = await startFakeGladys();
  t.after(() => {
    enki.server.close();
    gladys.server.close();
  });

  let output = '';
  const base = `http://127.0.0.1:${enki.port}`;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      GLADYS_HOST_API_URL: `http://127.0.0.1:${gladys.port}`,
      GLADYS_INTEGRATION_TOKEN: TOKEN,
      GLADYS_INTEGRATION_SELECTOR: SELECTOR,
      ENKI_BASE_URL: base,
      ENKI_OIDC_URL: `${base}/token`,
      LOG_LEVEL: 'debug',
    },
  });
  child.stdout.on('data', (d) => {
    output += d;
  });
  child.stderr.on('data', (d) => {
    output += d;
  });
  t.after(() => child.kill('SIGKILL'));

  const send = (type, payload) => gladys.state.ws.send(JSON.stringify({ type, payload }));

  const byId = (suffix) =>
    gladys.state.discoveredDevicePosts.at(-1).find((d) => d.external_id.endsWith(suffix));
  const codesOf = (device) => device.features.map((f) => f.external_id.split(':').pop());

  await t.test('on connection: logs in and publishes every supported category', async () => {
    await waitUntil(() => gladys.state.discoveredDevicePosts.length >= 1, `discovery\n${output}`);

    const login = enki.requests.find((r) => r.path === '/token');
    assert.ok(login, 'the integration logged in to Enki');

    const devices = gladys.state.discoveredDevicePosts.at(-1);
    // fan + bulb + outlet + shutter + sensor + radiator + pilot-wire heater;
    // the group tile is filtered out.
    assert.equal(devices.length, 7);

    assert.deepEqual(codesOf(byId(':fan-node-1')), [
      'fan-speed',
      'airflow-direction',
      'light-binary',
      'brightness',
      'light-temperature',
    ]);
    assert.deepEqual(codesOf(byId(':bulb-1')), ['light-binary', 'brightness', 'light-temperature']);
    assert.deepEqual(codesOf(byId(':outlet-1')), ['switch-binary']);
    assert.deepEqual(codesOf(byId(':shutter-1')), ['shutter-position', 'shutter-stop']);
    assert.deepEqual(codesOf(byId(':sensor-1')), [
      'temperature',
      'humidity',
      'motion',
      'battery-low',
    ]);
    // Radiator: setpoint (thermostat) + read-only current temperature (sensor).
    assert.deepEqual(codesOf(byId(':heater-1')), ['target-temperature', 'temperature']);
    assert.deepEqual(codesOf(byId(':pilot-1')), ['pilot-wire-mode']);
  });

  const fanDevice = () => byId(':fan-node-1');
  const bulbDevice = () => byId(':bulb-1');
  const outletDevice = () => byId(':outlet-1');
  const shutterDevice = () => byId(':shutter-1');
  const sensorDevice = () => byId(':sensor-1');
  const heaterDevice = () => byId(':heater-1');
  const pilotDevice = () => byId(':pilot-1');

  await t.test('a scan request republishes the devices', async () => {
    const before = gladys.state.discoveredDevicePosts.length;
    send('external-integration.scan-request', {});
    await waitUntil(() => gladys.state.discoveredDevicePosts.length > before, `scan\n${output}`);
    assert.equal(gladys.state.discoveredDevicePosts.at(-1).length, 7);
  });

  await t.test('polling the fan publishes fan + light-kit states', async () => {
    send('external-integration.device.poll', { message_id: 'poll-1', device: fanDevice() });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'poll-1'),
      `poll ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'poll-1');
    assert.equal(ack.success, true, ack.error);

    const states = gladys.state.statePosts.at(-1);
    assert.deepEqual(states, [
      { device_feature_external_id: `ext:${SELECTOR}:enki:fan-node-1:fan-speed`, state: 50 },
      { device_feature_external_id: `ext:${SELECTOR}:enki:fan-node-1:airflow-direction`, state: 0 },
      { device_feature_external_id: `ext:${SELECTOR}:enki:fan-node-1:light-binary`, state: 0 },
      { device_feature_external_id: `ext:${SELECTOR}:enki:fan-node-1:brightness`, state: 50 },
    ]);
  });

  await t.test('setting the fan speed writes change-fan-speed', async () => {
    send('external-integration.device.set-value', {
      message_id: 'set-fan',
      device: fanDevice(),
      device_feature: { external_id: `ext:${SELECTOR}:enki:fan-node-1:fan-speed` },
      value: 100,
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'set-fan'),
      `set-fan ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'set-fan');
    assert.equal(ack.success, true, ack.error);

    const post = enki.requests.findLast((r) => r.path.endsWith('/change-fan-speed'));
    assert.ok(post, 'called change-fan-speed');
    assert.deepEqual(post.body, { value: 6 });
  });

  await t.test('setting the bulb brightness merges then writes change-light-state', async () => {
    send('external-integration.device.set-value', {
      message_id: 'set-bulb',
      device: bulbDevice(),
      device_feature: { external_id: `ext:${SELECTOR}:enki:bulb-1:brightness` },
      value: 60,
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'set-bulb'),
      `set-bulb ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'set-bulb');
    assert.equal(ack.success, true, ack.error);

    const post = enki.requests.findLast((r) => r.path.endsWith('/change-light-state'));
    assert.ok(post, 'called change-light-state');
    // Full lastReportedValue is preserved, power forced ON, brightness updated
    // (60 % -> 0.6 on the Enki 0..1 scale).
    assert.equal(post.body.power, 'ON');
    assert.equal(post.body.brightness, 0.6);
    assert.equal(post.body.colorTemperature, 'T2700K');
  });

  await t.test(
    'polling the outlet publishes its on/off state and set-value switches it',
    async () => {
      send('external-integration.device.poll', {
        message_id: 'poll-outlet',
        device: outletDevice(),
      });
      await waitUntil(
        () => gladys.state.commandResults.some((r) => r.message_id === 'poll-outlet'),
        `poll-outlet ack\n${output}`,
      );
      assert.deepEqual(gladys.state.statePosts.at(-1), [
        { device_feature_external_id: `ext:${SELECTOR}:enki:outlet-1:switch-binary`, state: 1 },
      ]);

      send('external-integration.device.set-value', {
        message_id: 'set-outlet',
        device: outletDevice(),
        device_feature: { external_id: `ext:${SELECTOR}:enki:outlet-1:switch-binary` },
        value: 0,
      });
      await waitUntil(
        () => gladys.state.commandResults.some((r) => r.message_id === 'set-outlet'),
        `set-outlet ack\n${output}`,
      );
      const post = enki.requests.findLast((r) => r.path.endsWith('/switch-electrical-power'));
      assert.ok(post, 'called switch-electrical-power');
      assert.deepEqual(post.body, { value: 'OFF' });
    },
  );

  await t.test('polling the shutter publishes position and set-value moves it', async () => {
    send('external-integration.device.poll', { message_id: 'poll-shut', device: shutterDevice() });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'poll-shut'),
      `poll-shut ack\n${output}`,
    );
    assert.deepEqual(gladys.state.statePosts.at(-1), [
      { device_feature_external_id: `ext:${SELECTOR}:enki:shutter-1:shutter-position`, state: 40 },
    ]);

    send('external-integration.device.set-value', {
      message_id: 'set-shut',
      device: shutterDevice(),
      device_feature: { external_id: `ext:${SELECTOR}:enki:shutter-1:shutter-position` },
      value: 75,
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'set-shut'),
      `set-shut ack\n${output}`,
    );
    const post = enki.requests.findLast((r) => r.path.endsWith('/change-shutter-position'));
    assert.ok(post, 'called change-shutter-position');
    assert.deepEqual(post.body, { value: 75 });
  });

  await t.test('polling the multisensor publishes temp/humidity/motion/battery', async () => {
    send('external-integration.device.poll', { message_id: 'poll-sensor', device: sensorDevice() });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'poll-sensor'),
      `poll-sensor ack\n${output}`,
    );
    assert.deepEqual(gladys.state.statePosts.at(-1), [
      { device_feature_external_id: `ext:${SELECTOR}:enki:sensor-1:temperature`, state: 21.5 },
      { device_feature_external_id: `ext:${SELECTOR}:enki:sensor-1:humidity`, state: 55 },
      { device_feature_external_id: `ext:${SELECTOR}:enki:sensor-1:motion`, state: 1 },
      { device_feature_external_id: `ext:${SELECTOR}:enki:sensor-1:battery-low`, state: 0 },
    ]);
  });

  await t.test(
    'the radiator polls setpoint + current temp and set-value writes an override',
    async () => {
      send('external-integration.device.poll', { message_id: 'poll-heat', device: heaterDevice() });
      await waitUntil(
        () => gladys.state.commandResults.some((r) => r.message_id === 'poll-heat'),
        `poll-heat ack\n${output}`,
      );
      assert.deepEqual(gladys.state.statePosts.at(-1), [
        {
          device_feature_external_id: `ext:${SELECTOR}:enki:heater-1:target-temperature`,
          state: 19.5,
        },
        { device_feature_external_id: `ext:${SELECTOR}:enki:heater-1:temperature`, state: 20.5 },
      ]);

      send('external-integration.device.set-value', {
        message_id: 'set-heat',
        device: heaterDevice(),
        device_feature: { external_id: `ext:${SELECTOR}:enki:heater-1:target-temperature` },
        value: 21,
      });
      await waitUntil(
        () => gladys.state.commandResults.some((r) => r.message_id === 'set-heat'),
        `set-heat ack\n${output}`,
      );
      const post = enki.requests.findLast((r) => r.path.endsWith('/override-commands'));
      assert.ok(post, 'called the command-override service');
      assert.equal(post.body.type, 'DEROGATION');
      assert.equal(post.body.capabilityId, 'change_thermostat_target_temperature');
      assert.equal(post.body.value, 21);
      assert.equal(post.body.nodeId, 'heater-1');
    },
  );

  await t.test('the pilot-wire heater set-value writes switch-pilot-wire-mode', async () => {
    send('external-integration.device.poll', { message_id: 'poll-pilot', device: pilotDevice() });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'poll-pilot'),
      `poll-pilot ack\n${output}`,
    );
    assert.deepEqual(gladys.state.statePosts.at(-1), [
      { device_feature_external_id: `ext:${SELECTOR}:enki:pilot-1:pilot-wire-mode`, state: 5 },
    ]);

    send('external-integration.device.set-value', {
      message_id: 'set-pilot',
      device: pilotDevice(),
      device_feature: { external_id: `ext:${SELECTOR}:enki:pilot-1:pilot-wire-mode` },
      value: 2, // ECO
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'set-pilot'),
      `set-pilot ack\n${output}`,
    );
    const post = enki.requests.findLast((r) => r.path.endsWith('/switch-pilot-wire-mode'));
    assert.ok(post, 'called switch-pilot-wire-mode');
    assert.deepEqual(post.body, { value: 'ECO' });
  });

  await t.test('a set-value on an unknown feature is acked as failed', async () => {
    send('external-integration.device.set-value', {
      message_id: 'set-bad',
      device: bulbDevice(),
      device_feature: { external_id: `ext:${SELECTOR}:enki:bulb-1:nope` },
      value: 1,
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'set-bad'),
      `set-bad ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'set-bad');
    assert.equal(ack.success, false);
    assert.match(ack.error, /not controllable/);
  });
});
