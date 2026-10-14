import { describe,expect,it } from 'vitest';
import { ordinal } from '../src/shared/ordinal.js';
describe('ordinal',()=>{
  it('names places as people say them, past 10 runners too',()=>{
    expect([1,2,3,4,10,11,12,13,14,21,22,23,24,101,111,112].map(ordinal)).toEqual(['1st','2nd','3rd','4th','10th','11th','12th','13th','14th','21st','22nd','23rd','24th','101st','111th','112th']);
  });
});
