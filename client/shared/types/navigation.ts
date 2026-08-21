export interface SearchDestination {
  name: string;
  latitude: number;
  longitude: number;
}

export const isSearchDestination = (value: unknown): value is SearchDestination => {
  if (typeof value !== 'object' || value === null) return false;

  const destination = value as Record<string, unknown>;

  return (
    typeof destination.name === 'string' &&
    typeof destination.latitude === 'number' &&
    typeof destination.longitude === 'number'
  );
};
