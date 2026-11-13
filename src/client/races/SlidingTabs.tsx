import { useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode } from 'react';
/** Where each set's cell was when its tabs were last taken off the page, counted in tabs from the first (1.4: on its way from the second tab to the third). It lasts as long as the page. */
const lastPlace=new Map<string,number>();
/**
 * Tabs with a sliding cell: a `<nav>` of one button per tab, and behind them one cell that marks the current tab and
 * slides to it (race-flow.css, `.rz-tab-cell`). The current tab has `aria-current="page"` at once; the cell, and the
 * colour of the words on it (`data-lit`), follow in 200ms.
 * A screen that draws its tabs again (the lead's bar) still gets the slide: tabs of one `set` remember where their
 * cell was, draw it there first, then move it. No memory (the first draw), the same place, or a new number of tabs: no motion.
 * `className` gives the set its look, and `children` are drawn behind the cell (the lead's bar's pattern).
 */
export function SlidingTabs<Key extends string>({set,label,className,tabs,current,onTab,children}:{
  set:string;label:string;className:string;tabs:Array<[key:Key,content:ReactNode]>;current:Key;onTab:(key:Key)=>void;children?:ReactNode}) {
  const index=tabs.findIndex(([key])=>key===current),cell=useRef<HTMLSpanElement>(null);
  // Where the cell is drawn. It follows `index` one step behind, so the browser has an old place to slide from.
  const [at,setAt]=useState(index);
  // A set that gets or loses a tab (an event's Final) has tabs of a new size: its cell is a new element, on the current tab at once.
  const [count,setCount]=useState(tabs.length);
  if(count!==tabs.length) {setCount(tabs.length);setAt(index);}
  useLayoutEffect(()=>{
    // Read here, not while drawing: the tabs this set showed before have by now noted where their cell was.
    const from=lastPlace.get(set),nav=cell.current!.parentElement!;
    // Never past the last tab: the set may have fewer tabs now than when its cell was there.
    if(from!==undefined) setAt(Math.min(from,nav.querySelectorAll(':scope > button').length-1));
    return ()=>{
      // The place the cell has reached, also in the middle of a slide: the next tabs of this set start from here.
      const drawn=nav.querySelector(':scope > .rz-tab-cell')!,step=drawn.getBoundingClientRect().width+(parseFloat(getComputedStyle(nav).columnGap)||0);
      if(step) lastPlace.set(set,Math.round(new DOMMatrix(getComputedStyle(drawn).transform).e/step*100)/100);
    };
  },[set]);
  useLayoutEffect(()=>{
    if(at===index) return;
    // The browser must work out the cell's old place before it gets the new one, or there is nothing to slide from.
    cell.current!.getBoundingClientRect();setAt(index);
  },[at,index]);
  return <nav className={className} aria-label={label} style={{'--tabs':tabs.length,'--tab':at} as CSSProperties}>{children}
    <span key={count} ref={cell} className="rz-tab-cell" aria-hidden="true"/>
    {tabs.map(([key,content],place)=><button key={key} type="button" aria-current={key===current?'page':undefined} data-lit={place===Math.round(at)?'':undefined} onClick={()=>onTab(key)}>{content}</button>)}</nav>;
}
