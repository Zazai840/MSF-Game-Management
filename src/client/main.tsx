import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { UpdatePrompt } from './shell/UpdatePrompt.js';
import './theme.css';
import './style.css';
const root = document.getElementById('root')!;
if (root.dataset.unsupported !== 'true') {
  // Ask the browser to keep the pass and profiles even when the phone is short of space; carry on if it says no.
  void navigator.storage?.persist?.().catch(()=>false);
  createRoot(root).render(<><UpdatePrompt /><App /></>);
}
