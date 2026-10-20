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

  search: (query: string) =>
    [
      ...destinationRoot,
      'search',
      {
        query,
      },
    ] as const,
};
