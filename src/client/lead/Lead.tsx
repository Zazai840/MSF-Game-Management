import { useEffect, useState } from 'react';
import { api,StaleRequest } from '../api.js';
import type { DayRead } from '../../shared/day.js';
import type { ResultsTarget } from '../../shared/lead-results.js';
import { ErrorCallout } from '../races/parts.js';
import { LeadBar } from './LeadBar.js';
import { UpdatedAt } from '../races/UpdatedAt.js';
import { addressOf,type View } from '../shell/addresses.js';
import { Results } from './Results.js';
import { ChangePassword,Day } from './Day.js';
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
type DayView=Extract<LeadView,{kind:'day'|'events'|'rename-event'|'new-event'}>;
/** Day setup and the Events screens, by name. Signed in today is its own screen. */
const daySetup:Record<DayView['kind'],string>={day:'Day setup',events:'Events','rename-event':'Rename','new-event':'Add an event'};
/**
 * The lead's screens, from the avatar menu on Races: Results (an event, a race page) and Day setup (Signed in today,
 * Events, Change Olympics password). Each is its own address (`view`); `onOpen` moves to another and `onBack` goes back. The race flow put a
 * race's issues on the race itself, so there is no Dashboard or To check list.
 */
export default function Lead({view,target,onOpen,onBack,onChanged}:{view:LeadView;target?:ResultsTarget;onOpen:(view:View,options?:{replace?:boolean;over?:boolean})=>void;onBack:(levels?:1|2)=>void;onChanged:()=>void}) {
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
  if(kind==='olympics-password') return <ChangePassword/>;
  if(view.kind==='tie') return <Tie key={addressOf(view)} code={view.code} tieId={view.tieId} stage={view.stage} onBack={()=>onBack()}/>;
  if(view.kind==='confirm-the-medals' || view.kind==='stage') return <ConfirmTheMedals key={addressOf(view)} code={view.code} screen={view.kind==='stage'?view.screen:undefined} onOpen={onOpen} onBack={()=>onBack()}/>;
  if(view.kind==='correction') {
    const Correction=view.action==='correct-runner-list' || view.action==='correct-teams'?RaceCorrection:TimesAndOrder;
    return <Correction key={addressOf(view)} view={view} onBack={()=>onBack()} onChanged={onChanged}/>;
  }
  if(view.kind==='race-action') return <RaceLifecycle key={addressOf(view)} view={view} onOpen={onOpen} onBack={onBack} onChanged={onChanged}/>;
  if(kind==='signed-in-today') return <SignedInToday onSaved={onChanged}/>;
  if(kind==='day') return <LeadBar title="Day setup" up="Races" body={<>
    <main className="rz-main">{error!==null && <ErrorCallout error={error} action="read"/>}
      {day && <Day day={day} phones={phones} onOpen={onOpen} onChanged={refresh} onSaved={onChanged}/>}</main>
    <footer className="rz-footer"><UpdatedAt time={updated} onRefresh={()=>void refresh()}/></footer></>}/>;
  if(kind==='events' || kind==='rename-event' || kind==='new-event') return <Events view={view} day={day} updated={updated} error={error} onRefresh={refresh} onOpen={onOpen} onBack={()=>onBack()} onSaved={async()=>{onChanged();await refresh();}}/>;
  return <Results key={`${view.kind==='event'?`event:${view.code}`:addressOf(view)}:${target?.id??''}`} tab={view.kind==='event'?view.tab:undefined} code={'code' in view?view.code:undefined} raceId={view.kind==='race-page'?view.raceId:undefined} runner={view.kind==='runner'?view:undefined} target={target} onOpen={onOpen} onBack={()=>onBack()} onChanged={onChanged}/>;
}
