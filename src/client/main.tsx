import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { followKeyboard } from './flow/keyboard.js';
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
  followKeyboard();
  // PROTOTYPE (map #231, ticket #243): tie sheet and Confirm the medals in the new look, client only, never merged.
  if(location.pathname.startsWith('/prototype/lead-sheets')) void import('./lead/LeadSheets.prototype.js').then(({LeadSheetsPrototype})=>createRoot(root).render(<LeadSheetsPrototype/>));
  else {
    startUpdates();
    createRoot(root).render(<App />);
  }
}
