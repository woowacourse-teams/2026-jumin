const JSDOMEnvironment = require('jest-environment-jsdom').TestEnvironment;

const nodeGlobals = {
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  FormData: globalThis.FormData,
  Blob: globalThis.Blob,
  File: globalThis.File,
  BroadcastChannel: globalThis.BroadcastChannel,
  ReadableStream: globalThis.ReadableStream,
  WritableStream: globalThis.WritableStream,
  TransformStream: globalThis.TransformStream,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
  structuredClone: globalThis.structuredClone,
};

class TestEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);

    Object.assign(this.global, nodeGlobals);

    this.global.fetch = (input, init) => {
      const request = typeof input === 'string' ? new URL(input, this.global.location.href) : input;

      return nodeGlobals.fetch(request, init);
    };
  }
}

module.exports = TestEnvironment;
