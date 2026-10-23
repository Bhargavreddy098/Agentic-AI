export type EnvelopeShape = 'unwrapped' | 'enveloped' | 'none' | 'bytes';

export type ApiRoute = {
  stage: number;
  method: string;
  path: string;
  canonicalRoute: string;
  implemented?: boolean;
  authProfile: string;
  csrfRequired: boolean;
  idempotencyKeyRequired: boolean;
  ifMatchRequired: boolean;
  successStatus: number;
  responseEnvelope: EnvelopeShape;
  implementationFile: string;
  limitations: string[];
  requestDto?: string;
  responseDto?: string;
  contractErrors?: string;
  idempotencyMechanism?: string;
  responseEnvelopeRaw?: string;
};

export type ProblemDetails = {
  code: string;
  title: string;
  status: number;
  detail?: string;
  retryable: boolean;
  requestId?: string;
};

export type ApiResult<T> = { ok: true; data: T; status: number; meta?: {requestId?:string;version?:string;nextCursor?:string|null} } | { ok: false; problem: ProblemDetails };

export type RequestLogRecord = {
  id: string;
  method: string;
  pathTemplate: string;
  status: number;
  latencyMs: number;
  requestId?: string;
  contentType?: string;
};
