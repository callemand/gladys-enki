// -----------------------------------------------------------------------------
// Enki (Leroy Merlin / Adeo) protocol constants + the few Gladys values not
// exported by the SDK.
//
// The standard Gladys feature categories / types / units come straight from
// the SDK (DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES,
// DEVICE_FEATURE_UNITS) — only integration-specific values live here.
//
// The Enki cloud is a set of REST micro-services behind one API gateway. Auth
// is OAuth (Keycloak, resource-owner password grant), and every call carries a
// per-service `X-Gateway-APIKey` header. The keys below are the ones the
// official mobile app ships (APK 2.25.1) — they are not per-account secrets.
// -----------------------------------------------------------------------------

// Keycloak OAuth token endpoint (env override used only by the test suite).
export const ENKI_OIDC_URL =
  process.env.ENKI_OIDC_URL ||
  'https://keycloak-prod.iot.leroymerlin.fr/realms/enki/protocol/openid-connect/token';

// OAuth client id used by the Enki front / mobile app.
export const ENKI_OIDC_CLIENT_ID = 'enki-front';

// API gateway base URL (env override used only by the test suite).
export const ENKI_BASE_URL = (
  process.env.ENKI_BASE_URL || 'https://enki.api.devportal.adeo.cloud'
).replace(/\/+$/, '');

// Referentiel schema version pinned by the mobile app.
export const ENKI_REFERENTIEL_VERSION = '2.23.0';

// Mobile app impersonation (some gateways reject unknown user agents).
export const ENKI_APP_VERSION = '2.25.1';
export const ENKI_USER_AGENT = `Enki/${ENKI_APP_VERSION} (iPhone; iOS 18.0; Scale/3.00) Enki`;

// Per-service gateway API keys, shipped in the Enki mobile app (APK 2.25.1).
// Only the services this integration talks to (lights + fans) are listed.
export const ENKI_API_KEYS = {
  home: 'FULsxyI3x1f7MtLVOsP6V1DeAPmBQJCB',
  bff: 'Bco7qBHRHOQiSVcEHdgS0rijpebMBwkB',
  node: 'UBb0Kv6xXpG6bOvD8VZ9A63uxqQ4G1A3',
  referentiel: '3uk9rlaIUgBsz1tEPV7GQMhhGfRwPFJY',
  lighting: '3OVsNulRsUXfr7Hze54OHx8l6qDu2UcE',
  airflow: 'hder4GeBrdbzQlV2R22dm2a9pbfTTHPj',
  power: 'DZ9MSuTT7sQxJWxxkBokAGvIt57qVl9N',
  // Extension services (outlets, covers, sensors).
  motorization: 'QegWuQR3zSKLlJZ2OITv94vjtSaaPkDp',
  temperature_humidity: '5Oqfse9MTtAWdfxwhlSPrOVO4gwqfgku',
  contact_sensor: 'YlTcpTzG8Fm2z52MN89laCGnCx6ldbWx',
  presence_detector: 'b5A3sQcYHpRta3SqGXwH9T9GNaNHpj96',
  luminosity_sensor: 'fFgGBdPnmCPgu5ouGylYtu7iLLtm5Q6x',
  battery_health: '4o6CgR2B5fsq8eJw3VUk1GDs02Y6zKO3',
  water_sensor: 'TZckkGN2S5wHuImS8BSdJ9dfuTfDxgHi',
  thermostat: '2t3Qtt6jSI98PQc89kIlvDo7maleKL8l',
  command_override: '1E4MjXFFSuKKULDytsNnGC3bKX4RV3Wc',
};

// Command-override service (thermostat setpoint DEROGATIONs) — POST-only.
export const ENKI_COMMAND_OVERRIDE_PATH = '/api-enki-command-override-prod/v1/override-commands';
export const ENKI_OVERRIDE_TYPE_DEROGATION = 'DEROGATION';
export const ENKI_THERMOSTAT_SETPOINT_CAPABILITY = 'change_thermostat_target_temperature';
// The Enki app applies timed derogations; we default to 24 h.
export const DEROGATION_HOURS = 24;

// Path prefixes for each micro-service (built onto ENKI_BASE_URL).
export const ENKI_PATHS = {
  homes: '/api-enki-home-prod/v1/homes',
  dashboard: '/api-enki-mobile-bff-prod/v1/dashboard',
  nodes: '/api-enki-node-agg-prod/v1/nodes',
  referentiel: '/api-enki-referentiel-agg-prod/v1/devices',
  lighting: '/api-enki-lighting-prod/v1/lighting',
  airflow: '/api-enki-airflow-prod/v1/airflow',
  power: '/api-enki-power-prod/v1/power',
};

// Path prefix per capability-based service (reads are `{prefix}/{node}/{action}`,
// action = the check_/change_ capability with underscores turned into hyphens).
export const SERVICE_PREFIXES = {
  motorization: '/api-enki-rolling-prod/v1/shutter',
  thermostat: '/api-enki-thermostat-prod/v1/heating',
  temperature_humidity: '/api-enki-temperature-humidity-sensor-prod/v1/sensors',
  contact_sensor: '/api-enki-contact-sensor-prod/v1/sensors',
  presence_detector: '/api-enki-presence-detector-prod/v1/sensors',
  luminosity_sensor: '/api-enki-luminosity-sensor-prod/v1/sensors',
  battery_health: '/api-enki-battery-health-prod/v1/sensors',
  water_sensor: '/api-enki-water-leak-detector-prod/v1/detectors',
};

