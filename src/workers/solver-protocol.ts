import type { SolverResult, SolverSketch } from '../core/solver-types.ts';
export interface SolverRequest { sessionId: string; requestId: number; revision: number; input: SolverSketch }
export type SolverReply = Pick<SolverRequest, 'sessionId' | 'requestId' | 'revision'> &
  ({ ok: true; output: SolverResult } | { ok: false; error: string });
