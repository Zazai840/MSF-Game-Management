import { useEffect, useState } from 'react';
import { api,keepSeen,lastSeen,StaleRequest } from '../api.js';
import type { DayRead } from '../../shared/day.js';
import type { ResultsTarget } from '../../shared/lead-results.js';
import { ErrorCallout } from '../races/parts.js';
import { LeadHeader } from './LeadHeader.js';
import { UpdatedAt } from '../races/UpdatedAt.js';
import { addressOf,type View } from '../shell/addresses.js';
import { Results } from './Results.js';
import { ChangePassword,Day,DayExport,NewDay,ThisDay } from './Day.js';
import { Events } from './Events.js';
import { SignedInToday } from './SignedInToday.js';
import { Tie } from './Tie.js';
import { ConfirmTheMedals } from './ConfirmTheMedals.js';
import { RaceLifecycle } from './RaceLifecycle.js';
import { RaceCorrection } from './CorrectRunners.js';
import { TimesAndOrder } from './TimesAndOrder.js';
import type { PhonesRead } from '../../shared/phones.js';
import { clockWithSeconds } from '../../shared/clock.js';
/** A lead screen: every screen but Races and the race screen. */
export type LeadView=Exclude<View,{kind:'races'|'race'}>;
type DayView=Extract<LeadView,{kind:'day'|'this-day'|'day-export'|'events'|'rename-event'|'new-event'}>;
/** Day setup and its screens that show the day's read, by name. Signed in today is its own screen. */
const daySetup:Record<DayView['kind'],string>={day:'Day setup','this-day':'This day','day-export':'Day export',events:'Events','rename-event':'Rename','new-event':'Add an event'};
/**
 * The lead's screens, from the lead's bar: Results (an event, a race page) and Day setup (This day, Events,
 * Signed in today, Change Olympics password, Day export, Start a new day). Each is its own address (`view`); `onOpen` moves to another and `onBack` goes back. The race flow put a
 * race's issues on the race itself, so there is no Dashboard or To check list.
 */
export default function Lead({view,target,onOpen,onBack,onChanged}:{view:LeadView;target?:ResultsTarget;onOpen:(view:View,options?:{replace?:boolean;over?:boolean})=>void;onBack:(levels?:1|2)=>void;onChanged:()=>void}) {
  // Day setup seen before opens at once with what it showed last (api.ts, lastSeen), and reads again behind it.
  const [day,setDay] = useState<DayRead|null>(()=>lastSeen<DayRead>('day')?.value??null);
  const [phones,setPhones] = useState<number|null>(()=>lastSeen<number>('day/phones')?.value??null);
  const [error,setError] = useState<unknown>(null);
  const [updated,setUpdated] = useState(()=>lastSeen('day')?.at??'');
  const kind=view.kind,section=kind in daySetup?daySetup[kind as DayView['kind']]:null;
  async function refresh() {
    try {
      if(!section) return;
      const [read,signedIn]=await Promise.all([api<DayRead>('day'),kind==='day'?api<PhonesRead>('day/phones'):null]),at=clockWithSeconds(new Date());
      if(signedIn) {setPhones(signedIn.phones.length);keepSeen('day/phones',signedIn.phones.length,at);}
      setDay(read);keepSeen('day',read,at);
      setUpdated(at); setError(null);
    } catch (error) { if(error instanceof StaleRequest) return;setError(error); }
  }
  useEffect(()=>{if(!section) return;void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[section]);
  if(kind==='olympics-password') return <ChangePassword/>;
  if(view.kind==='tie') return <Tie key={addressOf(view)} code={view.code} tieId={view.tieId} stage={view.stage} onBack={()=>onBack()}/>;
  if(view.kind==='confirm-the-medals' || view.kind==='stage') return <ConfirmTheMedals key={addressOf(view)} code={view.code} screen={view.kind==='stage'?view.screen:undefined} onOpen={onOpen} onBack={()=>onBack()}/>;
  if(view.kind==='correction') {
    const Correction=view.action==='correct-runner-list' || view.action==='correct-teams'?RaceCorrection:TimesAndOrder;
    return <Correction key={addressOf(view)} view={view} onBack={()=>onBack()} onChanged={onChanged}/>;
  }
  if(view.kind==='race-action') return <RaceLifecycle key={addressOf(view)} view={view} onOpen={onOpen} onBack={onBack} onChanged={onChanged}/>;
  if(kind==='signed-in-today') return <SignedInToday onSaved={onChanged}/>;
  if(kind==='start-a-new-day') return <LeadHeader title="Start a new day" up="Day setup" body={<main className="rz-main"><NewDay/></main>}/>;
  if(kind==='day' || kind==='this-day' || kind==='day-export') return <LeadHeader title={section!} up={kind==='day'?undefined:'Day setup'} body={<>
    <main className="rz-main">{error!==null && <ErrorCallout error={error} action="read"/>}
      {day && (kind==='day'?<Day day={day} phones={phones} onOpen={onOpen} onChanged={refresh} onSaved={onChanged}/>
        :kind==='this-day'?<ThisDay day={day} onChanged={refresh} onSaved={onChanged}/>:<DayExport day={day} onChanged={refresh}/>)}</main>
    <footer className="rz-footer"><UpdatedAt time={updated} onRefresh={()=>void refresh()}/></footer></>}/>;
  if(kind==='events' || kind==='rename-event' || kind==='new-event') return <Events view={view} day={day} updated={updated} error={error} onRefresh={refresh} onOpen={onOpen} onBack={()=>onBack()} onSaved={async()=>{onChanged();await refresh();}}/>;
  return <Results key={`${view.kind==='event'?`event:${view.code}`:addressOf(view)}:${target?.id??''}`} tab={view.kind==='event'?view.tab:undefined} code={'code' in view?view.code:undefined} raceId={view.kind==='race-page'?view.raceId:undefined} runner={view.kind==='runner'?view:undefined} target={target} onOpen={onOpen} onBack={()=>onBack()} onChanged={onChanged}/>;
}
