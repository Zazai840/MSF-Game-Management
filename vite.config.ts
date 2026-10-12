import { defineConfig } from 'vite';
import { appShell } from './scripts/app-shell.js';
export default defineConfig({plugins:[appShell()],build:{outDir:'dist/web', manifest:true, target:'es2020'}, server:{host:'127.0.0.1'}});
