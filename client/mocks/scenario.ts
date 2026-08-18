export type MockScenario =
  | 'success'
  | 'destination-empty'
  | 'destination-rate-limited'
  | 'destination-failed'
  | 'parking-empty'
  | 'parking-slow'
  | 'parking-server-error'
  | 'parking-network-error';

const scenarios = new Set<MockScenario>([
  'success',
  'destination-empty',
  'destination-rate-limited',
  'destination-failed',
  'parking-empty',
  'parking-slow',
  'parking-server-error',
  'parking-network-error',
]);

export const getMockScenario = (): MockScenario => {
  const scenario = new URLSearchParams(window.location.search).get('mock');

  if (scenario && scenarios.has(scenario as MockScenario)) {
    return scenario as MockScenario;
  }

  return 'success';
};
