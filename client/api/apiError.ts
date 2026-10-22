export type FieldError = {
  field: string;
  message: string;
};

export type ApiFailure =
  | {
      errorType: 'network';
    }
  | {
      errorType: 'http';
      status: number;
      serverMessage?: string;
      serverCode?: string;
      fieldErrors: FieldError[];
    }
  | {
      errorType: 'response';
      reason: 'json' | 'schema' | 'mismatch';
    };

export class ApiError extends Error {
  public readonly failure: ApiFailure;

  constructor(failure: ApiFailure, cause?: unknown) {
    super('API request failed', { cause });

    this.failure = failure;
    this.name = 'ApiError';
  }
}
