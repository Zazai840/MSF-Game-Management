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
  // PROTOTYPE (map ticket #186): the relays prototype, client only, never merged.
  if(location.pathname.startsWith('/prototype/relays')) void import('./races/Relays.prototype.js').then(({RelaysPrototype})=>createRoot(root).render(<RelaysPrototype/>));
  else {
    startUpdates();
    createRoot(root).render(<App />);
  }
}
