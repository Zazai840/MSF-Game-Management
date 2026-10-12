import { useEffect,useRef,useState } from 'react';
import { api } from '../api.js';
import type { DayLeadItem,ResultsRead } from '../../shared/lead-results.js';
const label=(item:DayLeadItem)=>`${item.event.code} · ${item.event.name} ${item.event.section}${item.race?` · ${item.race.kind==='heat'?'Heat':item.race.kind==='final'?'Final':'Race'} ${item.race.number}`:''} · ${item.message}`;
export function NeedsYou({onOpen,onCount}:{onOpen:(item:DayLeadItem)=>void;onCount:(count:number)=>void}) {
  const [items,setItems]=useState<DayLeadItem[]|null>(null),[error,setError]=useState(''),[updated,setUpdated]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const read=await api<ResultsRead>('lead');if(generation!==request.current) return;setItems(read.needsYou);onCount(read.needsYou.length);setUpdated(new Date().toLocaleTimeString());setError('');}
    catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);const visible=()=>{if(document.visibilityState==='visible') void refresh();};document.addEventListener('visibilitychange',visible);return()=>{request.current++;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[]);
  return <div className="needs-you">{error && <p role="alert">{error}</p>}{items===null?<p>Opening lead items…</p>:items.length===0?<p>Nothing needing you</p>:<ol aria-label="Items needing you">{items.map(item=><li key={item.id}><button onClick={()=>onOpen(item)}>{label(item)}<small><time dateTime={item.at}>{new Date(item.at).toLocaleTimeString()}</time></small></button></li>)}</ol>}<footer>Updated at {updated||'…'} <button onClick={()=>void refresh()}>Refresh Needs you</button></footer></div>;
}
