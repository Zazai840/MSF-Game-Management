import { describe,expect,it } from 'vitest';
import { dockToKeyboard,typingIn } from '../src/client/flow/keyboard.js';
/** The page root as the docking writes it: its style properties and its data attributes. */
function fakeRoot() {
  const properties=new Map<string,string>(),dataset:Record<string,string>={};
  return {properties,dataset,style:{setProperty:(name:string,value:string)=>void properties.set(name,value),removeProperty:(name:string)=>{properties.delete(name);return '';}}};
}
describe('docking buttons above the phone keyboard',()=>{
  it('writes the visible part of the page and the keyboard-open marker while the phone is typing',()=>{
    const root=fakeRoot();
    // An iPhone 390x844 with the keyboard up and the page scrolled 120px: 380px of it shows.
    dockToKeyboard(root,{offsetTop:120,height:380});
    expect(Object.fromEntries(root.properties)).toEqual({'--vv-top':'120px','--vv-height':'380px'});
    expect(root.dataset.keyboard).toBe('open');
    dockToKeyboard(root,{offsetTop:0,height:463.5});
    expect(Object.fromEntries(root.properties)).toEqual({'--vv-top':'0px','--vv-height':'463.5px'});
  });
  it('clears it all once typing ends, so a stale viewport after the keyboard closes never moves the buttons',()=>{
    const root=fakeRoot();
    dockToKeyboard(root,{offsetTop:120,height:380});
    dockToKeyboard(root,null);
    expect(root.properties.size).toBe(0);
    expect(root.dataset.keyboard).toBeUndefined();
  });
  it('counts only boxes the phone raises a keyboard for as typing',()=>{
    expect(typingIn({tagName:'INPUT',type:'text'})).toBe(true);
    expect(typingIn({tagName:'INPUT',type:'password'})).toBe(true);
    expect(typingIn({tagName:'TEXTAREA'})).toBe(true);
    expect(typingIn({tagName:'DIV',isContentEditable:true})).toBe(true);
    for(const type of ['checkbox','radio','button','submit']) expect(typingIn({tagName:'INPUT',type})).toBe(false);
    expect(typingIn({tagName:'BUTTON'})).toBe(false);
    expect(typingIn({tagName:'BODY'})).toBe(false);
    expect(typingIn(null)).toBe(false);
  });
});
