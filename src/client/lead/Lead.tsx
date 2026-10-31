import { useEffect, useState } from 'react';
import { api,StaleRequest } from '../api.js';
import type { DayRead } from '../../shared/day.js';
import type { ResultsTarget } from '../../shared/lead-results.js';
import { BackArrow } from '../flow/BackArrow.js';
import { Results } from './Results.js';
import { Day,Events } from './Day.js';
import { Phones } from './Phones.js';
import type { PhonesRead } from '../../shared/phones.js';
import { clock } from '../../shared/clock.js';
import './dashboard.css';
type Section='Results'|'Day setup'|'Signed in today'|'Events';
/** Day setup and the two screens its rows open. */
const daySetup:Section[]=['Day setup','Signed in today','Events'];
/**
 * The lead's screens, from the avatar menu on Races: Results and Day setup. The race flow put a race's issues on the
 * race itself, so there is no Dashboard or To check list: back goes up one level (an event to Results, Signed in
 * today to Day setup), then to Races. After Start a new day the lead lands in Day setup.
 */
export default function Lead({initialDay=false,initialSection='Results',target:opened,onChanged,onHome,onSection}:{initialDay?:boolean;initialSection?:'Results'|'Day setup';target?:ResultsTarget;
  onChanged:()=>void;onHome:()=>void;onSection:(section:string)=>void}) {
  const [section,setSection] = useState<Section>(initialDay?'Day setup':initialSection);
  const [target,setTarget]=useState<ResultsTarget|undefined>(opened);
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
  useEffect(()=>onSection(section),[section]);
  function open(next:Section) {setTarget(undefined);setSection(next);window.scrollTo(0,0);}
  // Results goes deeper (an event, then a race), so it draws its own back arrow.
  return <section className="dashboard">{section==='Signed in today' || section==='Events'?<BackArrow to="Day setup" onBack={()=>open('Day setup')}/>
    :section==='Day setup' && <BackArrow to="Races" onBack={onHome}/>}
    {section==='Results'?<Results key={target?.id||'events'} target={target} backTo="Races" onDashboard={onHome} onChanged={onChanged}/>
    :<><h1>{section}</h1>{error && <p role="alert">{error}</p>}
      {section==='Day setup' && day && <Day day={day} phones={phones} onOpen={open} onChanged={refresh} onSaved={onChanged}/>}
      {section==='Events' && day && <Events day={day} onChanged={refresh} onSaved={onChanged}/>}
      {section==='Signed in today' && <Phones onChanged={refresh} onSaved={onChanged}/>}
      <footer><span>Updated at {updated || '…'}</span><button onClick={()=>void refresh()}>Refresh</button></footer></>}
  </section>;
}
