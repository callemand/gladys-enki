import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { EnkiClient } from '../src/enki/client.js';

// Boot a tiny fake Enki server (Keycloak token endpoint + gateway) and return
// a client wired to it, plus the recorded requests.
async function withFakeEnki(handler, run) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      requests.push({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        body: body
          ? req.headers['content-type']?.includes('json')
            ? JSON.parse(body)
            : body
          : null,
      });
      handler(req, res, url, requests);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const client = new EnkiClient({ baseUrl: base, oidcUrl: `${base}/token` });
  try {
    await run(client, requests, base);
  } finally {
    server.close();
  }
}

function tokenHandler(req, res, url) {
  if (url.pathname === '/token') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 300 }),
    );
    return true;
  }
  return false;
}

test('login sends a Keycloak password grant and stores the token', async () => {
  await withFakeEnki(
    (req, res, url) => {
      tokenHandler(req, res, url);
    },
    async (client, requests) => {
      await client.login('user@example.com', 'secret');
      assert.equal(client.isLoggedIn(), true);
      const tokenReq = requests.find((r) => r.path === '/token');
      const form = new URLSearchParams(tokenReq.body);
      assert.equal(form.get('grant_type'), 'password');
      assert.equal(form.get('client_id'), 'enki-front');
      assert.equal(form.get('username'), 'user@example.com');
      assert.equal(form.get('password'), 'secret');
    },
  );
});

test('gateway requests carry Bearer + X-Gateway-APIKey + homeId headers', async () => {
  await withFakeEnki(
    (req, res, url) => {
      if (tokenHandler(req, res, url)) {
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ lastReportedValue: { power: 'ON' } }));
    },
    async (client, requests) => {
      await client.login('user@example.com', 'secret');
      await client.getLightState('home-1', 'node-1');
      const call = requests.find((r) => r.path.includes('/check-light-state'));
      assert.equal(call.headers.authorization, 'Bearer access-1');
      assert.equal(call.headers['x-gateway-apikey'], '3OVsNulRsUXfr7Hze54OHx8l6qDu2UcE');
      assert.equal(call.headers.homeid, 'home-1');
    },
  );
});

test('a 401 triggers one re-authentication and retry', async () => {
  let lightCalls = 0;
  await withFakeEnki(
    (req, res, url) => {
      if (tokenHandler(req, res, url)) {
        return;
      }
      lightCalls += 1;
      if (lightCalls === 1) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ lastReportedValue: { power: 'OFF' } }));
    },
    async (client, requests) => {
      await client.login('user@example.com', 'secret');
      const state = await client.getLightState('home-1', 'node-1');
      assert.deepEqual(state, { power: 'OFF' });
      assert.equal(lightCalls, 2, 'retried once after the 401');
      assert.equal(requests.filter((r) => r.path === '/token').length, 2, 're-authenticated');
    },
  );
});

test('airflowGet resolves 404 to null (not found is OK)', async () => {
  await withFakeEnki(
    (req, res, url) => {
      if (tokenHandler(req, res, url)) {
        return;
      }
      res.writeHead(404);
      res.end();
    },
    async (client) => {
      await client.login('user@example.com', 'secret');
      const result = await client.airflowGet('home-1', 'node-1', 'check-fan-rotation-direction');
      assert.equal(result, null);
    },
  );
});
