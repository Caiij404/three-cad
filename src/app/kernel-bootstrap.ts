import { SolverClient } from '../adapters/solver/solver-client.ts';
import { SolidClient } from '../adapters/solid/solid-client.ts';
import { rectangle } from '../experiments/solver-fixtures.ts';
import { checkSolid, solidFixtures } from '../experiments/solid-fixtures.ts';

// Owned by the workspace lifecycle, not by the Pinia snapshot.
export class KernelBootstrap {
  private solver=new SolverClient();
  private solid=new SolidClient();
  async probe():Promise<void> {
    await Promise.all([
      (async()=>{
        const result=await this.solver.solve(rectangle());
        const p0=result.points?.find(p=>p.id==='p0'),p1=result.points?.find(p=>p.id==='p1');
        if(result.status!=='fully-constrained'||result.dof!==0||!p0||!p1
          ||Math.abs(Math.hypot(p1.x-p0.x,p1.y-p0.y)-40)>1e-5)throw new Error('真实求解器启动检查失败');
      })(),
      (async()=>checkSolid(solidFixtures[3]!,await this.solid.run(solidFixtures[3]!.input)))(),
    ]);
  }
  dispose():void { this.solver.dispose();this.solid.dispose(); }
}
