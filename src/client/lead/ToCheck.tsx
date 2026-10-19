import { useEffect,useRef,useState } from 'react';
import { api } from '../api.js';
import type { DayLeadItem,ProfileRequest,ResultsRead } from '../../shared/lead-results.js';
import { toCheckHeading,toCheckWording } from '../../shared/to-check.js';
import { clock } from '../../shared/clock.js';
/** v1's Needs you queue on the Dashboard, newest first, each item in plain English with Open race. */
export function ToCheck({onOpen,onCount}:{onOpen:(item:DayLeadItem)=>void;onCount:(count:number)=>void}) {
  const [items,setItems]=useState<DayLeadItem[]|null>(null),[error,setError]=useState(''),[updated,setUpdated]=useState('');
  const [requests,setRequests]=useState<ProfileRequest[]>([]),[deciding,setDeciding]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const read=await api<ResultsRead>('lead');if(generation!==request.current) return;setItems(read.needsYou);setRequests(read.profileRequests);onCount(read.needsYou.length+read.profileRequests.length);setUpdated(clock());setError('');}
    catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);const visible=()=>{if(document.visibilityState==='visible') void refresh();};document.addEventListener('visibilitychange',visible);return()=>{request.current++;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[]);
  async function decide(request:ProfileRequest,decision:'approve'|'decline') {
    setDeciding(request.id);
    try {await api(`lead/thats-me/${request.id}/${decision}`,{});setError('');}
    catch(error) {setError(error instanceof Error?error.message:'Could not connect - please try again');}
    finally {setDeciding('');void refresh();}
  }
  return <div className="to-check">{error && <p role="alert">{error}</p>}
    {items===null?<p>Opening To check…</p>:<>
      <h2>{toCheckHeading(items.length+requests.length)}</h2>
      {items.length+requests.length===0?<p className="to-check-none">Nothing needs a zone lead right now.</p>:<ol aria-label="To check">{requests.map(request=><li key={request.id} className="to-check-item">
        <small className="to-check-race"><span className="to-check-dot" aria-hidden="true"/><span>That's me</span><time dateTime={request.at}>{clock(request.at)}</time></small>
        <span className="to-check-title">{request.name} wants their profile on a new phone</span>
        <span className="to-check-explanation">Approve only after checking it's them in person. Their old phone will be signed out.</span>
        <span className="to-check-decide"><button disabled={deciding===request.id} onClick={()=>void decide(request,'approve')}>Approve</button>
          <button className="button-secondary" disabled={deciding===request.id} onClick={()=>void decide(request,'decline')}>Decline</button></span>
      </li>)}{items.map(item=>{
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
