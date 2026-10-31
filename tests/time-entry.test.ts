import { expect,test } from 'vitest';
import { parseTimeDigits,formatTime,formatTimeDigits,timesOutOfOrder,typedTimeDigits } from '../src/shared/time-entry.js';
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
