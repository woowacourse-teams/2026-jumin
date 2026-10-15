import { options as loadOptions, viewport, recommendation } from './parking-api-load.js';

function workerCount(name, fallback) {
  const count = Number(__ENV[name] || fallback);
  if (!Number.isInteger(count) || count < 1 || count > 2000) {
    throw new Error(`${name} must be an integer from 1 to 2000.`);
  }
  return count;
}

export const options = {
  ...loadOptions,
  scenarios: Object.fromEntries(Object.entries(loadOptions.scenarios).map(([name, scenario]) => {
    const prefix = name === 'viewport' ? 'VIEWPORT' : 'RECOMMENDATION';
    const preAllocatedVUs = workerCount(`${prefix}_PRE_VUS`, scenario.preAllocatedVUs);
    const maxVUs = workerCount(`${prefix}_MAX_VUS`, scenario.maxVUs);
    if (maxVUs < preAllocatedVUs) throw new Error(`${prefix}_MAX_VUS must be >= preallocated VUs.`);
    return [name, { ...scenario, preAllocatedVUs, maxVUs }];
  })),
};

export { viewport, recommendation };
