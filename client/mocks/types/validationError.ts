export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationErrorResponse {
  message: string;
  errors: FieldError[];
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  traceId: string | null;
}
