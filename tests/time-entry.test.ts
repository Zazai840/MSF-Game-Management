import { expect,test } from 'vitest';
import { parseTimeDigits,formatTime,formatTimeDigits,timesOutOfOrder } from '../src/shared/time-entry.js';
test.each([
  ['1',1,'0.01'],['12',12,'0.12'],['123',123,'1.23'],['1234',1234,'12.34'],['13240',9240,'1:32.40'],['120000',72000,'12:00.00'],['0000',0,'0.00'],['9999',9999,'99.99']
])('digits %s fill from the right without a range refusal', (digits,hundredths,display)=>{
  expect(parseTimeDigits(digits)).toBe(hundredths);expect(formatTimeDigits(digits)).toBe(display);
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
