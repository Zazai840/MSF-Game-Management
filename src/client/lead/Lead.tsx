import { useEffect, useState } from 'react';
import { api,StaleRequest } from '../api.js';
import type { Phone } from '../../shared/domain.js';
import type { DayRead } from '../../shared/day.js';
import type { DayLeadItem } from '../../shared/lead-results.js';
import { JobButton,jobIcon } from '../home/Home.js';
import { Trail,type TrailStep } from '../flow/Trail.js';
import { ToCheck } from './ToCheck.js';
import { Results } from './Results.js';
import { Day,Events } from './Day.js';
import { Phones } from './Phones.js';
import type { PhonesRead } from '../../shared/phones.js';
import { clock } from '../../shared/clock.js';
import './dashboard.css';
type Section='Dashboard'|'Results'|'Day setup'|'Signed in today'|'Events';
/** Day setup and the two screens its rows open; only the scoring team sees them. */
const daySetup:Section[]=['Day setup','Signed in today','Events'];
const menu:{section:'Results'|'Day setup';explanation:string;icon:ReturnType<typeof jobIcon>;scoringOnly?:true}[]=[
  {section:'Results',explanation:'Standings for every event, heats and finals',icon:jobIcon(<><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h3a3 3 0 0 1-3 4"/><path d="M7 6H4a3 3 0 0 0 3 4"/></>)},
  {section:'Day setup',explanation:'Day and lead codes, phones, events and the day export',scoringOnly:true,icon:jobIcon(<><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.9 4.9l2.1 2.1"/><path d="M17 17l2.1 2.1"/><path d="M4.9 19.1L7 17"/><path d="M17 7l2.1-2.1"/></>)}
];
/** How long the short "Saved" note stays after a lead action. */
const savedFor=3000;
/**
 * The Dashboard (was v1's Lead area). It opens on the To check list, under big Results and Day setup buttons, so a
 * lead reaches a problem in one tap; the trail (`Home › Dashboard › Results`) leads back. After Start a new day the scoring team lands in Day setup.
 */
export default function Lead({phone,initialDay=false,onCount,onChanged,onHome,onSection}:{phone:Phone;initialDay?:boolean;onCount:(count:number)=>void;onChanged:()=>void;onHome:()=>void;onSection:(section:string)=>void}) {
  const scoring=phone.level==='Scoring team';
  const [section,setSection] = useState<Section>(initialDay&&scoring?'Day setup':'Dashboard');
  const [target,setTarget]=useState<DayLeadItem|undefined>();
  const [saved,setSaved]=useState(0);
  const [day,setDay] = useState<DayRead|null>(null);
  const [phones,setPhones] = useState<number|null>(null);
  const [error,setError] = useState('');
  const [updated,setUpdated] = useState('');
  async function refresh() {
    try {
      if (section === 'Day setup') {
        const [read,signedIn]=await Promise.all([api<DayRead>('day'),api<PhonesRead>('day/phones')]);
        setDay(read);setPhones(signedIn.phones.length);
      } else if (daySetup.includes(section)) setDay(await api('day'));
      setUpdated(clock()); setError('');
    } catch (error) { if(error instanceof StaleRequest) return;setError(error instanceof Error ? error.message : 'Could not connect'); }
  }
  useEffect(()=>{if(!daySetup.includes(section)) return;void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[section]);
  useEffect(()=>{if (!scoring && daySetup.includes(section)) {setSection('Dashboard');setDay(null);}},[scoring]);
  useEffect(()=>onSection(section),[section]);
  useEffect(()=>{if(!saved) return;const timer=window.setTimeout(()=>setSaved(0),savedFor);return()=>clearTimeout(timer);},[saved]);
  function open(next:Section) {setTarget(undefined);setSection(next);window.scrollTo(0,0);}
  function changed() {setSaved(Date.now());onChanged();}
  const steps:TrailStep[]=[{label:'Home',onSelect:onHome},{label:'Dashboard',onSelect:()=>open('Dashboard')}];
  // Results extends the trail with its own steps (the event, then the race), so it draws the trail itself.
  if(section==='Signed in today' || section==='Events') steps.push({label:'Day setup',onSelect:()=>open('Day setup')},{label:section});
  else if(section!=='Dashboard' && section!=='Results') steps.push({label:section});
  return <section className="dashboard">{section!=='Results' && <Trail steps={steps}/>}
    {section==='Dashboard'?<div className="home"><h1>Dashboard</h1><div className="jobs">
      {menu.filter(item=>scoring || !item.scoringOnly).map(item=><JobButton key={item.section} icon={item.icon} title={item.section} explanation={item.explanation} onClick={()=>open(item.section)}/>)}
    </div><ToCheck onCount={onCount} onOpen={item=>{setTarget(item);setSection('Results');window.scrollTo(0,0);}}/></div>
    :section==='Results'?<Results key={target?.id||'events'} target={target} trail={steps} onChanged={changed}/>
    :<><h1>{section}</h1>{error && <p role="alert">{error}</p>}
      {scoring && section==='Day setup' && day && <Day day={day} phones={phones} onOpen={open} onChanged={refresh} onSaved={changed}/>}
      {scoring && section==='Events' && day && <Events day={day} onChanged={refresh} onSaved={changed}/>}
      {scoring && section==='Signed in today' && <Phones onChanged={refresh} onSaved={changed}/>}
      <footer><span>Updated at {updated || '…'}</span><button onClick={()=>void refresh()}>Refresh</button></footer></>}
    {saved>0 && <p className="dashboard-saved" role="status" key={saved}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Saved</p>}
  </section>;
}
