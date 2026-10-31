import { expect,test } from 'vitest';
import { digitsForTime,parseTimeDigits,formatTime,formatTimeDigits,timeLimits,timeRefusal,timesOutOfOrder,typedTimeDigits } from '../src/shared/time-entry.js';
test.each([
  ['1',1,'0.01'],['12',12,'0.12'],['123',123,'1.23'],['1234',1234,'12.34'],['13240',9240,'1:32.40'],['120000',72000,'12:00.00'],['0000',0,'0.00'],['9999',9999,'99.99']
])('digits %s fill from the right without a range refusal', (digits,hundredths,display)=>{
  expect(parseTimeDigits(digits)).toBe(hundredths);expect(formatTimeDigits(digits)).toBe(display);
});
test('the box fills from the right as digits are typed, showing what is wrong as typed (no check)',()=>{
  let digits='';const shown:string[]=[];
  for(const key of '1234') {digits=typedTimeDigits(digits,`${digits?formatTimeDigits(digits):''}${key}`);shown.push(formatTimeDigits(digits));}
  expect(shown).toEqual(['0.01','0.12','1.23','12.34']);
  expect(formatTimeDigits('19234')).toBe('1:92.34');expect(formatTimeDigits('5')).toBe('0.05');
});
test('the box keeps digits only, without leading zeros, and a 7th digit does nothing',()=>{
  expect(typedTimeDigits('1234','12.34.')).toBe('1234');expect(typedTimeDigits('1234','12,34a-')).toBe('1234');
  expect(typedTimeDigits('','0')).toBe('');expect(typedTimeDigits('5','0.055')).toBe('55');
  expect(typedTimeDigits('995999','99:59.999')).toBe('995999');expect(typedTimeDigits('995999','99:519.99')).toBe('995999');
  expect(typedTimeDigits('1234','12.3')).toBe('123');expect(typedTimeDigits('1234','7')).toBe('7');expect(typedTimeDigits('1234','')).toBe('');
});
test('no digits yet shows a plain dash',()=>{
  expect(formatTimeDigits('')).toBe('-');
});
test('stored hundredths format as seconds or minutes, and malformed digits are refused',()=>{
  expect(formatTime(1234)).toBe('12.34');expect(formatTime(9240)).toBe('1:32.40');expect(formatTime(6000)).toBe('1:00.00');
  for(const input of ['', '12.34','-1','abc','9'.repeat(30)]) expect(parseTimeDigits(input)).toBeNull();
});
test('later places may equal earlier times, but may not be faster even across No finisher suffix',()=>{
  expect(timesOutOfOrder([1234,1234,1320,null])).toBe(false);
  expect(timesOutOfOrder([1234,1200,null])).toBe(true);
  expect(timesOutOfOrder([null,null])).toBe(false);
});
test.each([
  ['60m',600,4000],['60m Hurdles',600,4000],['200m',2000,13333],['4x50m Relay',2000,13333],['400m',4000,26667],['4x100m Relay',4000,26667]
])('%s refuses times faster than 10 m/s and holds times slower than 1.5 m/s',(event,fastest,slowest)=>{
  expect(timeLimits(event)).toEqual({fastest,slowest});
  expect(timeRefusal(digitsForTime(fastest),event)).toBeNull();
  expect(timeRefusal(digitsForTime(fastest-1),event)).toMatch(/is too fast for/);
});
test('seconds over 59 are refused, as typed',()=>{
  expect(timeRefusal('19234','60m')).toBe('Seconds go up to 59, so 1:92.34 is not a time. Check the timer and type it again.');
  expect(timeRefusal('7500','Sack race')).toBe('Seconds go up to 59, so 75.00 is not a time. Check the timer and type it again.');
  expect(timeRefusal('15959','60m')).toBeNull();
});
test('0.00 is refused',()=>{
  for(const digits of ['','0','000']) expect(timeRefusal(digits,'60m')).toBe('0.00 is not a time. Check the timer and type it again.');
});
test('a too-fast time of 1-2 digits says how to type whole seconds, 3 or more digits say to check the timer',()=>{
  expect(timeRefusal('21','60m')).toBe('0.21 is too fast for 60m. No one runs 60m in under 6.00. For 21 seconds, type 2100.');
  expect(timeRefusal('021','60m')).toBe('0.21 is too fast for 60m. No one runs 60m in under 6.00. For 21 seconds, type 2100.');
  expect(timeRefusal('5','4x100m Relay')).toBe('0.05 is too fast for 4x100m Relay. No one runs 400m in under 40.00. For 5 seconds, type 500.');
  expect(timeRefusal('124','60m')).toBe('1.24 is too fast for 60m. No one runs 60m in under 6.00. Check the timer and type it again.');
  expect(timeRefusal('1999','200m')).toBe('19.99 is too fast for 200m. No one runs 200m in under 20.00. Check the timer and type it again.');
  expect(timeRefusal('945','60m')).toBeNull();
});
test('an event with no known distance is only refused over 59 and at 0.00',()=>{
  expect(timeLimits('Sack race')).toBeNull();
  expect(timeRefusal('21','Sack race')).toBeNull();expect(timeRefusal('995999','Sack race')).toBeNull();
});
