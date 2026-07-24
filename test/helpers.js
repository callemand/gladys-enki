// Minimal stand-in for the SDK's gladys.externalIds() used in unit tests.
export function fakeIds(slug, id, selector = 'test') {
  const device = `ext:${selector}:${slug}:${id}`;
  return { device, feature: (code) => `${device}:${code}` };
}
