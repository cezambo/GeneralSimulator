/**
 * Envelope e parse. 05-PROTOCOLO.md §3, §8.
 */

import {
  PROTOCOL_VERSION,
  type Envelope,
  type ErrorPayload,
} from './types.js';

export class ProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export function makeEnvelope<T>(
  type: string,
  payload: T,
  opts: { seq: number; simTime: number; reqId?: string },
): Envelope<T> {
  const env: Envelope<T> = {
    v: PROTOCOL_VERSION,
    type,
    seq: opts.seq,
    simTime: opts.simTime,
    payload,
  };
  if (opts.reqId !== undefined) {
    return { ...env, reqId: opts.reqId };
  }
  return env;
}

export function makeError(
  code: string,
  message: string,
  opts: { seq: number; simTime: number; reqId?: string },
): Envelope<ErrorPayload> {
  return makeEnvelope('res.error', { code, message }, opts);
}

/**
 * Aceita string JSON ou objeto. Recusa versão incompatível com erro explícito.
 */
export function parseEnvelope(raw: unknown): Envelope {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ProtocolError('BAD_JSON', 'mensagem não é JSON válido');
    }
  }
  if (!value || typeof value !== 'object') {
    throw new ProtocolError('BAD_ENVELOPE', 'envelope deve ser um objeto');
  }
  const o = value as Record<string, unknown>;
  if (typeof o['v'] !== 'number') {
    throw new ProtocolError('BAD_ENVELOPE', 'campo v ausente');
  }
  if (o['v'] !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      'VERSION_MISMATCH',
      `protocolo v=${String(o['v'])}; este núcleo fala v=${PROTOCOL_VERSION}`,
    );
  }
  if (typeof o['type'] !== 'string' || o['type'].length === 0) {
    throw new ProtocolError('BAD_ENVELOPE', 'campo type ausente');
  }
  if (typeof o['seq'] !== 'number') {
    throw new ProtocolError('BAD_ENVELOPE', 'campo seq ausente');
  }
  if (typeof o['simTime'] !== 'number') {
    throw new ProtocolError('BAD_ENVELOPE', 'campo simTime ausente');
  }
  if (!('payload' in o)) {
    throw new ProtocolError('BAD_ENVELOPE', 'campo payload ausente');
  }
  const env: Envelope = {
    v: o['v'],
    type: o['type'],
    seq: o['seq'],
    simTime: o['simTime'],
    payload: o['payload'],
  };
  if (typeof o['reqId'] === 'string') {
    return { ...env, reqId: o['reqId'] };
  }
  return env;
}
