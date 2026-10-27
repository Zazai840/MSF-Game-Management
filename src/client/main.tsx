import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { startUpdates } from './shell/updates.js';
import './theme.css';
import './style.css';
// After the older look, so the race flow's reset of its bare element rules wins inside .rz-screen.
import './races/rz.css';
import './races/race-flow.css';
const root = document.getElementById('root')!;
if (root.dataset.unsupported !== 'true') {
  // Ask the browser to keep the pass and profiles even when the phone is short of space; carry on if it says no.
  void navigator.storage?.persist?.().catch(()=>false);
  startUpdates();
  createRoot(root).render(<App />);
}
