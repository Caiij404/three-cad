import { createApp, markRaw } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import { ProjectSession } from './app/project-session.ts';
import { projectSessionKey } from './app/project-context.ts';

createApp(App).use(createPinia()).provide(projectSessionKey,markRaw(new ProjectSession())).mount('#app');
