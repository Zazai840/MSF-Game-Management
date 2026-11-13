import { useEffect,useState } from 'react';
import { api } from '../api.js';
import { eventTitle } from '../../shared/day.js';
import { clock } from '../../shared/clock.js';
import type { EventResultsRead,LeadRaceRead } from '../../shared/lead-results.js';
import { raceName } from '../../shared/race-flow.js';
import { toastLine,type ToastSave } from '../../shared/toast-lines.js';
import { LeadHeader,OpeningBody } from './LeadHeader.js';
import { useToast } from '../races/Toast.js';
import type { RaceAction,View } from '../shell/addresses.js';
import { Comment } from './Comment.js';
import { Frame } from './RunnerSheet.js';
type ActionView=Extract<View,{kind:'race-action'}>;
type Answer=EventResultsRead & {newRaceId?:string;number?:number};
const titles:Record<RaceAction,string>={'re-run':'Re-run race',delete:'Delete race',restore:'Restore race'};
/**
 * A race's Re-run, Delete or Restore screen, under its race page (Delete also under the Race screen of a race not saved yet). Re-run lands on the new race at
 * its first step in place of the old race in history (`onOpen` with `over`); Delete goes back to the screen before the
 * race (`onBack(2)`); Restore goes back to the restored race page. Each save shows its toast.
 */
export function RaceLifecycle({view,onOpen,onBack,onChanged}:{view:ActionView;onOpen:(view:View,options?:{over?:boolean})=>void;onBack:(levels?:1|2)=>void;onChanged?:()=>void}) {
  const toast=useToast();
  const [read,setRead]=useState<LeadRaceRead|null>(null),[error,setError]=useState<unknown>(null);
  // Restore: the live race of the same kind and number, if one took its number, and the number it comes back with.
  const [comesBackAs,setComesBackAs]=useState<number|null>(null);
  const [busy,setBusy]=useState(false),[refused,setRefused]=useState<unknown>(null),[comment,setComment]=useState(''),[forGood,setForGood]=useState(false);
  useEffect(()=>{void (async()=>{
    try {
      const next=await api<LeadRaceRead>(`lead/races/${view.raceId}`);setRead(next);
      if(view.action!=='restore') return;
      const live=(await api<EventResultsRead>(`lead/events/${encodeURIComponent(next.race.event.code)}/results`)).results.races.map(({race})=>race).filter(race=>race.kind===next.race.kind);
      if(live.some(race=>race.number===next.race.number)) setComesBackAs(Math.max(...live.map(race=>race.number))+1);
    } catch(error) {setError(error);}
  })();},[]);
  const title=titles[view.action];
  if(!read) return <LeadHeader title={title} code={view.code} up="Race" body={<OpeningBody error={error}/>}/>;
  const {race}=read,name=raceName(race);
  /** Sends the save; a refusal shows on the screen, which stays. */
  async function save(body:object,saved:(answer:Answer)=>ToastSave,land:(answer:Answer)=>void) {
    setBusy(true);setRefused(null);
    try {const answer=await api<Answer>(`lead/races/${race.id}/${view.action}`,body);toast({message:toastLine(saved(answer))});onChanged?.();land(answer);}
    catch(error) {setRefused(error);setBusy(false);}
  }
  const meta=`${eventTitle(race.event)} · ${name}`,question=(verb:string)=><>{verb} <em>{name}?</em></>;
  let body;
  if(view.action==='re-run') {
    body=<Frame meta={meta} question={question('Re-run')} help={`${name} moves to Deleted races. A new ${race.kind==='final'?'final':name} opens with the same ${race.event.relay?'teams':'runners'} checked in.`}
      reason={null} busy={busy} label={`Re-run ${name}`} refused={refused}
      onGo={()=>void save({comment},()=>({kind:'re-run'}),answer=>onOpen({kind:'race',id:answer.newRaceId!,step:'runners'},{over:true}))}>
      <Comment value={comment} onChange={setComment}/>
    </Frame>;
  } else if(view.action==='delete') {
    // A race already in Deleted races can only be deleted for good.
    const permanent=race.deleted || forGood;
    body=<Frame meta={meta} question={question('Delete')} help={race.deleted?'It is already in Deleted races. Deleting it for good cannot be undone. Notes stay.':'Its results stop counting. You can restore it from Deleted races.'}
      reason={null} busy={busy} label={`Delete ${name}${permanent?' for good':''}`} danger refused={refused}
      onGo={()=>void save({permanent,comment},()=>({kind:'deleted',race,forGood:permanent}),()=>onBack(2))}>
      {!race.deleted && <div className="rz-choices rz-choices--stack" role="group" aria-label="How to delete">
        <button type="button" className="rz-choice" aria-pressed={!forGood} onClick={()=>setForGood(false)}><span>Move to Deleted races<span className="rz-choice__detail">You can restore it later.</span></span></button>
        <button type="button" className="rz-choice" aria-pressed={forGood} onClick={()=>setForGood(true)}><span>Delete for good<span className="rz-choice__detail">Cannot be undone. Notes stay.</span></span></button>
      </div>}
      <Comment value={comment} onChange={setComment}/>
    </Frame>;
  } else {
    body=<Frame meta={`${eventTitle(race.event)}${race.deletedAt?` · deleted ${clock(race.deletedAt)}`:''}`} question={question('Restore')}
      help={`Its results count again.${comesBackAs===null?'':` ${name} is taken now, so it comes back as ${raceName({kind:race.kind,number:comesBackAs})}.`}`}
      reason={null} busy={busy} label={`Restore ${name}`} refused={refused}
      onGo={()=>void save({},answer=>({kind:'restored',race:{...race,number:answer.number??race.number}}),()=>onBack())}>{null}</Frame>;
  }
  return <LeadHeader title={title} code={race.event.code} up={name} body={body}/>;
}
