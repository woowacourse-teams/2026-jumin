declare module '*.png' {
  const source: string;
  export default source;
}

declare module '*.jpg' {
  const source: string;
  export default source;
}

declare module '*.jpeg' {
  const source: string;
  export default source;
}

declare module '*.gif' {
  const source: string;
  export default source;
}

declare module '*.svg' {
  const source: string;
  export default source;
}

declare module '*.woff' {
  const source: string;
  export default source;
}

declare module '*.woff2' {
  const source: string;
  export default source;
}

declare module '*.eot' {
  const source: string;
  export default source;
}

declare module '*.ttf' {
  const source: string;
  export default source;
}

declare module '*.otf' {
  const source: string;
  export default source;
}

declare const __APP_CONFIG__: {
  apiBaseUrl: string;
  useMockApi: boolean;
  naverMapClientId: string;
  naverMapAppName: string;
  tmapAppKey: string;
  isProduction: boolean;
};

declare const process: {
  env: Record<string, string | undefined>;
};
