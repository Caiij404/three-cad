import type { SketchSolver } from '../app/sketch-recompute.ts';
import type { SolidInput, TriangleMesh } from '../core/mesh-types.ts';
import { cross, toWorld } from '../core/geometry/plane.ts';
import { dot, norm, sub, meshMetrics, trianglePoints } from '../core/geometry/mesh-metrics.ts';
import { buildSketchRegions, selectSketchRegion } from '../core/geometry/sketch-regions.ts';
import { contourFixture, RECTANGLE_40_30, RECTANGLE_HOLE_10, type RegionFixture } from './region-fixtures.ts';
import type { SketchFeature, Vec2, Vec3 } from '../core/model/document.ts';
import type { SketchSolution } from '../core/sketch-solution.ts';
interface ExtrusionCase {
  id: string; input: SolidInput; native: Pick<SketchSolution, 'dof' | 'resultCode' | 'residuals'>;
  expected: { volumeMm3: number; bounds: { min: number[]; max: number[] }; volumeRelativeTolerance: number; boundsToleranceMm: number };
  actual: ReturnType<typeof meshMetrics>; relativeVolumeError: number;
  capTriangles: number; sideTriangles: number; normalFailures: number; holeWallFailures: number; passed: boolean;
}
const require = (condition: boolean, message: string) => { if (!condition) throw new Error(`EXTRUSION_FIXTURE: ${message}`); };

