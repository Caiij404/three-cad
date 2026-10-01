import { DomainError, type ExtrudeFeature, type SketchFeature } from '../core/model/document.ts';
import type { SolidInput, TriangleMesh } from '../core/mesh-types.ts';

export interface ExtrusionPreviewValue { mesh: TriangleMesh; depth: number }
interface PreviewOptions {
  sketch: SketchFeature; feature: ExtrudeFeature;
  isCurrent: () => boolean; run: (input: SolidInput) => Promise<TriangleMesh>;
  preview: (value: ExtrusionPreviewValue | null) => void; error: (message: string) => void;
  commit: (feature: ExtrudeFeature) => Promise<void>; cancelRun: () => void;
}
/** One in-flight geometry request + one latest slot; no document/history writes during preview. */
export class ExtrusionPreview {
  private sketch: SketchFeature;
  private feature: ExtrudeFeature;
  private active = true;
  private finishing = false;
  private running = false;
  private sequence = 0;
  private pending: { sequence: number; depth: number } | null = null;
  private latest: { sequence: number; depth: number } | null = null;
  private failure: Error | null = null;
  private waiters: Array<() => void> = [];
  private options: PreviewOptions;
  constructor(options: PreviewOptions) { this.options = options; this.sketch = structuredClone(options.sketch); this.feature = structuredClone(options.feature); }
  update(depth: number): void {
    if (!this.active || this.finishing) return;
    this.pending = { sequence: ++this.sequence, depth }; this.latest = null; this.failure = null;
    this.options.preview(null); if (!this.running) void this.pump();
  }
  private async pump(): Promise<void> {
    this.running = true;
    try {
      while (this.active && this.pending) {
        const input = this.pending; this.pending = null;
        try {
          const mesh = await this.options.run({ kind: 'sketch-extrusion', sketch: structuredClone(this.sketch), region: structuredClone(this.feature.region), depth: input.depth });
          if (!this.active || !this.options.isCurrent() || input.sequence !== this.sequence) continue;
          this.latest = input; this.options.preview({ mesh, depth: input.depth });
        } catch (cause) {
          if (this.active && this.options.isCurrent() && input.sequence === this.sequence) {
            this.failure = cause instanceof Error ? cause : new Error(String(cause)); this.options.error(this.failure.message);
          }
        }
      }
    } finally { this.running = false; this.waiters.splice(0).forEach(resolve => resolve()); }
  }
  async finish(): Promise<boolean> {
    if (!this.active || this.finishing) return false; this.finishing = true;
    if (this.running) await new Promise<void>(resolve => this.waiters.push(resolve));
    if (!this.active) return false;
    if (!this.options.isCurrent()) { this.cancel(); throw new DomainError('STALE_PREVIEW', '来源草图或项目已改变，旧预览已丢弃'); }
    if (this.failure) { const error = this.failure; this.finishing = false; throw error; }
    if (!this.latest || this.latest.sequence !== this.sequence) { this.finishing = false; throw new DomainError('PREVIEW_REQUIRED', '请先生成有效拉伸预览'); }
    this.active = false;
    try { await this.options.commit({ ...structuredClone(this.feature), depth: this.latest.depth }); return true; }
    finally { this.options.preview(null); this.options.cancelRun(); }
  }
  cancel(): void {
    this.active = false; this.sequence++; this.pending = null; this.latest = null;
    this.options.preview(null); this.options.cancelRun(); this.waiters.splice(0).forEach(resolve => resolve());
  }
}
