// Shared Enki API fixtures. Shapes captured from the REAL Enki cloud: the
// dashboard lists nodes with `metadata.nodeId` / `metadata.deviceId`, the
// referentiel carries `capabilities` + `possibleValues`, lighting state lives
// under `lastReportedValue`, and every check_* read returns `{ lastReportedValue }`.
//
// Notable real-world shapes (verified against a live account + the 210-device
// catalog):
//   - brightness is a 0..1 float (range { min: 0, max: 1, step: 0.01 });
//   - color temperature is a list of "T<kelvin>K" strings;
//   - fan speed is an integer range 0..6 (0 = off);
//   - electrical power is "ON"/"OFF"; shutter position is 0..100;
//   - binary sensors report enum strings (MOTION_DETECTED, OPENED, GOOD, …).

// GET /api-enki-home-prod/v1/homes
export const HOMES_RESPONSE = {
  items: [{ id: 'home-1' }],
};

// GET /api-enki-mobile-bff-prod/v1/dashboard/homes/home-1 : one ceiling fan
// (fan + light kit), one tunable-white bulb, one outlet, one roller shutter,
// one multisensor, and one grouping tile with no node (must be ignored).
export const DASHBOARD_RESPONSE = {
  sections: [
    {
      items: [
        {
          title: { label: 'Living room fan' },
          metadata: { nodeId: 'fan-node-1', deviceId: 'AD_TCFL_1', deviceType: 'ceiling_fans' },
        },
        {
          title: { label: 'Bedroom lamp' },
          metadata: { nodeId: 'bulb-1', deviceId: 'LEXMAN_BULB', deviceType: 'lights' },
        },
        {
          title: { label: 'Coffee outlet' },
          metadata: { nodeId: 'outlet-1', deviceId: 'NODON_OUTLET', deviceType: 'outlets' },
        },
        {
          title: { label: 'Kitchen shutter' },
          metadata: {
            nodeId: 'shutter-1',
            deviceId: 'DIO_SHUTTER',
            deviceType: 'access_and_motorizations',
          },
        },
        {
          title: { label: 'Hallway sensor' },
          metadata: { nodeId: 'sensor-1', deviceId: 'LEXMAN_MULTI', deviceType: 'sensors' },
        },
        {
          title: { label: 'Living room radiator' },
          metadata: {
            nodeId: 'heater-1',
            deviceId: 'EQUATION_HEATER',
            deviceType: 'heaters_and_pilot_wires',
          },
        },
        {
          title: { label: 'Office pilot wire' },
          metadata: {
            nodeId: 'pilot-1',
            deviceId: 'LEXMAN_PILOT',
            deviceType: 'heaters_and_pilot_wires',
          },
        },
        { title: { label: 'A room group' }, metadata: {} },
      ],
    },
  ],
};

