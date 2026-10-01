export type ComputationState = 'loading' | 'ready' | 'running' | 'error';
export type InteractionMode = 'model.select' | 'sketch.select' | 'sketch.drawLine' | 'sketch.drawRectangle'
  | 'sketch.drawCircle' | 'sketch.drawArc' | 'sketch.constrain' | 'feature.previewExtrude' | 'feature.previewBoolean';
export interface WorkspaceState {
  computation: ComputationState;
  mode: InteractionMode;
  activeSketchId: string | null;
  selectionIds: string[];
  error: string | null;
  generation: number;
}
export type WorkspaceEvent =
  | { type: 'load' }
  | { type: 'loaded'; generation: number }
  | { type: 'load-failed'; generation: number; message: string }
  | { type: 'mode'; mode: InteractionMode; sketchId?: string }
  | { type: 'select'; ids: string[] }
  | { type: 'cancel' }
  | { type: 'compute' }
  | { type: 'computed'; generation: number }
  | { type: 'compute-failed'; generation: number; message: string };
export function initialWorkspaceState(): WorkspaceState {
  return { computation:'loading',mode:'model.select',activeSketchId:null,selectionIds:[],error:null,generation:0 };
}
export function transitionWorkspace(state: WorkspaceState, event: WorkspaceEvent): WorkspaceState {
  switch(event.type) {
    case 'load': return {...initialWorkspaceState(),generation:state.generation+1};
    case 'loaded': return state.computation==='loading' && event.generation===state.generation ? {...state,computation:'ready',error:null}:state;
    case 'load-failed': return state.computation==='loading' && event.generation===state.generation ? {...state,computation:'error',error:event.message}:state;
    case 'mode': {
      if(state.computation!=='ready')throw new Error('MODE_UNAVAILABLE: kernels are not ready');
      const activeSketchId=event.sketchId ?? state.activeSketchId;
      if(event.mode.startsWith('sketch.') && !activeSketchId)throw new Error('SKETCH_REQUIRED: enter a sketch first');
      return {...state,mode:event.mode,activeSketchId:event.mode==='model.select'?null:activeSketchId,selectionIds:[]};
    }
    case 'select': {
      if(state.computation!=='ready')return state;
      if(event.ids.some(id=>typeof id!=='string'||!id))throw new Error('INVALID_SELECTION_ID');
      return {...state,selectionIds:[...new Set(event.ids)]};
    }
    case 'cancel': return state.computation==='ready' ? {...state,mode:state.activeSketchId?'sketch.select':'model.select',selectionIds:[]}:state;
    case 'compute': {
      if(state.computation!=='ready')throw new Error('COMPUTE_UNAVAILABLE');
      return {...state,computation:'running',generation:state.generation+1,error:null};
    }
    case 'computed': return state.computation==='running' && event.generation===state.generation ? {...state,computation:'ready'}:state;
    case 'compute-failed': return state.computation==='running' && event.generation===state.generation ? {...state,computation:'error',error:event.message}:state;
  }
}
