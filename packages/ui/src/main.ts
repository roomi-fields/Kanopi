import { mount } from 'svelte';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/global.css';
import App from './App.svelte';
import { restoreWorkspace } from './lib/persistence/snapshot.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app root not found');

restoreWorkspace();
const app = mount(App, { target });

export default app;