export async function runExtrusionFixtures(solve: SketchSolver, run: (input: SolidInput) => Promise<TriangleMesh>) {
  const rectangle: RegionFixture = { kind: 'polygon', id: 'outer', points: RECTANGLE_40_30 };
  const shapes: Array<{ id: string; fixtures: RegionFixture[]; areaMm2: number; min: Vec2; max: Vec2; curved?: boolean }> = [
    { id: 'rectangle', fixtures: [rectangle], areaMm2: 1200, min: [0, 0], max: [40, 30] },
    { id: 'hole', fixtures: [rectangle, { kind: 'polygon', id: 'hole', points: RECTANGLE_HOLE_10 }], areaMm2: 1100, min: [0, 0], max: [40, 30] },
    { id: 'circle', fixtures: [{ kind: 'circle', id: 'circle', center: [0, 0], radius: 10 }], areaMm2: 100 * Math.PI, min: [-10, -10], max: [10, 10], curved: true },
    { id: 'annulus', fixtures: [{ kind: 'circle', id: 'outer', center: [0, 0], radius: 10 }, { kind: 'circle', id: 'hole', center: [0, 0], radius: 3 }], areaMm2: 91 * Math.PI, min: [-10, -10], max: [10, 10], curved: true },
    ...[true, false].map(clockwise => ({ id: `half-${clockwise}`, fixtures: [{ kind: 'semicircle' as const, id: 'half', center: [0, 0] as Vec2, radius: 10, clockwise }], areaMm2: 50 * Math.PI, min: [-10, clockwise ? 0 : -10] as Vec2, max: [10, clockwise ? 10 : 0] as Vec2, curved: true })),
    { id: 'lens', fixtures: [{ kind: 'lens', id: 'lens' }], areaMm2: 50 * Math.acos(0.6) - 24, min: [-2, -4], max: [2, 4], curved: true },
    { id: 'collinear', fixtures: [{ kind: 'polygon', id: 'outer', points: [[0, 0], [20, 0], [40, 0], [40, 30], [0, 30]] },
      { kind: 'polygon', id: 'hole', points: [[15, 10], [20, 10], [25, 10], [25, 20], [15, 20]] }], areaMm2: 1100, min: [0, 0], max: [40, 30] },
    { id: 'concave', fixtures: [{ kind: 'polygon', id: 'outer', points: [[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]] }], areaMm2: 600, min: [0, 0], max: [40, 30] },
  ];
  const cases: ExtrusionCase[] = [];
  const solveInput = async (sketch: SketchFeature) => {
    const native = await solve({ sketch }, 0); require(native.sketch !== null, `${sketch.id} native refused`); require(native.dof === 0, `${sketch.id} DOF`);
    return { sketch: native.sketch!, native: { dof: native.dof, resultCode: native.resultCode, residuals: native.residuals } };
  };
  const measure = async (id: string, source: Awaited<ReturnType<typeof solveInput>>, depth: number, areaMm2: number, min: Vec2, max: Vec2, curved = false) => {
    const input: SolidInput = { kind: 'sketch-extrusion', sketch: source.sketch, region: selectSketchRegion(buildSketchRegions(source.sketch)).definition, depth };
    const before = JSON.stringify(input), mesh = await run(input), actual = meshMetrics(mesh), normal = cross(source.sketch.plane.u, source.sketch.plane.v);
    require(JSON.stringify(input) === before, `${id} mutated input`); require(actual.closed && actual.signedVolume > 0, `${id} invalid solid`);
    const expectedVolumeMm3 = areaMm2 * Math.abs(depth), relativeVolumeError = Math.abs(actual.signedVolume - expectedVolumeMm3) / expectedVolumeMm3;
    require(relativeVolumeError <= (curved ? 0.01 : 1e-8), `${id} volume ${actual.signedVolume} vs ${expectedVolumeMm3}`);
    const low = Math.min(0, depth), high = Math.max(0, depth), corners = [low, high].flatMap(d => [min, [max[0], min[1]], max, [min[0], max[1]]].map(p =>
      toWorld(source.sketch.plane, p as Vec2).map((n, axis) => n + normal[axis]! * d) as Vec3));
    const expectedBounds = { min: [0, 1, 2].map(a => Math.min(...corners.map(p => p[a]!))), max: [0, 1, 2].map(a => Math.max(...corners.map(p => p[a]!))) };
    for (const end of ['min', 'max'] as const) actual.bounds![end].forEach((v, a) => require(Math.abs(v - expectedBounds[end][a]!) <= 1e-6, `${id} ${end} bounds`));
    let caps = 0, sides = 0, normalFailures = 0, holeWallFailures = 0;
    const points = trianglePoints(mesh), origin = source.sketch.plane.origin;
    for (let i = 0; i < points.length; i += 3) {
      const triangle = points.slice(i, i + 3), faceNormal = cross(sub(triangle[1]!, triangle[0]!), sub(triangle[2]!, triangle[0]!));
      const depths = triangle.map(p => dot(sub(p, origin), normal)), normalDot = dot(faceNormal, normal) / norm(faceNormal);
      if (depths.every(d => Math.abs(d - high) <= 1e-6)) { caps++; if (normalDot < 1 - 1e-8) normalFailures++; }
      else if (depths.every(d => Math.abs(d - low) <= 1e-6)) { caps++; if (normalDot > -1 + 1e-8) normalFailures++; }
      else { sides++; if (Math.abs(normalDot) > 1e-8) normalFailures++;
        if (id.includes('annulus')) {
          const centroid = [0, 1, 2].map(a => triangle.reduce((sum, p) => sum + p[a]!, 0) / 3 - origin[a]!) as Vec3;
          const x = dot(centroid, source.sketch.plane.u), y = dot(centroid, source.sketch.plane.v);
          const radial: Vec3 = [0, 1, 2].map(a => x * source.sketch.plane.u[a]! + y * source.sketch.plane.v[a]!) as Vec3;
          if (dot(radial, faceNormal) * (Math.hypot(x, y) > 6 ? 1 : -1) <= 0) holeWallFailures++;
        }
      }
    }
    require(caps > 0 && sides > 0 && normalFailures === 0 && holeWallFailures === 0, `${id} cap/side/hole normal`);
    cases.push({ id, input, native: source.native, expected: { volumeMm3: expectedVolumeMm3, bounds: expectedBounds, volumeRelativeTolerance: curved ? 0.01 : 1e-8, boundsToleranceMm: 1e-6 },
      actual, relativeVolumeError, capTriangles: caps, sideTriangles: sides, normalFailures, holeWallFailures, passed: true });
  };
  for (const plane of ['XY', 'XZ', 'YZ'] as const) for (const shape of shapes) {
    const source = await solveInput(contourFixture(`${shape.id}-${plane}`, shape.fixtures, plane));
    for (const depth of [10, -10]) await measure(`${shape.id}-${plane}-${depth}`, source, depth, shape.areaMm2, shape.min, shape.max, shape.curved);
  }
  const obliqueInput = contourFixture('translated-oblique', [rectangle]);
  obliqueInput.plane = { origin: [50, -20, 10], u: [Math.SQRT1_2, Math.SQRT1_2, 0], v: [0, 0, 1] };
  const oblique = await solveInput(obliqueInput); for (const depth of [10, -10]) await measure(`translated-oblique-${depth}`, oblique, depth, 1200, [0, 0], [40, 30]);
  const rect = await solveInput(contourFixture('depth-boundaries', [rectangle]));
  for (const depth of [0.01, -0.01, 10000, -10000]) await measure(`depth-limit-${depth}`, rect, depth, 1200, [0, 0], [40, 30]);
  const base: SolidInput = { kind: 'sketch-extrusion', sketch: rect.sketch, region: selectSketchRegion(buildSketchRegions(rect.sketch)).definition, depth: 10 };
  const invalid: Array<{ id: string; input: SolidInput; expectedCode: string; actualCode: string; passed: boolean }> = [];
  const refused = async (id: string, input: SolidInput, code: string) => {
    let actualCode = ''; try { await run(input); } catch (cause) { actualCode = (cause as { code?: string }).code ?? ''; }
    require(actualCode === code, `${id} expected ${code} got ${actualCode}`); invalid.push({ id, input, expectedCode: code, actualCode, passed: true });
  };
  for (const depth of [0, 0.009, -0.009, 10000.01]) await refused(`depth-${depth}`, { ...base, depth }, 'INVALID_EXTRUSION_DEPTH');
  const open = structuredClone(rect.sketch); open.entities.pop(); await refused('open', { ...base, sketch: open, region: { outerEntityIds: open.entities.map(e => e.id), holeEntityIds: [] } }, 'CONTOUR_OPEN');
  const bow = await solveInput(contourFixture('bow-tie', [{ kind: 'polygon', id: 'bow', points: [[0, 0], [10, 10], [0, 10], [10, 0]] }]));
  await refused('self-intersection', { ...base, sketch: bow.sketch, region: { outerEntityIds: bow.sketch.entities.map(e => e.id), holeEntityIds: [] } }, 'CONTOUR_CONTACT');
  const tangent = await solveInput(contourFixture('tangent-hole', [rectangle, { kind: 'circle', id: 'hole', center: [10, 5], radius: 5 }]));
  await refused('tangent-hole', { ...base, sketch: tangent.sketch }, 'CONTOUR_CONTACT');
  const holed = await solveInput(contourFixture('omitted-hole', [rectangle, { kind: 'polygon', id: 'hole', points: RECTANGLE_HOLE_10 }]));
  await refused('omitted-hole', { ...base, sketch: holed.sketch }, 'REGION_HOLES_CHANGED');
  await refused('missing-reference', { ...base, region: { outerEntityIds: ['missing'], holeEntityIds: [] } }, 'REFERENCE_MISSING');
  const translated = structuredClone(rect.sketch); translated.plane.origin = [0, 0, 9999];
  await refused('world-depth-range', { ...base, sketch: translated }, 'EXTRUSION_WORKSPACE_RANGE');
  const recovered = meshMetrics(await run(base)); require(recovered.closed && Math.abs(recovered.signedVolume - 12000) < 1e-6, 'success after invalid input');
  return { cases, invalid, recoveryAfterErrors: recovered };
}
