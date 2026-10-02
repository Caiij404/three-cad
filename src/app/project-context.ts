import type { InjectionKey } from 'vue';
import type { ProjectSession } from './project-session.ts';
import type { ProjectRecovery } from './project-recovery.ts';
export const projectSessionKey:InjectionKey<ProjectSession>=Symbol('ProjectSession');
export const projectRecoveryKey:InjectionKey<ProjectRecovery>=Symbol('ProjectRecovery');
