import { useEffect, useState } from 'react';
import { api,StaleRequest } from '../api.js';
import type { DayRead } from '../../shared/day.js';
import type { ResultsTarget } from '../../shared/lead-results.js';
import { LeadBar } from '../races/parts.js';
import { addressOf,type View } from '../shell/addresses.js';
import { Results } from './Results.js';
import { Day } from './Day.js';
import { Events } from './Events.js';
import { SignedInToday } from './SignedInToday.js';
import type { PhonesRead } from '../../shared/phones.js';
import { clockWithSeconds } from '../../shared/clock.js';
import './dashboard.css';
/** A lead screen: every screen but Races and the race screen. */
export type LeadView=Exclude<View,{kind:'races'|'race'}>;
type DayView=Extract<LeadView,{kind:'day'|'events'|'rename-event'|'new-event'}>;
/** Day setup and the Events screens, by name. Signed in today is its own screen. */
const daySetup:Record<DayView['kind'],string>={day:'Day setup',events:'Events','rename-event':'Rename','new-event':'Add an event'};
/**
 * The lead's screens, from the avatar menu on Races: Results (an event, a race page) and Day setup (Signed in today,
 * Events). Each is its own address (`view`); `onOpen` moves to another and `onBack` goes back. The race flow put a
 * race's issues on the race itself, so there is no Dashboard or To check list.
 */
export default function Lead({view,target,onOpen,onBack,onChanged}:{view:LeadView;target?:ResultsTarget;onOpen:(view:View)=>void;onBack:()=>void;onChanged:()=>void}) {
  const [day,setDay] = useState<DayRead|null>(null);
  const [phones,setPhones] = useState<number|null>(null);
  const [error,setError] = useState<unknown>(null);
  const [updated,setUpdated] = useState('');
  const kind=view.kind,section=kind in daySetup?daySetup[kind as DayView['kind']]:null;
  async function refresh() {
    try {
      if (kind === 'day') {
        const [read,signedIn]=await Promise.all([api<DayRead>('day'),api<PhonesRead>('day/phones')]);
        setDay(read);setPhones(signedIn.phones.length);
      } else if (section) setDay(await api('day'));
      setUpdated(clockWithSeconds(new Date())); setError(null);
    } catch (error) { if(error instanceof StaleRequest) return;setError(error); }
  }
  useEffect(()=>{if(!section) return;void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[section]);
  if(kind==='events' || kind==='rename-event' || kind==='new-event') return <Events view={view} day={day} updated={updated} error={error} onRefresh={refresh} onOpen={onOpen} onBack={onBack} onSaved={async()=>{onChanged();await refresh();}}/>;
  return <>{kind==='signed-in-today'?<SignedInToday onSaved={onChanged}/>:!section?<Results key={`${addressOf(view)}:${target?.id??''}`} code={'code' in view?view.code:undefined} raceId={view.kind==='race-page'?view.raceId:undefined} target={target} onOpen={onOpen} onBack={onBack} onChanged={onChanged}/>
    :<><LeadBar title={section} up={kind==='day'?'Races':'Day setup'}/><main><section className="dashboard">{error!==null && <p role="alert">{error instanceof Error ? error.message : 'Could not connect'}</p>}
      {kind==='day' && day && <Day day={day} phones={phones} onOpen={screen=>onOpen({kind:screen==='Events'?'events':'signed-in-today'})} onChanged={refresh} onSaved={onChanged}/>}
      <footer><span>Updated at {updated || '…'}</span><button onClick={()=>void refresh()}>Refresh</button></footer></section></main></>}
  </>;
}
