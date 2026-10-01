import type { SolverResult, SolverSketch } from '../core/solver-types.ts';
export interface SolverRequest { sessionId: string; requestId: number; revision: number; sketch: SolverSketch }
export type SolverReply = Pick<SolverRequest, 'sessionId' | 'requestId' | 'revision'> &
  ({ ok: true; result: SolverResult } | { ok: false; error: { code: string; message: string } });
