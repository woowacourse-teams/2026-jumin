const destinationRoot = ['destination'] as const;

export const destinationKeys = {
  name: (latitude: number, longitude: number) =>
    [
      ...destinationRoot,
      'name',
      {
        latitude,
        longitude,
      },
    ] as const,

  search: (query: string, latitude: number, longitude: number) =>
    [
      ...destinationRoot,
      'search',
      {
        query,
        latitude,
        longitude,
      },
    ] as const,
};
