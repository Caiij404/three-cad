<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Constraint, SketchFeature, Vec2 } from '../core/model/document.ts';
import type { SketchDiagnostics } from '../core/sketch-solution.ts';
import { addSketchConstraint, editSketchConstraint, removeSketchConstraint } from '../core/geometry/constraint-edit.ts';
import { SketchRejectedError } from '../app/sketch-recompute.ts';
const props = defineProps<{ sketch: SketchFeature; diagnostics?: SketchDiagnostics; selectionIds: string[]; revision: number; busy: boolean; creating: boolean; commit: (sketch: SketchFeature) => Promise<SketchFeature> }>();
const emit = defineEmits<{ select: [ids: string[]] }>();
const names: Record<Constraint['kind'], string> = { coincident: '重合', horizontal: '水平', vertical: '垂直', parallel: '平行', perpendicular: '正交', distance: '点距', length: '线长', angle: '角度', radius: '半径', equal: '相等', tangent: '相切', fixed: '固定点' };
const kind = ref<Constraint['kind']>('length'), newValue = ref('40'), error = ref(''), attempt = ref(''), conflicts = ref<string[]>([]), running = ref(false);
const drafts = ref<Record<string, { value: string; x: string; y: string }>>({});
const disabled = computed(() => props.busy || running.value);
const attemptName = computed(() => attempt.value === 'inconsistent' ? '约束冲突' : attempt.value === 'solver-failed' ? '求解失败' : '输入或几何检查未通过');
const dimensional = (type: Constraint['kind']) => ['length', 'distance', 'radius', 'angle'].includes(type);
const unit = (type: Constraint['kind']) => type === 'angle' ? '°' : 'mm';
const objectName = (id: string) => { const pi = props.sketch.points.findIndex(p => p.id === id); if (pi >= 0) return `点 ${pi + 1}`; const ei = props.sketch.entities.findIndex(e => e.id === id); const e = props.sketch.entities[ei]; return e ? `${e.kind === 'line' ? '线段' : e.kind === 'circle' ? '圆' : '圆弧'} ${ei + 1}` : '缺失对象'; };
const referenceText = (c: Constraint) => c.refs.map(r => objectName('pointId' in r ? r.pointId : r.entityId)).join(' / ');
const selectionText = computed(() => props.selectionIds.map(objectName).join(' / ') || '尚未选择对象');
watch(() => props.sketch.constraints.map(c => [c.id, c.value, c.fixedPosition]), () => {
  const next: typeof drafts.value = {};
  for (const c of props.sketch.constraints) next[c.id] = { value: String(c.kind === 'angle' ? (c.value ?? 0) * 180 / Math.PI : c.value ?? ''), x: String(c.fixedPosition?.[0] ?? ''), y: String(c.fixedPosition?.[1] ?? '') };
  drafts.value = next;
}, { immediate: true });
watch(() => [props.revision, props.sketch.id], () => { error.value = ''; attempt.value = ''; conflicts.value = []; });
function number(text: string) { if (!text.trim() || !Number.isFinite(Number(text))) throw new Error('请输入有限数值'); return Number(text); }
function value(type: Constraint['kind'], text: string) { const n = number(text); return type === 'angle' ? n * Math.PI / 180 : n; }
async function apply(candidate: () => SketchFeature) {
  if (disabled.value) return; error.value = ''; attempt.value = ''; conflicts.value = []; running.value = true;
  try { await props.commit(candidate()); }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    attempt.value = cause instanceof SketchRejectedError ? cause.diagnostics.status : 'validation-failed';
    if (cause instanceof SketchRejectedError) conflicts.value = cause.diagnostics.failedConstraintIds;
  } finally { running.value = false; }
}
function add() { void apply(() => addSketchConstraint(props.sketch, kind.value, props.selectionIds, dimensional(kind.value) ? value(kind.value, newValue.value) : undefined)); }
function edit(c: Constraint) { void apply(() => { const d = drafts.value[c.id]!; return editSketchConstraint(props.sketch, c.id, c.kind === 'fixed' ? { fixedPosition: [number(d.x), number(d.y)] as Vec2 } : { value: value(c.kind, d.value) }); }); }
function remove(id: string) { void apply(() => removeSketchConstraint(props.sketch, id)); }
</script>
<template>
  <section class="constraint-panel" aria-label="草图约束">
    <h3>约束与尺寸</h3>
    <p class="solve-status" data-testid="sketch-solve-status" :data-solve-status="diagnostics?.status ?? 'unsolved'">
      {{ diagnostics ? `${diagnostics.status === 'fully-constrained' ? '完全约束' : '欠约束'} · ${diagnostics.status} · DOF ${diagnostics.dof}` : '尚无真实求解结果' }}
    </p>
    <p v-if="diagnostics?.redundantConstraintIds?.length">有 {{ diagnostics.redundantConstraintIds.length }} 项冗余约束，几何仍有效。</p>
    <p v-if="error" role="alert" :data-attempt-state="attempt" class="error-message">{{ attemptName }}：{{ error }}。现有草图与历史保持不变。</p>
    <form v-if="creating" class="constraint-create" @submit.prevent="add">
      <label>约束类型<select v-model="kind" aria-label="约束类型" :disabled="disabled"><option v-for="(name,key) in names" :key="key" :value="key">{{ name }} · {{ key }}</option></select></label>
      <p>引用：{{ selectionText }}</p><p>在视口或“草图对象”选择；Ctrl 可多选。固定点使用当前坐标。</p>
      <label v-if="dimensional(kind)">新约束数值 ({{ unit(kind) }})<input v-model="newValue" type="text" inputmode="decimal" :disabled="disabled" /></label>
      <button type="submit" :disabled="disabled">添加约束</button>
    </form>
    <p v-if="!sketch.constraints.length">尚无约束；选择对象后点击工具栏“约束”。</p>
    <ol class="constraint-list">
      <li v-for="(c,index) in sketch.constraints" :key="c.id" :data-constraint-id="c.id" :data-conflict="conflicts.includes(c.id)">
        <p><strong>{{ names[c.kind] }} {{ index + 1 }}</strong><span v-if="diagnostics?.redundantConstraintIds?.includes(c.id)"> · 冗余</span></p>
        <button type="button" class="constraint-reference" :disabled="disabled" @click="emit('select', c.refs.map(r => 'pointId' in r ? r.pointId : r.entityId))">{{ referenceText(c) }}</button>
        <form v-if="dimensional(c.kind) && drafts[c.id]" @submit.prevent="edit(c)">
          <label>约束数值 ({{ unit(c.kind) }})<input v-model="drafts[c.id]!.value" type="text" inputmode="decimal" :disabled="disabled" /></label>
          <button type="submit" :disabled="disabled">应用数值</button>
        </form>
        <form v-else-if="c.kind === 'fixed' && drafts[c.id]" @submit.prevent="edit(c)">
          <label>固定 X (mm)<input v-model="drafts[c.id]!.x" type="text" inputmode="decimal" :disabled="disabled" /></label>
          <label>固定 Y (mm)<input v-model="drafts[c.id]!.y" type="text" inputmode="decimal" :disabled="disabled" /></label>
          <button type="submit" :disabled="disabled">应用坐标</button>
        </form>
        <button type="button" :disabled="disabled" @click="remove(c.id)">删除约束</button>
      </li>
    </ol>
    <details><summary>查看真实求解诊断</summary><pre data-testid="active-sketch-diagnostics">{{ JSON.stringify(diagnostics ?? null, null, 2) }}</pre></details>
  </section>
</template>
