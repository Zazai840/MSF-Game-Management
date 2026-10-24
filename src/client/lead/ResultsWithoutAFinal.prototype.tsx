/**
 * PROTOTYPE, throw away: three looks for "Results without a final" on a heats event's Results page, switched by
 * ?variant=A|B|C (dev server only). Nothing is saved: confirming only changes this page in memory, and a reload undoes it.
 * Answers "How do the option and an event decided without a final look on a phone?" (issue #159).
 */
import { useEffect,useId,useState,type ReactNode } from 'react';
import type { EventResultsRead } from '../../shared/lead-results.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import type { StageCheckSheet,StageItem } from '../../shared/stages.js';
import { ordinal } from '../../shared/ordinal.js';
import { ActionSheet } from './ActionSheet.js';
import './ResultsWithoutAFinal.prototype.css';

const variants=['A','B','C'] as const;
type Variant=typeof variants[number];
const names:Record<Variant,string>={A:'Two buttons',B:'Choose how it ends',C:'Preview on the leaderboard'};
const line='No final will be run. Medals go to the 3 fastest heat times.';

export function useNoFinalPrototype() {
  const param=import.meta.env.DEV?new URLSearchParams(location.search).get('variant'):null;
  const [variant,setVariant]=useState<Variant|null>(variants.find(key=>key===param)??null);
  const [decided,setDecided]=useState<string|null>(null);
  const [preview,setPreview]=useState(false);
  const [settled,setSettled]=useState<string[]>([]);
  function choose(next:Variant) {
    const url=new URL(location.href);url.searchParams.set('variant',next);history.replaceState(null,'',url);
    setVariant(next);setDecided(null);setPreview(false);
  }
  return {variant,choose,decided,setDecided,preview,setPreview,settled,settle:(id:string)=>setSettled(all=>[...all,id])};
}
export type NoFinalPrototype=ReturnType<typeof useNoFinalPrototype>;

const finishers=(detail:EventResultsRead)=>detail.results.leaderboard.filter(row=>row.position!==null);
/** The final must not have started: nobody marked Here or Absent and no finishing order (the closed ticket's rule). */
export function noFinalOffered(detail:EventResultsRead,proto:NoFinalPrototype) {
  const final=detail.results.finalResults;
  if(!proto.variant || detail.event.format!=='heats' || !finishers(detail).length) return false;
  return !final || (!final.hasRun && final.leaderboard.length===0 && final.entries.every(entry=>!entry.absent));
}

/** The page as it would read with medals from heat times: medal line under 3rd, no Q marks, no final. */
export function withoutFinal(detail:EventResultsRead,proto:NoFinalPrototype):EventResultsRead {
  if(!(proto.decided!==null || proto.preview)) return detail;
  const leaderboard=detail.results.leaderboard.map((row):LeaderboardRow=>({...row,qualification:null,highlighted:row.position!==null && row.position<=6,medalPlace:row.position!==null && row.position<=3?row.position as 1|2|3:null}));
  const top=finishers(detail);
  const results={...detail.results,leaderboard,band:{highlightCount:6,lineAfter:3,lineLabel:'Medal line' as const},finalResults:null};
  if(proto.decided===null) return {...detail,results};
  return {...detail,results:{...results,status:'Complete',provisional:false,checkSheet:null,heatsCheckSheet:null,notRankedYet:[],
    inputRunning:{eventCode:detail.event.code,first:top[0]?.wristband??null,second:top[1]?.wristband??null,third:top[2]?.wristband??null}},
    auditNotes:[{id:'prototype',action:'no-final',actor:'You',at:new Date().toISOString(),message:`You marked Results without a final - ${proto.decided}`,comment:proto.decided,touches:[]},...detail.auditNotes]};
}

/**
 * Must settle first, judged against medals: the heats' own blockers, plus a tie a lead settled "No run-off needed"
 * for qualifying that now decides a medal (it comes back). Prototype: tapping that one treats it as settled again.
 */
