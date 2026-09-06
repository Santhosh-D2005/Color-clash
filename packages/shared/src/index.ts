export * from './types.js';
export * from './rng.js';
export * from './protocol.js';

/** Thrown by the engine for every rejected command. */
export class RuleError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RuleError';
  }
}
