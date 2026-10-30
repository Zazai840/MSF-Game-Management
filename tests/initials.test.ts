import { expect, test } from 'vitest';
import { initials } from '../src/client/shell/AppHeader.js';
test('initials take the first and last word, skipping a number that owner or Lead sign-in added to a taken name', () => {
  expect(initials('Sara Taken Lead iPhone 2')).toBe('SI');
  expect(initials('Sam Patel')).toBe('SP');
  expect(initials('Cher')).toBe('C');
  expect(initials('Agent 47')).toBe('A4');
});