// Enki fan speed range (0 = off, 1..6 = levels). Used to map to/from the
// Gladys fan "percent" feature (0-100).
export const FAN_SPEED_MIN = 1;
export const FAN_SPEED_MAX = 6;

// Enki blade rotation values <-> Gladys FAN_AIRFLOW_DIRECTION (0 = forward,
// 1 = reverse). Enki delivers a season-like value; CLOCKWISE ~ summer/forward.
export const ENKI_ROTATION = {
  CLOCKWISE: 'CLOCKWISE',
  COUNTERCLOCKWISE: 'COUNTERCLOCKWISE',
};

// Gladys FAN_AIRFLOW_DIRECTION (server/utils/constants.js).
export const FAN_AIRFLOW_DIRECTION = {
  FORWARD: 0,
  REVERSE: 1,
};

// Enki airflow modes.
export const ENKI_AIRFLOW_MODE = {
  MANUAL: 'MANUAL',
  BREEZE: 'BREEZE',
};

// Enki light power values.
export const ENKI_POWER = {
  ON: 'ON',
  OFF: 'OFF',
};

// Default Enki brightness range when the referentiel does not advertise one.
export const DEFAULT_BRIGHTNESS_MAX = 100;

// Default color-temperature range (in kelvin) used only as a last-resort
// fallback when the referentiel exposes color temperature without values.
export const DEFAULT_COLOR_TEMP_KELVINS = [2700, 6500];

// Devices are polled every 15 seconds, like the built-in Gladys cloud services
// (must be one of the Gladys DEVICE_POLL_FREQUENCIES values, in milliseconds).
export const POLL_FREQUENCY = 15 * 1000;

// External-id slug for every Enki device (device id = the Enki node id).
export const ENKI_SLUG = 'enki';

// Device params carrying the data poll / set-value need (the Gladys core sends
// the params back with every command).
export const PARAM_HOME_ID = 'homeId';
export const PARAM_META = 'enkiMeta';

// Feature codes (last segment of the feature external id).
export const FEATURE_CODES = {
  // Lighting (bulbs and fan light kits).
  LIGHT_BINARY: 'light-binary',
  BRIGHTNESS: 'brightness',
  COLOR_TEMPERATURE: 'light-temperature',
  COLOR: 'light-color',
  // Ventilation (ceiling fans).
  FAN_SPEED: 'fan-speed',
  AIRFLOW_DIRECTION: 'airflow-direction',
  // Outlets / relays.
  SWITCH_BINARY: 'switch-binary',
  // Covers / roller shutters.
  SHUTTER_POSITION: 'shutter-position',
  SHUTTER_STOP: 'shutter-stop',
  // Read-only sensors.
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  ILLUMINANCE: 'illuminance',
  MOTION: 'motion',
  OPENING: 'opening',
  WATER_LEAK: 'water-leak',
  BATTERY_LOW: 'battery-low',
  // Heating (radiators, pilot wire, thermostats).
  TARGET_TEMPERATURE: 'target-temperature',
  PILOT_WIRE_MODE: 'pilot-wire-mode',
};

// Gladys PILOT_WIRE_MODE (server/utils/constants.js) <-> Enki API strings. The
// names match 1:1, so the map doubles as the numeric encoding Gladys expects.
export const PILOT_WIRE_MODE = {
  OFF: 0,
  FROST_PROTECTION: 1,
  ECO: 2,
  COMFORT_1: 3,
  COMFORT_2: 4,
  COMFORT: 5,
};

// Fallback thermostat setpoint bounds (°C) when the referentiel omits a range.
export const DEFAULT_THERMOSTAT_RANGE = { MIN: 7, MAX: 28 };

// Enki string states that map to a Gladys binary 1 (anything else that is a
// known "off" string maps to 0; unknown values are dropped by the caller).
export const BINARY_TRUE_STATES = new Set([
  'ON',
  'MOTION_DETECTED',
  'VIBRATION_DETECTED',
  'OPENED',
  'WATER_DETECTED',
  'LEAK',
  'WINDOW_OPEN',
]);
export const BINARY_FALSE_STATES = new Set([
  'OFF',
  'NO_MOTION_DETECTED',
  'NO_VIBRATION_DETECTED',
  'CLOSED',
  'NO_WATER_DETECTED',
  'NO_LEAK',
  'NO_WINDOW_OPEN',
]);

// Enki battery-health enum -> Gladys battery-low binary (1 = needs attention).
export const BATTERY_LOW_STATES = new Set([
  'LOW',
  'LOW_INTERNAL_BATTERY_OF_DEVICE',
  'REPLACE',
  'CRITICAL',
]);
export const BATTERY_OK_STATES = new Set(['GOOD']);
