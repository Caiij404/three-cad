import type { Feature } from '../model/document.ts';
import { dependencies, topologicalOrder } from './dependency-graph.ts';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function geometry(feature: Feature): string {
  const { name, visible, ...definition } = feature; void name; void visible;
  return stable(definition);
}

/** Changed definitions and missing derivations seed a single topological forward pass. */
export function recomputePlan(features: Feature[], previous: Feature[], cachedSolidIds: Set<string>, solvedSketchIds: Set<string>): string[] {
  const order = topologicalOrder(features), byId = new Map(features.map(f => [f.id, f])), old = new Map(previous.map(f => [f.id, f])), affected = new Set<string>();
  for (const id of order) {
    const feature = byId.get(id)!, before = old.get(id);
    const missing = feature.kind === 'sketch' ? !!(feature.points.length || feature.entities.length || feature.constraints.length) && !solvedSketchIds.has(id) : !cachedSolidIds.has(id);
    if (!before || geometry(feature) !== geometry(before) || missing || dependencies(feature).some(parent => affected.has(parent))) affected.add(id);
  }
  return order.filter(id => affected.has(id));
}
