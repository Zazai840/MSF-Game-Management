import { describe,expect,it } from 'vitest';
import { clock,clockWithSeconds } from '../src/shared/clock.js';
describe('clock',()=>{
  it('shows every time on the app as 24-hour hh:mm, whatever the phone language',()=>{
    const at=new Date(2026,9,16,21,5,7);
    expect(clock(at)).toBe('21:05');
    expect(clock(at.toISOString())).toBe('21:05');
    expect(clock(new Date(2026,9,16,9,0,0))).toBe('09:00');
  });
  it('adds seconds where two saves can land in the same minute',()=>{
    expect(clockWithSeconds(new Date(2026,9,16,21,5,7))).toBe('21:05:07');
  });
});
