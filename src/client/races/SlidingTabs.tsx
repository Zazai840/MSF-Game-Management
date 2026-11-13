import { useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode } from 'react';
/** Where each set's cell was when its tabs were last taken off the page, counted in tabs from the first (1.4: on its way from the second tab to the third), and how many tabs the set then had. It lasts as long as the page. */
const lastPlace=new Map<string,[tabs:number,place:number]>();
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
  const index=tabs.findIndex(([key])=>key===current),count=tabs.length,cell=useRef<HTMLSpanElement>(null);
  // Where the cell is drawn. It follows `index` one step behind: the cell slides from `at` to `index`.
  const [at,setAt]=useState(index);
  // The cell must first be at `at` with no motion: it starts from a remembered place, or its tabs have a new size.
  const [still,setStill]=useState(false);
  // A set that gets or loses a tab (an event's Final) has tabs of a new size: the cell is on the current tab at once.
  const [drawn,setDrawn]=useState(count);
  if(drawn!==count) {setDrawn(count);setAt(index);setStill(true);}
  useLayoutEffect(()=>{
    // Read here, not while drawing: the tabs this set showed before have by now noted where their cell was.
    const last=lastPlace.get(set),moving=cell.current!;
    if(last?.[0]===count && last[1]!==index) {setAt(last[1]);setStill(true);}
    return ()=>{
      // The place the cell has reached, also in the middle of a slide: the next tabs of this set start from here.
      const step=moving.getBoundingClientRect().width+(parseFloat(getComputedStyle(moving.parentElement!).columnGap)||0);
      if(step) lastPlace.set(set,[count,Math.round(new DOMMatrix(getComputedStyle(moving).transform).e/step*100)/100]);
    };
  },[set,count]);
  useLayoutEffect(()=>{
    if(still) {
      // The browser takes the cell's place with its transition off, so the cell is there whatever was worked out before, and the slide starts from it.
      const moving=cell.current!;
      moving.style.transition='none';moving.getBoundingClientRect();moving.style.transition='';
      setStill(false);
    }
    if(at!==index) setAt(index);
  },[at,index,still]);
  return <nav className={className} aria-label={label} style={{'--tabs':count,'--tab':at} as CSSProperties}>{children}
    <span ref={cell} className="rz-tab-cell" aria-hidden="true"/>
    {tabs.map(([key,content],place)=><button key={key} type="button" aria-current={key===current?'page':undefined} data-lit={place===Math.round(at)?'':undefined} onClick={()=>onTab(key)}>{content}</button>)}</nav>;
}
