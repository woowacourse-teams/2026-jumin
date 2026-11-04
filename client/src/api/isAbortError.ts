export function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object') {
    return false;
  }

  if (error === null) {
    return false;
  }

  if (!('name' in error)) {
    return false;
  }

  return error.name === 'AbortError';
}
