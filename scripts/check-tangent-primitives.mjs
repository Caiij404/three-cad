import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import createModule from '../public/wasm/slvs.mjs';
const errors=[],m=await createModule({printErr:s=>errors.push(s)}),records=[];
const accepted=code=>code===m.RESULT_OKAY||code===m.RESULT_REDUNDANT_OKAY;
for(const kind of ['circle-line','external-circles','internal-circles','arc-circle','line-extension-only','arc-outside-only']){
 m.clearSketch();try{
  const wp=m.addBase2D(1),nm=m.addNormal3D(1,1,0,0,0),point=(g,x,y)=>m.addPoint2D(g,x,y,wp),a=point(1,0,0),none=m.E_NONE;
  const isArc=kind==='arc-circle'||kind==='arc-outside-only';
  const curveA=isArc?m.addArc(2,nm,a,point(1,kind==='arc-outside-only'?0:10,kind==='arc-outside-only'?10:0),point(1,kind==='arc-outside-only'?-10:0,kind==='arc-outside-only'?0:10),wp):m.addCircle(2,nm,a,m.addDistance(2,10,wp),wp);
  if(!isArc)m.diameter(2,curveA,20);
  const isLine=kind==='circle-line'||kind==='line-extension-only',cp=point(2,isLine?0:10,isLine?(kind==='line-extension-only'?10:8):0),ra=m.addLine2D(2,a,cp,wp);
  const on=(type,p,e)=>m.addConstraint(2,type,wp,0,p,none,e,none,none,none,false,false);on(m.C_PT_ON_CIRCLE,cp,curveA);
  let targets=[];
  if(isLine){const group=kind==='line-extension-only'?1:2,p=point(group,-20,kind==='line-extension-only'?10:8),q=point(group,kind==='line-extension-only'?-15:20,kind==='line-extension-only'?10:8),line=m.addLine2D(2,p,q,wp);
   if(group===2){m.horizontal(2,line,wp,none);m.distance(2,p,q,40,wp);}on(m.C_PT_ON_LINE,cp,line);m.perpendicular(2,ra,line,wp,false);targets=[p,q,cp];
  }else{const b=point(2,kind==='internal-circles'?3:19,0),curveB=m.addCircle(2,nm,b,m.addDistance(2,8,wp),wp);m.diameter(2,curveB,16);m.horizontal(2,m.addLine2D(2,a,b,wp),wp,none);on(m.C_PT_ON_CIRCLE,cp,curveB);m.parallel(2,ra,m.addLine2D(2,b,cp,wp),wp);targets=[b,cp];}
  const result=m.solveSketch(2,true);assert(accepted(result.result));const positions=targets.map(p=>p.param.slice(0,2).map(h=>m.getParamValue(h)));positions.flat().forEach(n=>assert(Number.isFinite(n)));
  // Fixed group-1 point parameters also remain readable; these are actual native values.
  const contact=positions.at(-1);assert(Math.abs(Math.hypot(...contact)-10)<=1e-5);
  let finiteRange;
  if(isLine){const [p,q]=positions,dx=q[0]-p[0],dy=q[1]-p[1],t=((contact[0]-p[0])*dx+(contact[1]-p[1])*dy)/(dx*dx+dy*dy);finiteRange={lineParameter:t,inRange:t>=0&&t<=1};assert.equal(finiteRange.inRange,kind!=='line-extension-only');}
  else{const center=positions[0],expected=kind==='internal-circles'?2:18;assert(Math.abs(Math.hypot(...center)-expected)<=1e-5);assert(Math.abs(Math.hypot(contact[0]-center[0],contact[1]-center[1])-8)<=1e-5);
   if(isArc){const start=kind==='arc-outside-only'?Math.PI/2:0,end=kind==='arc-outside-only'?Math.PI:Math.PI/2,angle=Math.atan2(contact[1],contact[0]),offset=((angle-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);finiteRange={arcOffsetRadians:offset,arcSweepRadians:end-start,inRange:offset<=end-start+1e-6||offset>=2*Math.PI-1e-6};assert.equal(finiteRange.inRange,kind!=='arc-outside-only');}}
  records.push({kind,result:{code:result.result,dof:result.dof,nbad:result.nbad},positions,finiteRange,expected:kind.endsWith('only')?'native support curves accept; finite-domain adapter must reject':'actual contact lies in required geometry',passed:true});
 }finally{m.clearSketch();}
}
assert.equal(errors.length,0,errors.join('\n'));writeFileSync('docs/learning/evidence/T-201B1-tangent-primitives.json',JSON.stringify({task:'T-201B1',executedAt:new Date().toISOString(),command:'npm run check:tangent-primitives',environment:{node:process.version,platform:process.platform,solver:'fixed SolveSpace 2879a02d / existing WASM'},nativeConstants:{pointOnCircle:m.C_PT_ON_CIRCLE,pointOnLine:m.C_PT_ON_LINE,okay:m.RESULT_OKAY,redundantOkay:m.RESULT_REDUNDANT_OKAY},records,nativeErrors:errors,passed:true,limitations:['Node native primitive experiment only; full domain adapter, all pairings, Worker and rollback remain T-201B2.','No random or synthetic solution coordinates; supplied initial guesses are solved by real WASM.']},null,2)+'\n');console.log('PASS: 4 actual contact constructions and 2 finite-range counterexamples; no native errors.');
