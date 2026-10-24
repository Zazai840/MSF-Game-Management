import { describe,expect,it } from 'vitest';
import { canMakeRole } from '../src/shared/phones.js';
describe('canMakeRole',()=>{
  it('lets a lead set any role except making the owner a volunteer',()=>{
    expect(canMakeRole({owner:false},'Volunteer')).toBe(true);
    expect(canMakeRole({owner:false},'Lead')).toBe(true);
    expect(canMakeRole({owner:true},'Lead')).toBe(true);
    expect(canMakeRole({owner:true},'Volunteer')).toBe(false);
  });
});
