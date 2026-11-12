import { useEffect,useId,useState } from 'react';
import { api,StaleRequest } from '../api.js';
import { resultName,teamWristbands,type ResultEntry,type ResultTie } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { keepsSameRaceOrder,tieEntryKey,type TieOutcome } from '../../shared/ties.js';
import { ordinal } from '../../shared/ordinal.js';
import { SortableList } from '../flow/SortableList.js';
import { formatTime } from '../../shared/time-entry.js';
import { toastLine } from '../../shared/toast-lines.js';
import { useToast } from '../races/Toast.js';
import { eventTitle } from '../../shared/day.js';
import { andList } from '../../shared/race-flow.js';
import { raceLabel } from '../../shared/races.js';
import { DockedFooter,ErrorCallout,Icon,Opening } from '../races/parts.js';
import { LeadBar } from './LeadBar.js';
const outcomes:ReadonlyArray<[TieOutcome,string]>=[['no-run-off','No run-off needed'],['run-off','Run-off held'],['decided','Decided without a run-off']];
/**
 * The tie as its own screen (spec #250 "The tie"), at /results/<code>/ties/<tieId>: how it was decided, the order for a
 * run-off or a decision, and a comment (needed only for a decision without a run-off). Back is the only way out and goes
 * where it was opened; a save goes back too. `stage` is "no-final" when opened from Results without a final, which
 * judges the tie against medal places.
 */
export function Tie({code,tieId,stage,onBack}:{code:string;tieId:string;stage?:'no-final';onBack:()=>void}) {
  const [detail,setDetail]=useState<EventResultsRead|null>(null);
  const [error,setError]=useState<unknown>(null);
  useEffect(()=>{
    api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/results`).then(setDetail,failure=>{if(!(failure instanceof StaleRequest)) setError(failure);});
  },[code]);
  const tie=(stage==='no-final'?detail?.results.noFinalTies:detail?.results.ties)?.find(tie=>tie.id===tieId);
  const up=detail?eventTitle(detail.event):code;
  if(detail && tie) return <TieForm detail={detail} tie={tie} stage={stage} up={up} onBack={onBack}/>;
  return <LeadBar title="Tie" code={code} up={up} body={<main className="rz-main rz-main--form">
    {error!==null?<ErrorCallout error={error} action="read"/>:detail?<p className="rz-empty">This tie is settled, or its times have changed.</p>:<Opening/>}
  </main>}/>;
}
function TieForm({detail,tie,stage,up,onBack}:{detail:EventResultsRead;tie:ResultTie;stage?:'no-final';up:string;onBack:()=>void}) {
  const commentId=useId(),event=detail.event,toast=useToast();
  const [outcome,setOutcome]=useState<TieOutcome|null>(null);
  const [order,setOrder]=useState(tie.entries);
  const [comment,setComment]=useState('');
  const [error,setError]=useState<unknown>(null);
  const [saving,setSaving]=useState(false);
  const heat=(entry:ResultEntry)=>{const race=detail.results.races.find(({race})=>race.id===entry.raceId)?.race;return race?raceLabel(race):'';};
  const one=tie.entries.some(entry=>entry.team)?'team':'runner';
  const reason=!outcome?'Choose how the tie was decided.':outcome==='decided' && !comment.trim()?'Write why it was decided this way.':'';
  async function save() {
    if(reason || saving) return;
    setSaving(true);setError(null);
    try {
      await api(`lead/events/${encodeURIComponent(event.code)}/settle-tie`,{tieId:tie.id,stage,outcome,comment,...(outcome==='no-run-off'?{}:{order:order.map(({raceId,entryId})=>({raceId,entryId}))})});
      toast({message:toastLine({kind:'tie-saved',event})});onBack();
    } catch(failure) {setError(failure);setSaving(false);}
  }
  return <LeadBar title={`Tie at ${formatTime(tie.time)}`} code={event.code} up={up} body={<>
    <main className="rz-main rz-main--form">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta rz-prompt__meta--fit"><span>{eventTitle(event)}</span>
          <span>{'\u00a0· decides '}{andList(tie.entries.map((_entry,index)=>ordinal(tie.place+index)))}</span></p>
        <h2 className="rz-prompt__q">How was the tie <em>decided?</em></h2>
        <p className="rz-prompt__help">{andList(tie.entries.map(entry=>`${resultName(entry)} (${heat(entry)})`))} {tie.entries.length>2?'all':'both'} ran {formatTime(tie.time)}.</p></div>
      <div className="rz-choices rz-choices--stack" role="group" aria-label="How was the tie decided?">
        {outcomes.map(([value,label])=><button key={value} type="button" className="rz-choice" aria-pressed={outcome===value} disabled={saving} onClick={()=>setOutcome(value)}>{label}</button>)}
      </div>
      {outcome && outcome!=='no-run-off' && <>
        <h3 className="rz-section">Order, {ordinal(tie.place)} first</h3>
        <p className="rz-empty">Drag a handle to move a {one}. {tie.entries.length>2?'All':'Both'} keep their time of {formatTime(tie.time)}.</p>
        {new Set(order.map(entry=>entry.raceId)).size<order.length && <p className="rz-empty">{one==='team'?'Teams':'Runners'} from the same race stay in their finishing order.</p>}
        <SortableList label="Tie order" items={order} itemKey={tieEntryKey} itemName={resultName} disabled={saving} isAllowed={next=>keepsSameRaceOrder(next,tie.entries)} onReorder={setOrder}
          look={{list:'rz-orderrows',row:'rz-orderrow',handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:name=>`Move ${name}`}}
          renderItem={(entry,place)=><><span className="rz-orderrow__place">{ordinal(tie.place+place-1)}</span>
            <span className="rz-orderrow__num rz-orderrow__num--detail">{resultName(entry)}<span className="rz-orderrow__detail">{heat(entry)}{entry.team?` · ${teamWristbands(entry.team)}`:''}</span></span></>}/>
      </>}
      {outcome && <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor={commentId}>{outcome==='decided'?'Comment':'Comment (optional)'}</label>
        <textarea className="rz-field__input rz-field__input--comment" id={commentId} value={comment} maxLength={1000} disabled={saving} onChange={change=>setComment(change.target.value)}/></div>}
      {error!==null && <ErrorCallout error={error} action="save"/>}
    </main>
    <DockedFooter>{reason && <p className="rz-footer__reason">{reason}</p>}
      <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={reason || saving?true:undefined} onClick={()=>void save()}>{saving?'Saving…':'Save tie'}</button></DockedFooter>
  </>}/>;
}
