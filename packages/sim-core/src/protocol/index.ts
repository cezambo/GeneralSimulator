/** Protocolo núcleo ↔ clientes. X-007, 05-PROTOCOLO.md. */

export * from './types.js';
export * from './envelope.js';
export * from './snapshot.js';
export * from './hub.js';
export { startProtocolServer, type ProtocolServer, type ProtocolServerOptions } from './server.js';