// GET /api-enki-referentiel-agg-prod/v1/devices/{deviceId}
export const REFERENTIEL = {
  AD_TCFL_1: {
    type: 'ceiling_fans',
    modelNumber: 'Siroco+',
    capabilities: [
      'check_electrical_power',
      'switch_electrical_power',
      'change_brightness',
      'change_color_temperature',
      'change_light_state',
      'check_light_state',
      'change_fan_rotation_direction',
      'check_fan_rotation_direction',
      'check_fan_speed',
      'change_fan_speed',
      'change_airflow_mode',
      'check_airflow_mode',
    ],
    possibleValues: {
      change_brightness: { format: 'RANGE', range: { min: 0, max: 1, step: 0.01 } },
      change_color_temperature: {
        format: 'VALUES',
        values: ['T2750K', 'T3500K', 'T4000K', 'T5000K', 'T6500K'],
      },
      change_fan_speed: { format: 'RANGE', range: { min: 0, max: 6, step: 1 } },
      change_fan_rotation_direction: {
        format: 'VALUES',
        values: ['CLOCKWISE', 'COUNTERCLOCKWISE'],
      },
      change_airflow_mode: { format: 'VALUES', values: ['BREEZE', 'MANUAL'] },
    },
  },
  LEXMAN_BULB: {
    type: 'lights',
    reference: 'Lexman E27',
    capabilities: [
      'check_light_state',
      'change_light_state',
      'change_brightness',
      'change_color_temperature',
    ],
    possibleValues: {
      change_brightness: { format: 'RANGE', range: { min: 0, max: 1, step: 0.01 } },
      change_color_temperature: { format: 'VALUES', values: ['T2700K', 'T4000K', 'T6500K'] },
    },
  },
  // A simple on/off outlet.
  NODON_OUTLET: {
    type: 'outlets',
    reference: 'Nodon SIN-4-1-20',
    capabilities: ['check_electrical_power', 'switch_electrical_power'],
    possibleValues: { switch_electrical_power: { format: 'VALUES', values: ['ON', 'OFF'] } },
  },
  // A position roller shutter with a stop command.
  DIO_SHUTTER: {
    type: 'access_and_motorizations',
    reference: 'Dio Shutter',
    capabilities: [
      'check_shutter_position',
      'change_shutter_position',
      'stop_change_shutter_position',
    ],
    possibleValues: { change_shutter_position: { format: 'RANGE', range: { min: 0, max: 100 } } },
  },
  // A thermostat radiator: setpoint (target temperature) + current temperature.
  EQUATION_HEATER: {
    type: 'heaters_and_pilot_wires',
    reference: 'Equation Radiator',
    capabilities: [
      'check_thermostat_target_temperature',
      'change_thermostat_target_temperature',
      'check_thermostat_running_state',
      'check_current_temperature',
    ],
    possibleValues: {
      change_thermostat_target_temperature: {
        format: 'RANGE',
        range: { min: 7, max: 28, step: 0.5 },
      },
      check_current_temperature: { format: 'RANGE', range: { min: 0, max: 40 } },
    },
  },
  // A pilot-wire radiator (fil pilote).
  LEXMAN_PILOT: {
    type: 'heaters_and_pilot_wires',
    reference: 'Lexman Fil Pilote',
    capabilities: ['check_pilot_wire_state', 'switch_pilot_wire_mode'],
    possibleValues: {
      switch_pilot_wire_mode: {
        format: 'VALUES',
        values: ['COMFORT', 'COMFORT_1', 'COMFORT_2', 'ECO', 'FROST_PROTECTION', 'OFF'],
      },
    },
  },
  // A multisensor: temperature + humidity + motion + battery health.
  LEXMAN_MULTI: {
    type: 'sensors',
    reference: 'Lexman Multi',
    capabilities: [
      'check_current_temperature',
      'check_current_humidity',
      'check_motion_detection',
      'check_battery_health',
    ],
    possibleValues: {
      check_current_temperature: { format: 'RANGE', range: { min: 0, max: 40 } },
      check_current_humidity: { format: 'RANGE', range: { min: 0, max: 100 } },
    },
  },
};

// GET /api-enki-lighting-prod/v1/lighting/{node}/check-light-state
export const LIGHT_STATE = {
  'fan-node-1': { lastReportedValue: { power: 'OFF', brightness: 0.5, colorMode: 'ct' } },
  'bulb-1': {
    lastReportedValue: {
      power: 'ON',
      brightness: 0.8,
      colorMode: 'ct',
      hue: null,
      saturation: null,
      colorTemperature: 'T2700K',
    },
  },
};

// GET .../airflow/{node}/check-fan-speed  and  .../check-fan-rotation-direction
export const FAN_SPEED = { 'fan-node-1': { lastReportedValue: 3 } };
export const FAN_ROTATION = { 'fan-node-1': { lastReportedValue: 'CLOCKWISE' } };

// GET .../power/{node}/check-electrical-power
export const POWER_STATE = { 'outlet-1': { lastReportedValue: 'ON' } };

// GET .../shutter/{node}/check-shutter-position
export const SHUTTER_POSITION = { 'shutter-1': { lastReportedValue: 40 } };

// GET {sensor-service}/{node}/{check-*} keyed by node then HTTP action. The
// heater's current temperature is served by the temperature-humidity service.
export const SENSOR_STATE = {
  'sensor-1': {
    'check-current-temperature': { lastReportedValue: 21.5 },
    'check-current-humidity': { lastReportedValue: 55 },
    'check-motion-detection': { lastReportedValue: 'MOTION_DETECTED' },
    'check-battery-health': { lastReportedValue: 'GOOD' },
  },
  'heater-1': {
    'check-current-temperature': { lastReportedValue: 20.5 },
  },
};

// GET /api-enki-thermostat-prod/v1/heating/{node}/{check-*} keyed by node then action.
export const THERMOSTAT_STATE = {
  'heater-1': {
    'check-thermostat-target-temperature': { lastReportedValue: 19.5 },
  },
  'pilot-1': {
    'check-pilot-wire-state': { lastReportedValue: 'COMFORT' },
  },
};
