import { useEffect, useState } from 'react';
import { api,StaleRequest } from '../api.js';
import type { Phone } from '../../shared/domain.js';
import type { DayRead } from '../../shared/day.js';
import type { DayLeadItem } from '../../shared/lead-results.js';
import { JobButton,jobIcon } from '../home/Home.js';
import { Trail,type TrailStep } from '../flow/Trail.js';
import { ToCheck } from './ToCheck.js';
import { Results } from './Results.js';
import { Day } from './Day.js';
import './dashboard.css';
type Section='Dashboard'|'To check'|'Results'|'Day setup';
const menu:{section:Exclude<Section,'Dashboard'>;explanation:string;icon:ReturnType<typeof jobIcon>;scoringOnly?:true}[]=[
  {section:'To check',explanation:'Problems on races that need a zone lead to decide',icon:jobIcon(<><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></>)},
  {section:'Results',explanation:'Standings for every event, heats and finals',icon:jobIcon(<><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h3a3 3 0 0 1-3 4"/><path d="M7 6H4a3 3 0 0 0 3 4"/></>)},
  {section:'Day setup',explanation:'Day and lead codes, phones, events and the day export',scoringOnly:true,icon:jobIcon(<><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.9 4.9l2.1 2.1"/><path d="M17 17l2.1 2.1"/><path d="M4.9 19.1L7 17"/><path d="M17 7l2.1-2.1"/></>)}
];
/** How long the short "Saved" note stays after a lead action. */
const savedFor=3000;
/**
 * The Dashboard (was v1's Lead area). It always opens on three big buttons; each opens its screen and the
 * trail (`Home › Dashboard › Results`) leads back. After Start a new day the scoring team lands in Day setup.
 */
export default function Lead({phone,initialDay=false,toCheck,onCount,onChanged,onHome}:{phone:Phone;initialDay?:boolean;toCheck:number;onCount:(count:number)=>void;onChanged:()=>void;onHome:()=>void}) {
  const scoring=phone.level==='Scoring team';
  const [section,setSection] = useState<Section>(initialDay&&scoring?'Day setup':'Dashboard');
  const [target,setTarget]=useState<DayLeadItem|undefined>();
  const [saved,setSaved]=useState(0);
  const [day,setDay] = useState<DayRead|null>(null);
  const [error,setError] = useState('');
  const [updated,setUpdated] = useState('');
  async function refresh() {
    try {
      if (section === 'Day setup') setDay(await api('day'));
      setUpdated(new Date().toLocaleTimeString()); setError('');
    } catch (error) { if(error instanceof StaleRequest) return;setDay(null); setError(error instanceof Error ? error.message : 'Could not connect'); }
  }
  useEffect(()=>{if(section!=='Day setup') return;void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[section]);
  useEffect(()=>{if (!scoring && section==='Day setup') {setSection('Dashboard');setDay(null);}},[scoring]);
  useEffect(()=>{if(!saved) return;const timer=window.setTimeout(()=>setSaved(0),savedFor);return()=>clearTimeout(timer);},[saved]);
  function open(next:Section) {setTarget(undefined);setSection(next);window.scrollTo(0,0);}
  function changed() {setSaved(Date.now());onChanged();}
  const steps:TrailStep[]=[{label:'Home',onSelect:onHome},{label:'Dashboard',onSelect:()=>open('Dashboard')}];
  // Results extends the trail with its own steps (the event, then the race), so it draws the trail itself.
  if(target) steps.push({label:'To check',onSelect:()=>open('To check')});
  else if(section!=='Dashboard' && section!=='Results') steps.push({label:section});
  return <section className="dashboard">{section!=='Results' && <Trail steps={steps}/>}
    {section==='Dashboard'?<div className="home"><h1>Dashboard</h1><div className="jobs">
      {menu.filter(item=>scoring || !item.scoringOnly).map(item=><JobButton key={item.section} icon={item.icon} title={item.section} explanation={item.explanation} onClick={()=>open(item.section)}
        badge={item.section==='To check' && toCheck>0?<span className="badge badge-attention">{toCheck} to check</span>:null}/>)}
    </div></div>
    :section==='To check'?<ToCheck onCount={onCount} onOpen={item=>{setTarget(item);setSection('Results');window.scrollTo(0,0);}}/>
    :section==='Results'?<Results key={target?.id||'events'} target={target} trail={steps} onChanged={changed}/>
    :<><h1>Day setup</h1>{error && <p role="alert">{error}</p>}{scoring && day && <Day day={day} onChanged={refresh} />}
      <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh lead</button></footer></>}
    {saved>0 && <p className="dashboard-saved" role="status" key={saved}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Saved</p>}
  </section>;
}
