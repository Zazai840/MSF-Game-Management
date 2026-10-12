import { defineConfig } from 'vite';
export default defineConfig({build:{outDir:'dist/web', manifest:true, target:'es2020'}, server:{host:'127.0.0.1'}});
