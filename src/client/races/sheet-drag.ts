import { useRef,type PointerEvent } from 'react';
/** A sheet let go this far down (a share of its height), or moving down this fast (px per ms), closes. */
const far=.25,fast=.11;
/**
 * Pulling a bottom sheet down by its grip or title (never by a button): the sheet follows the finger, and when the
 * finger lets go it closes if it is far enough down or was flicked down, else it goes back up. A wide screen's centred
 * sheet shows no grip and stays put. The moves themselves are the stylesheet's (race-flow.css, "Motion").
 */
export function useSheetDrag(close:()=>void) {
  const pull=useRef<{from:number;y:number;at:number;speed:number}|null>(null);
  const end=(event:PointerEvent<HTMLElement>)=>{
    const ended=pull.current,sheet=event.currentTarget;
    if(!ended) return;
    pull.current=null;
    // Back to the stylesheet's rules, which take the sheet from where the finger left it: out, or back up.
    sheet.style.translate='';sheet.style.transition='';
    const moved=ended.y-ended.from;
    if(event.type==='pointerup' && (moved>sheet.offsetHeight*far || (moved>8 && ended.speed>fast))) close();
  };
  return {
    onPointerDown(event:PointerEvent<HTMLElement>) {
      const target=event.target as HTMLElement,grip=event.currentTarget.querySelector('.rz-sheet__grip');
      if(!grip || getComputedStyle(grip).display==='none' || !target.closest('.rz-sheet__grip, .rz-sheet__head') || target.closest('button')) return;
      pull.current={from:event.clientY,y:event.clientY,at:event.timeStamp,speed:0};
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event:PointerEvent<HTMLElement>) {
      const now=pull.current;
      if(!now) return;
      pull.current={from:now.from,y:event.clientY,at:event.timeStamp,speed:(event.clientY-now.y)/Math.max(1,event.timeStamp-now.at)};
      event.currentTarget.style.transition='none';
      event.currentTarget.style.translate=`0 ${Math.max(0,event.clientY-now.from)}px`;
    },
    onPointerUp:end,onPointerCancel:end
  };
}
