import { useEffect,useRef,useState } from 'react';
import { api } from '../api.js';
import type { DayLeadItem,ResultsRead } from '../../shared/lead-results.js';
import { toCheckHeading,toCheckWording } from '../../shared/to-check.js';
const clock=(at:string)=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
/** v1's Needs you queue, newest first, each item in plain English with Open race. */
export function ToCheck({onOpen,onCount}:{onOpen:(item:DayLeadItem)=>void;onCount:(count:number)=>void}) {
  const [items,setItems]=useState<DayLeadItem[]|null>(null),[error,setError]=useState(''),[updated,setUpdated]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const read=await api<ResultsRead>('lead');if(generation!==request.current) return;setItems(read.needsYou);onCount(read.needsYou.length);setUpdated(clock(new Date().toISOString()));setError('');}
    catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);const visible=()=>{if(document.visibilityState==='visible') void refresh();};document.addEventListener('visibilitychange',visible);return()=>{request.current++;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[]);
  return <div className="to-check">{error && <p role="alert">{error}</p>}
    {items===null?<p>Opening To check…</p>:<>
      <h1>{toCheckHeading(items.length)}</h1>
      {items.length===0?<p className="to-check-none">Nothing needs a zone lead right now.</p>:<ol aria-label="To check">{items.map(item=>{
        const {race,title,explanation}=toCheckWording(item);
        return <li key={item.id}><button type="button" className="to-check-item" onClick={()=>onOpen(item)}>
          <small className="to-check-race"><span className="to-check-dot" aria-hidden="true"/><span>{race}</span><time dateTime={item.at}>{clock(item.at)}</time></small>
          <span className="to-check-title">{title}</span>
          <span className="to-check-explanation">{explanation}</span>
          <span className="to-check-open">Open race</span>
        </button></li>;
      })}</ol>}
    </>}
    <footer>Updated at {updated||'…'} <button onClick={()=>void refresh()}>Refresh</button></footer></div>;
}
