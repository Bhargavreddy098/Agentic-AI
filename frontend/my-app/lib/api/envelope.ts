import type { EnvelopeShape } from './types.ts';

export async function unwrapEnvelope(shape: EnvelopeShape, response: { json?: () => Promise<unknown>; arrayBuffer?: () => Promise<ArrayBuffer>; status: number; headers?: any }) {
  if (shape === 'none') {
    return { data: null };
  }
  if (shape === 'bytes') {
    if (response.arrayBuffer) {
      const buf = await response.arrayBuffer();
      return { data: buf };
    }
    return { data: null };
  }
  if (!response.json) {
    return { data: null };
  }
  const body: any = await response.json();
  if (shape === 'enveloped') {
    return { data: body?.data, meta: body?.meta };
  }
  return { data: body };
}
