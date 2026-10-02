import { createApp, markRaw } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import { ProjectSession } from './app/project-session.ts';
import { projectSessionKey, projectRecoveryKey } from './app/project-context.ts';
import { ProjectRecovery } from './app/project-recovery.ts';
import { IndexedDbRecoveryStore } from './adapters/files/recovery-store.ts';

const session=markRaw(new ProjectSession()),recovery=markRaw(new ProjectRecovery(session,new IndexedDbRecoveryStore()));
createApp(App).use(createPinia()).provide(projectSessionKey,session).provide(projectRecoveryKey,recovery).mount('#app');
