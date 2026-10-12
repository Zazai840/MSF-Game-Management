import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './style.css';
const root = document.getElementById('root')!;
if (root.dataset.unsupported !== 'true') createRoot(root).render(<App />);
