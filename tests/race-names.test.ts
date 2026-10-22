import { expect,test } from 'vitest';
import { raceLabel,runnersText } from '../src/shared/races.js';
test('a race reads the same way everywhere',()=>{
  expect(raceLabel({kind:'heat',number:2})).toBe('Heat 2');
  expect(raceLabel({kind:'race',number:3})).toBe('Race 3');
  expect(runnersText(4)).toBe('4 runners');
  expect(runnersText(1)).toBe('1 runner');
});
