import { expect, test } from 'vitest';
import { eventResults } from '../src/shared/results-rules.js';
test('a newly listed event has no ranked runners, qualifiers or open lead items', () => {
  expect(eventResults({event:{code:'R4', name:'60m', section:'Girl Cubs', format:'heats'}, races:[]})).toEqual({
    leaderboard:[], qualifiers:[], medalPlaces:[], ties:[], notRankedYet:[], needsYou:[]
  });
});
