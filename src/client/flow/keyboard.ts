/**
 * Keeps docked buttons riding just above the phone keyboard. Android Chrome does it on its own with
 * interactive-widget=resizes-content (index.html); iPhone Safari only shrinks the visual viewport. So while a box is
 * being typed in, the visible part of the page goes on <html> as --vv-top and --vv-height, with data-keyboard="open",
 * for `.rz-footer--docked` (the race steps) and `.action-bar` (the older screens) to sit on. Only while typing: iOS can
 * leave stale viewport numbers after the keyboard closes, and then the buttons go back to the foot of the screen.
 */
const notTyped=new Set(['button','checkbox','color','file','hidden','image','radio','range','reset','submit']);
/** Is this the kind of box the phone raises a keyboard for? */
export const typingIn=(element:{tagName:string;type?:string;isContentEditable?:boolean}|null)=>
  !!element && (!!element.isContentEditable || element.tagName==='TEXTAREA' || (element.tagName==='INPUT' && !notTyped.has(element.type||'text')));
/** Writes the visible part of the page to the root while typing (a viewport), or clears it (null). */
export function dockToKeyboard(root:{style:{setProperty(name:string,value:string):void;removeProperty(name:string):string};dataset:Record<string,string|undefined>},
  viewport:{offsetTop:number;height:number}|null) {
  if(!viewport) {root.style.removeProperty('--vv-top');root.style.removeProperty('--vv-height');delete root.dataset.keyboard;return;}
  root.style.setProperty('--vv-top',`${viewport.offsetTop}px`);root.style.setProperty('--vv-height',`${viewport.height}px`);root.dataset.keyboard='open';
}
/** Started once with the app: follows the visual viewport and focus, reading them a frame later (iOS settles late). */
export function followKeyboard() {
  const viewport=window.visualViewport;if(!viewport) return;
  let frame=0;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>dockToKeyboard(document.documentElement,typingIn(document.activeElement as HTMLInputElement|null)?viewport:null));};
  for(const event of ['resize','scroll']) viewport.addEventListener(event,update);
  for(const event of ['focusin','focusout']) document.addEventListener(event,update);
}
