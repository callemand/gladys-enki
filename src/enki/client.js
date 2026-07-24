// -----------------------------------------------------------------------------
// Enki (Leroy Merlin / Adeo) cloud API client (uses the Node.js built-in fetch).
//
// Auth: Keycloak OAuth resource-owner password grant on ENKI_OIDC_URL. Tokens
// are renewed with the refresh_token, falling back to a full login if that is
// rejected. Every gateway call carries the OAuth Bearer token AND a per-service
// `X-Gateway-APIKey` header (the keys shipped in the mobile app); most calls
// also carry a `homeId` header.
//
// Endpoints used (all behind ENKI_BASE_URL):
//   - GET  /api-enki-home-prod/v1/homes                         -> list homes
//   - GET  /api-enki-mobile-bff-prod/v1/dashboard/homes/{home}  -> dashboard
//   - GET  /api-enki-referentiel-agg-prod/v1/devices/{deviceId} -> capabilities
//   - GET  /api-enki-lighting-prod/v1/lighting/{node}/check-light-state
//   - POST /api-enki-lighting-prod/v1/lighting/{node}/change-light-state
//   - GET  /api-enki-airflow-prod/v1/airflow/{node}/{check-*}
//   - POST /api-enki-airflow-prod/v1/airflow/{node}/{change-*}
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';

import {
  DEROGATION_HOURS,
  ENKI_API_KEYS,
  ENKI_BASE_URL,
  ENKI_COMMAND_OVERRIDE_PATH,
  ENKI_OIDC_CLIENT_ID,
  ENKI_OIDC_URL,
  ENKI_OVERRIDE_TYPE_DEROGATION,
  ENKI_PATHS,
  ENKI_REFERENTIEL_VERSION,
  ENKI_THERMOSTAT_SETPOINT_CAPABILITY,
  ENKI_USER_AGENT,
  SERVICE_PREFIXES,
} from '../constants.js';

/** Referentiel capability name (underscores) -> HTTP action segment (hyphens). */
function capabilityToAction(capability) {
  return capability.replace(/_/g, '-');
}

const logger = createLogger({ name: 'enki' });

const REQUEST_TIMEOUT_MS = 30000;
// Renew the access token this many milliseconds before it actually expires.
const TOKEN_SKEW_MS = 30 * 1000;

export class EnkiClient {
  constructor({ baseUrl = ENKI_BASE_URL, oidcUrl = ENKI_OIDC_URL } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.oidcUrl = oidcUrl;
    this.credentials = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
  }

  isLoggedIn() {
    return this.accessToken !== null;
  }

