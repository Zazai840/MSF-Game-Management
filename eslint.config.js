import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const noTap={selector:"CallExpression[callee.property.name='tap']",message:'Use press(locator) from e2e/fixtures.ts: it taps on a phone project and clicks on desktop.'};

export default tseslint.config(
  {ignores:['dist','dist-e2e','node_modules','test-results','playwright-report','.claude','App-Developers','Customer-Discovery']},
  js.configs.recommended,
  tseslint.configs.recommended,
  {languageOptions:{globals:{...globals.browser,...globals.node}}},
  {rules:{'@typescript-eslint/no-unused-vars':['error',{ignoreRestSiblings:true}]}},
  // Tests read JSON responses loosely.
  {files:['tests/**','e2e/**'], rules:{'@typescript-eslint/no-explicit-any':'off'}},
  // A tap throws on a project without touch (desktop): press() taps on phones and clicks on desktop.
  {files:['e2e/**'], rules:{'no-restricted-syntax':['error',noTap]}},
  // Specs share one test day: every event goes through ownEvent, under a code from ownCode, so no two specs clash.
  {files:['e2e/**/*.spec.ts'], rules:{'no-restricted-syntax':['error',{selector:"Literal[value='/api/day/events']",message:'Make the event with ownEvent(request,await ownCode(),...) so its code is this test\'s alone.'},noTap]}},
  // shortcut: the screens poll with a refresh function rebuilt each render, so these two rules flag every poll; turn them on after moving the polls to useEffectEvent.
  {files:['src/client/**/*.{ts,tsx}'], plugins:{'react-hooks':reactHooks}, rules:{'react-hooks/rules-of-hooks':'error'}},
);
