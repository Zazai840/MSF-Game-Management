import { describe,expect,it } from 'vitest';
import { plainWristbandWarning } from '../src/shared/wristband-checks.js';
describe('plain wristband warnings for volunteers',()=>{
  it('names the race section and its wristband range',()=>{
    expect(plainWristbandWarning({kind:'wrong-section'},1450,'Boy Beavers')).toBe('1450 is not a Boy Beavers number. Beaver wristbands are 1 to 999.');
    expect(plainWristbandWarning({kind:'wrong-section'},3045,'Girl Cubs')).toBe('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  });
  it('explains unknown numbers and runners who already ran',()=>{
    expect(plainWristbandWarning({kind:'unknown-number'},0,'Girl Cubs')).toBe('0 is not a wristband number. Wristbands are 1 to 4999.');
    expect(plainWristbandWarning({kind:'already-ran'},2008,'Girl Cubs')).toBe('2008 already ran in another race of this event.');
  });
});
