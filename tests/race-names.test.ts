import { expect,test } from 'vitest';
import { raceLine,raceName,racePickerLabel,raceSummary,runnersText } from '../src/shared/races.js';
const heat={kind:'heat' as const,number:2,event:{id:'e',code:'R4',name:'60m',section:'Girl Cubs' as const,format:'heats' as const,enabled:true}};
test('a race reads the same way on every job screen',()=>{
  expect(raceName(heat)).toBe('60m Girl Cubs Heat 2');
  expect(racePickerLabel(heat)).toBe('60m Girl Cubs (R4) · Heat 2');
  expect(raceSummary(heat,'1st: 2012')).toBe('60m Girl Cubs · Heat 2 · 1st: 2012');
  expect(raceLine(heat,1)).toBe('60m · Girl Cubs · Heat 2 · 1 runner');
  expect(runnersText(4)).toBe('4 runners');
});
