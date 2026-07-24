# Gladys Enki integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
controls your **Enki** (Leroy Merlin / Adeo) devices — lights, ceiling fans,
outlets, roller shutters and sensors — through the Enki cloud, using the same
account as the Enki mobile app.

Built from the official
[`integration-template-js`](https://github.com/GladysAssistant/integration-template-js)
template with the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

## What it does

- Logs in to the Enki cloud (Keycloak OAuth, resource-owner password grant) with
  the email / password filled in the integration settings (the password is a
  `secret` config field, never sent back to the frontend).
- Discovers the account's Enki devices, across all homes, and publishes them as
  **discovered devices**: the user creates them from the Gladys Discovery
  screen. Device detection is **capability-based** (it reads the Enki
  referentiel), so any model exposing a supported capability works without a
  code change — roughly **155 of the ~210 catalogued Enki models**. Devices with
  no supported capability (stateless remotes, cameras, …) are skipped.
- Features exposed per device:

  | Feature            | Category / type                     | Enki mapping                                                      |
  | ------------------ | ----------------------------------- | ----------------------------------------------------------------- |
  | Light              | `light` / `binary`                  | `change-light-state` `power` ON/OFF                               |
  | Brightness         | `light` / `brightness`              | `brightness` (Gladys 0–100 ↔ Enki 0–max)                          |
  | Color temperature  | `light` / `temperature`             | `colorTemperature` `T<kelvin>K` (Gladys mireds ↔ nearest kelvin)  |
  | Color              | `light` / `color`                   | `hue` / `saturation` (Gladys RGB int ↔ Enki 0–1)                  |
  | Fan speed          | `fan` / `percent`                   | `change-fan-speed` (Gladys 0–100 ↔ Enki 0–6)                      |
  | Airflow direction  | `fan` / `airflow-direction`         | `change-fan-rotation-direction` (CLOCKWISE / COUNTERCLOCKWISE)    |
  | Power (outlet)     | `switch` / `binary`                 | `switch-electrical-power` ON/OFF                                  |
  | Shutter position   | `shutter` / `position`              | `change-shutter-position` (0–100), `stop-change-shutter-position` |
  | Temperature        | `temperature-sensor`                | `check-current-temperature` (read-only)                           |
  | Humidity           | `humidity-sensor`                   | `check-current-humidity` (read-only)                              |
  | Illuminance        | `light-sensor`                      | `check-illuminance-level` (read-only)                             |
  | Motion             | `motion-sensor` / binary            | `check-motion-detection` (read-only)                              |
  | Opening            | `opening-sensor` / binary           | `check-contact-sensor-state` (read-only)                          |
  | Water leak         | `leak-sensor` / binary              | `check-water-sensor-state` (read-only)                            |
  | Low battery        | `battery-low` / binary              | `check-battery-health` (read-only)                                |
  | Target temperature | `thermostat` / `target-temperature` | `override-commands` DEROGATION (fallback direct POST)             |
  | Pilot-wire mode    | `heater` / `pilot-wire-mode`        | `switch-pilot-wire-mode` (OFF/FROST_PROTECTION/ECO/COMFORT…)      |

  A ceiling fan node with a light kit exposes the fan **and** the light features
  on the same device; a multisensor exposes each reading it advertises; a
  radiator exposes its setpoint **and** its current temperature. Features appear
  only when the device's referentiel advertises the matching capability.

  **Not yet handled:** sirens, cameras, energy metering, and stateless remotes.

- Devices are **polled every 15 seconds** and the states are pushed back to
  Gladys.
- Commands go to the Enki micro-services: lighting via `change-light-state`
  (the full `lastReportedValue` is re-sent on every write, as Enki requires),
  ventilation via the `api-enki-airflow-prod` `change-*` endpoints.
- The Enki **homeId** and the device's capability profile are stored as device
  params: Gladys sends them back with every poll / set-value command, so no
  extra referentiel call is needed at poll time.
- When the Enki session expires (HTTP 401), the client re-authenticates once and
  retries the request; tokens are renewed with the refresh token when possible.

## Enki cloud API

The Enki cloud is a set of REST micro-services behind one API gateway
(`https://enki.api.devportal.adeo.cloud`). Auth is OAuth (Keycloak realm `enki`,
client `enki-front`). Every gateway call carries the OAuth Bearer token **and** a
per-service `X-Gateway-APIKey` header — those keys are shipped in the official
mobile app (they are not per-account secrets) and are pinned in
[`src/constants.js`](src/constants.js). Most calls also carry a `homeId` header.

This API is **unofficial**; it was documented by the community Home Assistant
integrations
([cyrilcolinet](https://github.com/cyrilcolinet/enki-integration-hass),
[clamoriniere](https://github.com/clamoriniere/homeassistant-enki-integration)).
This project is not affiliated with Leroy Merlin, Adeo or Enki.

## Development

```bash
npm install
npm test          # unit tests + a full end-to-end test (fake Gladys + fake Enki)
npm run lint
npm run format
```

To validate the manifest before publishing:

```bash
npx --yes github:GladysAssistant/integration-store .
```

See [`docs/en.md`](docs/en.md) / [`docs/fr.md`](docs/fr.md) for the end-user
documentation.

## License

Apache-2.0