  logout() {
    this.credentials = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Authenticate with Enki (Keycloak password grant) and store the tokens.
   * @param {string} email Enki account email
   * @param {string} password Enki account password
   */
  async login(email, password) {
    this.credentials = { email, password };
    logger.debug('Logging in to Enki...');
    const payload = await this.#tokenRequest({
      grant_type: 'password',
      client_id: ENKI_OIDC_CLIENT_ID,
      username: email,
      password,
    });
    this.#storeTokenPayload(payload);
    logger.info('Logged in to Enki');
  }

  /**
   * Ensure a valid access token, refreshing (or re-logging in) as needed.
   */
  async ensureToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_SKEW_MS) {
      return;
    }
    if (this.refreshToken) {
      try {
        await this.#refresh();
        return;
      } catch {
        logger.debug('Refresh token rejected, falling back to password grant');
      }
    }
    if (!this.credentials) {
      throw new Error('Enki is not connected');
    }
    await this.login(this.credentials.email, this.credentials.password);
  }

  async #refresh() {
    const payload = await this.#tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: ENKI_OIDC_CLIENT_ID,
    });
    this.#storeTokenPayload(payload);
    logger.debug('Enki token refreshed');
  }

  #storeTokenPayload(payload) {
    if (!payload || !payload.access_token) {
      throw new Error('Enki login failed: no access token returned (check your credentials)');
    }
    this.accessToken = payload.access_token;
    if (payload.refresh_token) {
      this.refreshToken = payload.refresh_token;
    }
    const expiresInMs = Number(payload.expires_in || 0) * 1000;
    this.tokenExpiresAt = Date.now() + expiresInMs;
  }

  async #tokenRequest(form) {
    const response = await fetch(this.oidcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 400) {
      throw new Error('Enki authentication rejected (invalid credentials or refresh token)');
    }
    if (!response.ok) {
      throw new Error(`Enki authentication failed: HTTP ${response.status}`);
    }
    return response.json();
  }

  // --- gateway requests ------------------------------------------------------

  #headers(service, homeId) {
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'User-Agent': ENKI_USER_AGENT,
      'X-Correlation-Id': `iOS_${randomUUID().replace(/-/g, '').toUpperCase()}`,
    };
    const apiKey = ENKI_API_KEYS[service];
    if (apiKey) {
      headers['X-Gateway-APIKey'] = apiKey;
    }
    if (homeId !== undefined && homeId !== null) {
      headers.homeId = homeId;
    }
    return headers;
  }

  /**
   * Perform an authenticated gateway request; on a 401 re-authenticate once and
   * retry. Returns the parsed JSON body ({} for empty bodies), or null when
   * `notFoundOk` and the resource is 404.
   */
  async #request(service, path, { method = 'GET', homeId, body, params, notFoundOk = false } = {}) {
    await this.ensureToken();
    const doRequest = () => this.#fetchJson(service, path, { method, homeId, body, params });
    let response;
    try {
      response = await doRequest();
    } catch (err) {
      if (err.status === 401 && this.credentials) {
        logger.warn('Enki returned 401, re-authenticating and retrying once');
        this.accessToken = null;
        await this.ensureToken();
        response = await doRequest();
      } else if (err.status === 404 && notFoundOk) {
        return null;
      } else {
        throw err;
      }
    }
    return response;
  }

  async #fetchJson(service, path, { method, homeId, body, params }) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    const url = `${this.baseUrl}${path}${query}`;
    const response = await fetch(url, {
      method,
      headers: {
        ...this.#headers(service, homeId),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = new Error(`Enki request failed: ${method} ${path} -> HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  // --- discovery -------------------------------------------------------------

  /**
   * List the home ids on the account.
   * @returns {Promise<Array<string>>} home ids
   */
  async listHomes() {
    const data = await this.#request('home', ENKI_PATHS.homes);
    return (data.items || []).map((home) => home.id).filter(Boolean);
  }

  /**
   * Fetch the dashboard of one home and return its flattened item list. Each
   * item carries `metadata.nodeId` / `metadata.deviceId` for real devices.
   * @param {string} homeId home id
   * @returns {Promise<Array<object>>} dashboard items
   */
  async listDashboardItems(homeId) {
    const data = await this.#request('bff', `${ENKI_PATHS.dashboard}/homes/${homeId}`, {
      params: { hasGroups: 'true' },
    });
    return (data.sections || []).flatMap((section) => section.items || []);
  }

  /**
   * Fetch the referentiel metadata (capabilities + possibleValues) of a device
   * model. Fan (ESDK) nodes may return 404 → resolved to null.
   * @param {string} deviceId referentiel device id (metadata.deviceId)
   * @returns {Promise<object|null>} referentiel device, or null if not found
   */
  async getReferentielDevice(deviceId) {
    return this.#request('referentiel', `${ENKI_PATHS.referentiel}/${deviceId}`, {
      params: { version: ENKI_REFERENTIEL_VERSION },
      notFoundOk: true,
    });
  }

  // --- lighting --------------------------------------------------------------

  /**
   * Read the current light state of a node.
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @returns {Promise<object>} lastReportedValue ({ power, brightness, ... })
   */
  async getLightState(homeId, nodeId) {
    const data = await this.#request(
      'lighting',
      `${ENKI_PATHS.lighting}/${nodeId}/check-light-state`,
      {
        homeId,
      },
    );
    const value = data.lastReportedValue;
    return value && typeof value === 'object' ? value : {};
  }

  /**
   * Apply one or more lighting fields. Enki requires the full lastReportedValue
   * on every write, so `changes` is merged over the current state.
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {object} payload full change-light-state body
   */
  async changeLightState(homeId, nodeId, payload) {
    await this.#request('lighting', `${ENKI_PATHS.lighting}/${nodeId}/change-light-state`, {
      method: 'POST',
      homeId,
      body: payload,
    });
  }

  // --- airflow (ceiling fans) ------------------------------------------------

  /**
   * Read one airflow capability (check-fan-speed, check-airflow-mode,
   * check-fan-rotation-direction).
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {string} action check-* action name
   * @returns {Promise<object|null>} the response, or null if not found
   */
  async airflowGet(homeId, nodeId, action) {
    return this.#request('airflow', `${ENKI_PATHS.airflow}/${nodeId}/${action}`, {
      homeId,
      notFoundOk: true,
    });
  }

  /**
   * Send one airflow command (change-fan-speed, change-airflow-mode,
   * change-fan-rotation-direction).
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {string} action change-* action name
   * @param {*} value command value
   */
  async airflowPost(homeId, nodeId, action, value) {
    await this.#request('airflow', `${ENKI_PATHS.airflow}/${nodeId}/${action}`, {
      method: 'POST',
      homeId,
      body: { value },
    });
  }

  // --- outlets / relays (power service) --------------------------------------

  /**
   * Read the electrical-power state of an outlet / relay.
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @returns {Promise<*>} check-electrical-power lastReportedValue ("ON"/"OFF")
   */
  async getElectricalPower(homeId, nodeId) {
    const data = await this.#request(
      'power',
      `${ENKI_PATHS.power}/${nodeId}/check-electrical-power`,
      { homeId, notFoundOk: true },
    );
    return data ? data.lastReportedValue : null;
  }

  /**
   * Switch an outlet / relay on or off.
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {string} value "ON" / "OFF"
   */
  async switchElectricalPower(homeId, nodeId, value) {
    await this.#request('power', `${ENKI_PATHS.power}/${nodeId}/switch-electrical-power`, {
      method: 'POST',
      homeId,
      body: { value },
    });
  }

  // --- roller shutters (motorization service) --------------------------------

  /**
   * Read one shutter capability (check-shutter-position, ...).
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {string} action check-* action name
   * @returns {Promise<object|null>} the response, or null if not found
   */
  async shutterGet(homeId, nodeId, action) {
    return this.#request('motorization', `${SERVICE_PREFIXES.motorization}/${nodeId}/${action}`, {
      homeId,
      notFoundOk: true,
    });
  }

  /**
   * Send one shutter command (change-shutter-position, stop-change-shutter-position).
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {string} action change-* action name
   * @param {*} [value] command value (omitted for stop)
   */
  async shutterPost(homeId, nodeId, action, value) {
    await this.#request('motorization', `${SERVICE_PREFIXES.motorization}/${nodeId}/${action}`, {
      method: 'POST',
      homeId,
      body: value === undefined ? undefined : { value },
    });
  }

  // --- read-only sensors (per-capability services) ---------------------------

  /**
   * Read one sensor capability from its micro-service. Resolves 404 to null.
   * @param {string} service SERVICE_PREFIXES key (e.g. "temperature_humidity")
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {string} capability referentiel capability (e.g. "check_current_temperature")
   * @returns {Promise<*>} the lastReportedValue, or null when unavailable
   */
  async sensorGet(service, homeId, nodeId, capability) {
    const prefix = SERVICE_PREFIXES[service];
    if (!prefix) {
      return null;
    }
    const action = capabilityToAction(capability);
    const data = await this.#request(service, `${prefix}/${nodeId}/${action}`, {
      homeId,
      notFoundOk: true,
    });
    return data ? data.lastReportedValue : null;
  }

  // --- heaters / thermostats -------------------------------------------------

  /**
   * Send one thermostat command (switch-pilot-wire-mode,
   * change-thermostat-target-temperature).
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {string} action change-/switch-* action name
   * @param {*} value command value
   */
  async thermostatPost(homeId, nodeId, action, value) {
    await this.#request('thermostat', `${SERVICE_PREFIXES.thermostat}/${nodeId}/${action}`, {
      method: 'POST',
      homeId,
      body: { value },
    });
  }

  /**
   * Set the thermostat target temperature. Enki (APK 2.25.1) applies this as a
   * timed DEROGATION on the command-override service; if that is rejected
   * (404/405/501) it falls back to a direct thermostat POST.
   * @param {string} homeId home id
   * @param {string} nodeId node id
   * @param {number} temperature target temperature (°C)
   */
  async setThermostatTargetTemperature(homeId, nodeId, temperature) {
    const endTime = new Date(Date.now() + DEROGATION_HOURS * 3600 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    try {
      await this.#request('command_override', ENKI_COMMAND_OVERRIDE_PATH, {
        method: 'POST',
        homeId,
        body: {
          homeId,
          nodeId,
          type: ENKI_OVERRIDE_TYPE_DEROGATION,
          capabilityId: ENKI_THERMOSTAT_SETPOINT_CAPABILITY,
          value: temperature,
          endTime,
        },
      });
    } catch (err) {
      if (![404, 405, 501].includes(err.status)) {
        throw err;
      }
      logger.debug(`Command-override setpoint rejected (${err.status}), trying thermostat POST`);
      await this.thermostatPost(
        homeId,
        nodeId,
        'change-thermostat-target-temperature',
        temperature,
      );
    }
  }
}