function blockers(detail:EventResultsRead,proto:NoFinalPrototype):StageItem[] {
  const base=detail.results.heatsCheckSheet?.mustSettleFirst??[];
  const rows=finishers(detail),comeBack:StageItem[]=[];
  for(const time of new Set(rows.map(row=>row.time))) {
    const group=rows.filter(row=>row.time===time);
    if(group.length<2 || new Set(group.map(row=>row.raceId)).size<2 || !group.some(row=>row.position!<=3)) continue;
    if(!group.every(row=>row.flags.some(flag=>flag.kind==='tie-settled'))) continue;
    const id=`come-back:${time}`;
    if(!proto.settled.includes(id)) comeBack.push({id,kind:'tie',message:`Tie for ${ordinal(group[0].position!)}: ${group.map(row=>row.wristband).join(', ')} - settled as "No run-off needed" for qualifying, but it now decides a medal`});
  }
  return [...base,...comeBack];
}

function Creates({detail}:{detail:EventResultsRead}) {
  const top=finishers(detail);
  return <section><h4>What this creates</h4><p>Medal places</p><ol className="stage-creates">{[0,1,2].map(index=><li key={index}>{ordinal(index+1)}: {top[index]?.wristband??'-'}</li>)}</ol></section>;
}
function Checks({detail,proto,onOpen}:{detail:EventResultsRead;proto:NoFinalPrototype;onOpen:(item:StageItem)=>void}) {
  const must=blockers(detail,proto),look=detail.results.heatsCheckSheet?.worthALook??[];
  const open=(item:StageItem)=>item.id.startsWith('come-back:')?proto.settle(item.id):onOpen(item);
  return <><section className={must.length?'stage-blockers stage-attention':'stage-blockers'}><h4>Must settle first</h4>{must.length?<ul>{must.map(item=><li key={item.id}><button onClick={()=>open(item)}>{item.message}</button></li>)}</ul>:<p>Nothing to settle</p>}</section>
    <section className={look.length?'stage-warnings stage-attention':'stage-warnings'}><h4>Worth a look</h4>{look.length?<><p>These warnings do not block completion.</p><ul>{look.map(item=><li key={item.id}><button onClick={()=>onOpen(item)}>{item.message}</button></li>)}</ul></>:<p>No open warnings</p>}</section></>;
}
/** The comment and Confirm, shared by every variant: the decisions fix these, the variants only place them. */
function ConfirmForm({detail,proto,label='Confirm',onDone}:{detail:EventResultsRead;proto:NoFinalPrototype;label?:string;onDone?:()=>void}) {
  const id=useId(),[comment,setComment]=useState(''),blocked=blockers(detail,proto).length>0;
  const discards=!!detail.results.finalResults;
  return <form onSubmit={event=>{event.preventDefault();proto.setPreview(false);proto.setDecided(comment.trim());onDone?.();}}>
    {discards && <p role="status">The final's line-up will be discarded.</p>}
    <p className="no-final-line">{line}</p>
    <label htmlFor={id}>Comment</label><textarea id={id} required maxLength={1000} placeholder="For example: Out of time" value={comment} onChange={event=>setComment(event.target.value)}/>
    <button disabled={blocked}>{label}</button>
  </form>;
}
function NoFinalSheet({detail,proto,onOpen,onClose}:{detail:EventResultsRead;proto:NoFinalPrototype;onOpen:(item:StageItem)=>void;onClose:()=>void}) {
  return <ActionSheet title="Results without a final" onClose={onClose}><h3>Results without a final</h3>
    <Checks detail={detail} proto={proto} onOpen={item=>{onClose();onOpen(item);}}/><Creates detail={detail}/>
    <ConfirmForm detail={detail} proto={proto} onDone={onClose}/>
    <button className="button-secondary" onClick={onClose}>Close check sheet</button></ActionSheet>;
}
function ReopenSheet({proto,onClose}:{proto:NoFinalPrototype;onClose:()=>void}) {
  const id=useId(),[comment,setComment]=useState('');
  return <ActionSheet title="Reopen results" onClose={onClose}><h3>Reopen results</h3>
    <form onSubmit={event=>{event.preventDefault();if(comment.trim()) {proto.setDecided(null);onClose();}}}><p>This clears the medals and opens the heats again. You can then run a final or choose Results without a final again.</p>
      <label htmlFor={id}>Comment</label><textarea id={id} required maxLength={1000} value={comment} onChange={event=>setComment(event.target.value)}/><button>Reopen</button></form>
    <button className="button-secondary" onClick={onClose}>Close check sheet</button></ActionSheet>;
}

/**
 * The stage actions for a heats event under a prototype variant, in place of the usual row. `real` is that row
 * (Heats complete / Final complete / Reopen heats) for the variants that keep it.
 */
export function NoFinalActions({detail,proto,real,onStage,onOpen}:{detail:EventResultsRead;proto:NoFinalPrototype;real:ReactNode;onStage:(sheet:StageCheckSheet)=>void;onOpen:(item:StageItem)=>void}) {
  const [sheet,setSheet]=useState<'no-final'|'choose'|'reopen'|null>(null);
  const offered=noFinalOffered(detail,proto),heats=detail.results.heatsCheckSheet;
  const close=()=>setSheet(null);
  if(proto.decided!==null) return <section className="stage-actions"><button onClick={()=>setSheet('reopen')}>Reopen results</button>{sheet==='reopen' && <ReopenSheet proto={proto} onClose={close}/>}</section>;
  const noFinal=sheet==='no-final' && <NoFinalSheet detail={detail} proto={proto} onOpen={onOpen} onClose={close}/>;
  if(proto.variant==='A') return <section className="stage-actions">{real}{offered && <button className="button-secondary" onClick={()=>setSheet('no-final')}>Results without a final</button>}{noFinal}</section>;
  if(proto.variant==='B') {
    const final=detail.results.finalResults,top=finishers(detail);
    if(final) return <section className="stage-actions">{real}{offered && <p className="no-final-drop">No time for the final? <button className="button-quiet" onClick={()=>setSheet('no-final')}>Results without a final</button></p>}{noFinal}</section>;
    return <section className="stage-actions">{heats && !heats.completed?<button onClick={()=>setSheet('choose')}>Finish heats</button>:real}
      {sheet==='choose' && <ActionSheet title="How does this event end?" onClose={close}><h3>How does {detail.event.name} {detail.event.section} end?</h3>
        <div className="no-final-choices">
          <button className="no-final-choice" onClick={()=>{close();onStage(heats!);}}><strong>Run a final</strong><span>The 6 fastest go to the final.</span><span className="no-final-preview">{top.slice(0,6).map(row=>row.wristband).join(' · ')}</span></button>
          <button className="no-final-choice" onClick={()=>setSheet('no-final')}><strong>Results without a final</strong><span>Medals go to the 3 fastest heat times.</span><span className="no-final-preview">{top.slice(0,3).map((row,index)=>`${ordinal(index+1)} ${row.wristband}`).join(' · ')}</span></button>
        </div><button className="button-secondary" onClick={close}>Close</button></ActionSheet>}
      {noFinal}</section>;
  }
  return <section className="stage-actions">{proto.preview?<div className="no-final-inline"><h3>Results without a final</h3><Checks detail={detail} proto={proto} onOpen={onOpen}/><Creates detail={detail}/><ConfirmForm detail={detail} proto={proto}/></div>:real}</section>;
}

/** Variant C's switch above the leaderboard: the same heats, with a final or without one. */
export function NoFinalToggle({detail,proto}:{detail:EventResultsRead;proto:NoFinalPrototype}) {
  if(proto.variant!=='C' || proto.decided!==null || !noFinalOffered(detail,proto)) return null;
  return <div className="no-final-toggle" role="group" aria-label="How this event ends">
    <button aria-pressed={!proto.preview} onClick={()=>proto.setPreview(false)}>{detail.results.finalResults?'Run the final':'With a final'}</button>
    <button aria-pressed={proto.preview} onClick={()=>proto.setPreview(true)}>Without a final</button>
  </div>;
}

/** The floating bar that flips between variants (dev only): arrows or the keyboard's left and right keys. */
export function PrototypeSwitcher({proto}:{proto:NoFinalPrototype}) {
  const index=variants.indexOf(proto.variant!),step=(by:number)=>proto.choose(variants[(index+by+variants.length)%variants.length]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(target.closest('input,textarea,[contenteditable]')) return;
      if(event.key==='ArrowLeft') step(-1);if(event.key==='ArrowRight') step(1);
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  });
  if(!import.meta.env.DEV || !proto.variant) return null;
  return <div className="prototype-switcher" aria-label="Prototype variant"><button onClick={()=>step(-1)} aria-label="Previous variant">‹</button><span>{proto.variant} ({names[proto.variant]})</span><button onClick={()=>step(1)} aria-label="Next variant">›</button></div>;
}
