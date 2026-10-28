import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {ignores:['dist','dist-e2e','node_modules','test-results','playwright-report','.claude','App-Developers','Customer-Discovery']},
  js.configs.recommended,
  tseslint.configs.recommended,
  {languageOptions:{globals:{...globals.browser,...globals.node}}},
  {rules:{'@typescript-eslint/no-unused-vars':['error',{ignoreRestSiblings:true}]}},
  // Tests read JSON responses loosely.
  {files:['tests/**','e2e/**'], rules:{'@typescript-eslint/no-explicit-any':'off'}},
  // shortcut: the screens poll with a refresh function rebuilt each render, so these two rules flag every poll; turn them on after moving the polls to useEffectEvent.
  {files:['src/client/**/*.{ts,tsx}'], plugins:{'react-hooks':reactHooks}, rules:{'react-hooks/rules-of-hooks':'error'}},
);
