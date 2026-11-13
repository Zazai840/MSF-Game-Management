import { expect,test } from 'vitest';
import { exportBehind,exportStatus,thisDayChosen } from '../src/shared/day.js';
test('the day export is behind once something changed after its last download',()=>{
  const at='2026-10-14T10:42:00Z';
  expect(exportBehind({exportedAt:null,exportedRevision:null,revision:4})).toBe(false);
  expect(exportBehind({exportedAt:at,exportedRevision:4,revision:4})).toBe(false);
  expect(exportBehind({exportedAt:at,exportedRevision:3,revision:4})).toBe(true);
  expect(exportStatus({exportedAt:null,exportedRevision:null,revision:4})).toBe('Not downloaded yet.');
  expect(exportStatus({exportedAt:at,exportedRevision:4,revision:4})).toMatch(/^Last downloaded \d\d:\d\d, includes every change so far\.$/);
  expect(exportStatus({exportedAt:at,exportedRevision:3,revision:4})).toMatch(/^Last downloaded \d\d:\d\d, with newer changes since\.$/);
});
test('This day is chosen once it has a region and a day',()=>{
  expect(thisDayChosen({region:null,dayNumber:null})).toBe(false);
  expect(thisDayChosen({region:'North',dayNumber:null})).toBe(false);
  expect(thisDayChosen({region:'North',dayNumber:2})).toBe(true);
});
