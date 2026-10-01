import { DomainError, type PlaneFrame, type Vec2, type Vec3 } from '../model/document.ts';
export type BasePlane='XY'|'XZ'|'YZ';
export const BASE_PLANES:Record<BasePlane,PlaneFrame>={
  XY:{origin:[0,0,0],u:[1,0,0],v:[0,1,0]},
  XZ:{origin:[0,0,0],u:[1,0,0],v:[0,0,1]},
  YZ:{origin:[0,0,0],u:[0,1,0],v:[0,0,1]},
};
export const dot=(a:Vec3,b:Vec3):number=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function check(plane:PlaneFrame):void {
  if([...plane.origin,...plane.u,...plane.v].some(v=>!Number.isFinite(v))||Math.abs(dot(plane.u,plane.u)-1)>1e-8
    ||Math.abs(dot(plane.v,plane.v)-1)>1e-8||Math.abs(dot(plane.u,plane.v))>1e-8)throw new DomainError('INVALID_PLANE','平面需有限、单位正交基向量');
}
export function toWorld(plane:PlaneFrame,point:Vec2):Vec3 {
  check(plane);if(point.some(v=>!Number.isFinite(v)))throw new DomainError('INVALID_POINT','坐标必须有限');
  return plane.origin.map((o,i)=>o+plane.u[i]!*point[0]+plane.v[i]!*point[1]) as Vec3;
}
export function toPlane(plane:PlaneFrame,world:Vec3,tolerance=1e-6):Vec2 {
  check(plane);if(world.some(v=>!Number.isFinite(v))||!Number.isFinite(tolerance)||tolerance<0)throw new DomainError('INVALID_POINT','坐标与容差必须有限');
  const delta=world.map((v,i)=>v-plane.origin[i]!) as Vec3;
  if(Math.abs(dot(delta,cross(plane.u,plane.v)))>tolerance)throw new DomainError('OFF_PLANE','世界坐标不在草图平面内');
  return [dot(delta,plane.u),dot(delta,plane.v)];
}
