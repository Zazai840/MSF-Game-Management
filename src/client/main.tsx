import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { UpdatePrompt } from './shell/UpdatePrompt.js';
import './theme.css';
import './style.css';
const root = document.getElementById('root')!;
if (root.dataset.unsupported !== 'true') {
  createRoot(root).render(<><UpdatePrompt /><App /></>);
}
