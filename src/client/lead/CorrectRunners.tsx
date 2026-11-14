import { useEffect,useState } from 'react';
import { api } from '../api.js';
import { eventTitle } from '../../shared/day.js';
import type { LeadRaceRead } from '../../shared/lead-results.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceName } from '../../shared/race-flow.js';
import { isTeamEntry,runnersOf } from '../../shared/races.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { entryCount,legCheck,stillToRun,teamListOf } from '../../shared/teams.js';
import type { WristbandWarning } from '../../shared/wristband-checks.js';
import { toastLine } from '../../shared/toast-lines.js';
import { Callout,ErrorCallout,Icon } from '../races/parts.js';
import { LeadHeader,OpeningBody } from './LeadHeader.js';
import { DigitsField,KeepFocus } from '../races/Steps.js';
import { HeldCallout,TeamNote,TeamRow,type Held } from '../races/TeamSteps.js';
import { useToast } from '../races/Toast.js';
import type { View } from '../shell/addresses.js';
import { Comment } from './Comment.js';
import { Frame } from './RunnerSheet.js';

type CorrectionView=Extract<View,{kind:'correction'}>;
/** Sends the one save; a refusal comes back to show, and the screen stays. */
type Save=(command:'runners'|'teams',body:object)=>Promise<unknown>;
interface BodyProps { read:LeadRaceRead; save:Save; busy:boolean }

/**
 * Correct runner list or Correct teams, under the race page it was opened from. The draft lives on
 * this screen only: leaving it changes nothing. The docked Save sends it once, shows the toast and goes back.
 */
export function RaceCorrection({view,onBack,onChanged}:{view:CorrectionView;onBack:()=>void;onChanged?:()=>void}) {
  const toast=useToast();
  const [read,setRead]=useState<LeadRaceRead|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
  useEffect(()=>{api<LeadRaceRead>(`lead/races/${view.raceId}`).then(setRead,setError);},[]);
  const teams=view.action==='correct-teams',title=teams?'Correct teams':'Correct runner list';
  if(!read) return <LeadHeader title={title} code={view.code} up="Race" body={<OpeningBody error={error}/>}/>;
  const {race}=read;
  const save:Save=async(command,body)=>{
    setBusy(true);
    try {
      await api(`lead/races/${race.id}/${command}`,body);
      toast({message:toastLine({kind:'corrected',part:command})});
      onChanged?.();onBack();return null;
    } catch(error) {setBusy(false);return error;}
  };
  const Body=teams?CorrectTeams:CorrectRunnerList;
  return <LeadHeader title={title} code={race.event.code} up={raceName(race)} body={<Body read={read} save={save} busy={busy}/>}/>;
}
const raceMeta=(race:LeadRaceRead['race'])=>`${eventTitle(race.event)} · ${raceName(race)}`;

/**
 * Correct runner list: tap a runner to retype their number (they keep their place and time), Remove, Add runner. The
 * docked "Review runner list" checks the changed numbers as check-in does: warnings wait for Fix runners or Keep
 * warnings, then the review asks "7 runners. Is that right?" over "Save runner list".
 */
function CorrectRunnerList({read,save,busy}:BodyProps) {
  const {race}=read,original=runnersOf(race.parts.runners.value);
  const [rows,setRows]=useState(()=>original.map(runner=>({entryId:runner.id as string|undefined,number:String(runner.wristband)})));
  const [editing,setEditing]=useState<number|null>(null),[stage,setStage]=useState<'list'|'warnings'|'review'>('list');
  const [warnings,setWarnings]=useState<Array<{number:number;message:string}>>([]),[kept,setKept]=useState<number[]>([]);
  const [newDidNotFinish,setNewDidNotFinish]=useState(false),[comment,setComment]=useState('');
  const [checking,setChecking]=useState(false),[problem,setProblem]=useState(''),[failed,setFailed]=useState<unknown>(null),[refused,setRefused]=useState<unknown>(null);
  const changed=rows.length!==original.length || rows.some((row,at)=>row.entryId!==original[at].id || row.number!==String(original[at].wristband));
  const additions=rows.some(row=>!row.entryId),finish=race.parts.finish.value;
  /** A runner added to a final needs the lead's comment. */
  const commentRequired=race.kind==='final' && additions;
  function edit(index:number|null) {setProblem('');setFailed(null);setEditing(index);}
  async function review() {
    const blank=rows.findIndex(row=>row.number==='');
    if(blank>=0) {edit(blank);setProblem(`Type a wristband number for runner ${blank+1}, or remove that runner`);return;}
    edit(null);
    const numbers=rows.map(row=>Number(row.number)),refusal=runnerListRefusal(numbers);
    if(refusal && numbers.length) {setProblem(refusal);return;}
    setChecking(true);
    try {
      const found:Array<{number:number;message:string}>=[];
      for(const row of rows) {
        const number=Number(row.number);
        if(original.find(runner=>runner.id===row.entryId)?.wristband===number) continue;
        const data=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode:race.event.code,wristband:number,raceId:race.id});
        for(const warning of data.warnings.filter(warning=>race.kind!=='final' || warning.kind!=='already-ran')) found.push({number,message:warning.message});
      }
      setWarnings(found);setKept([]);setStage(found.length?'warnings':'review');
    } catch(error) {setFailed(error);}
    finally {setChecking(false);}
  }
  async function send() {
    const runners=rows.map(row=>({...(row.entryId?{entryId:row.entryId}:{}),wristband:Number(row.number)}));
    let order:undefined|{order:number[];didNotFinish:number[]};
    // New runners who did not finish keep the finishing order; otherwise it is recorded again.
    if(additions && newDidNotFinish && finish) {
      const numberFor=(id:string)=>runners.find(runner=>runner.entryId===id)?.wristband,known=(number:number|undefined):number is number=>number!==undefined;
      order={order:finish.order.map(numberFor).filter(known),didNotFinish:[...finish.didNotFinish.map(numberFor).filter(known),...runners.filter(runner=>!runner.entryId).map(runner=>runner.wristband)]};
    }
    setRefused(await save('runners',{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners,keptWarnings:kept,comment,...(order?{finish:order}:{})}));
  }
  const reviewing=stage==='review';
  const numbers=rows.map(row=>row.number).join(' · ')||'No runners';
  return <Frame meta={raceMeta(race)} question={reviewing?<><em>{entryCount(rows.length,false)}.</em> Is that right?</>:<>Correct the <em>runner list</em></>}
    help={reviewing?numbers:'Tap a runner to change their number: they keep their place and time. Remove or add a runner only when the runners themselves changed.'}
    reason={stage==='warnings'?'Fix the runners or keep the warnings.':!changed?'Change, add or remove a runner first.':reviewing && commentRequired && !comment.trim()?'Write a comment first.':null} busy={busy || checking}
    label={reviewing?'Save runner list':checking?'Checking…':'Review runner list'} refused={refused} onGo={()=>void (reviewing?send():review())}
    footer={editing===null?undefined:<KeepFocus className="rz-btn rz-btn--primary rz-btn--block" onClick={()=>edit(null)}>Done</KeepFocus>}>
    {stage==='list' && <>
      <ol className="rz-lead-rows" aria-label="Runners">{rows.map((row,index)=><li key={row.entryId??`new-${index}`} className="rz-runner-edit">
        {editing===index?<DigitsField id="runner-number" label={`Wristband for runner ${index+1}`} value={row.number} onRelease={()=>undefined} selectKey={String(index)}
          onChange={digits=>setRows(previous=>previous.map((old,at)=>at===index?{...old,number:digits}:old))} onEnter={()=>edit(null)}/>
        :<>
          <button type="button" className="rz-lead-row" aria-label={`Runner ${index+1} · ${row.number||'Number needed'}`} onClick={()=>edit(index)}>
            <span className="rz-lead-row__place">{index+1}</span><span className="rz-lead-row__num">{row.number||'Number needed'}</span><Icon name="pencil"/></button>
          <button type="button" className="rz-btn rz-btn--small rz-btn--danger rz-runner-edit__remove" aria-label={`Remove runner ${index+1}`} onClick={()=>{edit(null);setRows(previous=>previous.filter((_old,at)=>at!==index));}}><Icon name="close"/></button>
        </>}
      </li>)}</ol>
      {!rows.length && <p className="rz-empty">No runners</p>}
      <button type="button" className="rz-btn rz-btn--small rz-runner-edit__add" onClick={()=>{setRows(previous=>[...previous,{entryId:undefined,number:''}]);edit(rows.length);}}><Icon name="plus"/>Add runner</button>
      {problem && <Callout message={problem}/>}
      {failed!==null && <ErrorCallout error={failed} action="read"/>}
    </>}
    {stage==='warnings' && <Callout message={warnings.map(warning=>warning.message).join(' ')} actions={<>
      <button type="button" className="rz-btn" onClick={()=>{setKept([...new Set(warnings.map(warning=>warning.number))]);setStage('review');}}>Keep warnings</button>
      <button type="button" className="rz-btn rz-btn--primary" onClick={()=>setStage('list')}>Fix runners</button></>}/>}
    {reviewing && <>
      {warnings.map((warning,index)=><Callout key={index} status message={`${warning.message} · Warning kept`}/>)}
      {additions && finish && <fieldset><legend className="rz-field__label">Finish order must be recorded again for new runners, unless they did not finish.</legend>
        <div className="rz-choices rz-choices--stack">
          <button type="button" className="rz-choice" aria-pressed={!newDidNotFinish} onClick={()=>setNewDidNotFinish(false)}>Record the finish order again</button>
          <button type="button" className="rz-choice" aria-pressed={newDidNotFinish} onClick={()=>setNewDidNotFinish(true)}>New runners did not finish</button>
        </div></fieldset>}
      <Comment value={comment} onChange={setComment} required={commentRequired}/>
      <button type="button" className="rz-btn rz-btn--small rz-runner-edit__add" onClick={()=>setStage('list')}>Change runner list</button>
    </>}
  </Frame>;
}

/** One team of the race as Correct teams sends it: kept as it is, its children corrected, or added from Still to run. */
type TeamChoice={entryId:string;legs?:Array<number|null>}|{teamId:string};
const choiceKey=(choice:TeamChoice)=>'entryId' in choice?choice.entryId:choice.teamId;
/**
 * Correct teams, a relay race's runner list, built on the start line's team legs: each team in the race as four leg
 * chips with Take off; tapping a chip retypes that child (checked as the start line checks a leg: a refusal waits for
 * Fix number, a warning for Fix number or Keep), and Still to run adds a team. The team keeps its place and time; on
 * the team's latest race the team itself changes too.
 */
function CorrectTeams({read,save,busy}:BodyProps) {
  const {race}=read,teams=read.teams||[],relay=teamListOf({event:race.event,teams}),entries=(race.parts.runners.value||[]).filter(isTeamEntry);
  const [draft,setDraft]=useState<TeamChoice[]>(()=>entries.map(entry=>({entryId:entry.id})));
  const [changing,setChanging]=useState<{key:string;leg:number}|null>(null),[typed,setTyped]=useState(''),[held,setHeld]=useState<Held|null>(null);
  const [kept,setKept]=useState<number[]>([]),[comment,setComment]=useState(''),[refused,setRefused]=useState<unknown>(null);
  const cards=draft.map(choice=>{
    if('teamId' in choice) {const team=teams.find(item=>item.id===choice.teamId)!;return {choice,team,legs:team.legs.map(leg=>leg.wristband)};}
    const entry=entries.find(item=>item.id===choice.entryId)!;
    return {choice,team:entry.team,legs:choice.legs??entry.legs.map(leg=>leg.wristband)};
  });
  // Still to run: the relay's teams no race holds, and this race's own teams taken off in this draft.
  const left=(key:string)=>!draft.some(choice=>choiceKey(choice)===key);
  const available=[...teams.filter(team=>stillToRun(team) && left(team.id)).map(team=>({key:team.id,team:{number:team.number,legs:team.legs},choice:{teamId:team.id} as TeamChoice})),
    ...entries.filter(entry=>left(entry.id)).map(entry=>({key:entry.id,team:{number:entry.team.number,legs:entry.legs},choice:{entryId:entry.id} as TeamChoice}))].sort((one,other)=>one.team.number-other.team.number);
  const changed=JSON.stringify(draft)!==JSON.stringify(entries.map(entry=>({entryId:entry.id})));
  /** A team added to a final needs the lead's comment. */
  const commentRequired=race.kind==='final' && draft.some(choice=>'teamId' in choice);
  const card=changing && cards.find(item=>choiceKey(item.choice)===changing.key);
  function cancel() {setChanging(null);setTyped('');setHeld(null);}
  function start(key:string,leg:number,wristband:number|null) {setHeld(null);setChanging({key,leg});setTyped(wristband===null?'':String(wristband));}
  /** Done on a leg being changed: checked against the race as it was read; a warning kept is sent as kept. */
  function done(keep=false) {
    if(!card || !changing || !typed) return;
    const value=Number(typed),legs=[...card.legs];
    if(legs[changing.leg]===value) {cancel();return;}
    legs[changing.leg]=value;
    const {refusal,warnings}=legCheck(relay,read.relays||[],card.team.id,legs,changing.leg,race.id);
    if(refusal) {setHeld({refused:refusal});return;}
    if(warnings.length && !keep) {setHeld({warning:warnings.map(warning=>warning.message).join(' ')});return;}
    if(keep) setKept(previous=>[...previous,value]);
    setDraft(previous=>previous.map(choice=>choiceKey(choice)===changing.key?{entryId:changing.key,legs}:choice));cancel();
  }
  async function send() {
    // A corrected team's children already in it keep their warnings, as a team's change at check-in does.
    const unchanged=draft.flatMap(choice=>'entryId' in choice && choice.legs?choice.legs.filter((wristband):wristband is number=>wristband!==null && entries.find(entry=>entry.id===choice.entryId)!.legs.some(leg=>leg.wristband===wristband)):[]);
    setRefused(await save('teams',{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,teams:draft,keptWarnings:[...new Set([...kept,...unchanged])],comment}));
  }
  return <Frame meta={raceMeta(race)} question={card?<>Change <em>Team {card.team.number}'s</em> {ordinal(changing!.leg+1)} leg</>:<>Correct the <em>teams</em></>}
    help="Tap a leg to change its child: the team keeps its place and time. On the team's latest race, the team changes too."
    reason={!changed?'Change a team first.':commentRequired && !comment.trim()?'Write a comment first.':null} busy={busy} label="Save teams" refused={refused} onGo={()=>void send()}
    footer={card && <div className="rz-footer__pair"><button type="button" className="rz-btn" onClick={cancel}>Cancel</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || !!held} onClick={()=>done()}>Done</KeepFocus></div>}>
    {card && <DigitsField id="leg" label="New number" value={typed} held={!!held} warn={!!held} onRelease={()=>setHeld(null)} selectKey={`${changing!.key}:${changing!.leg}`}
      onChange={digits=>{setTyped(digits);setHeld(null);}} onEnter={()=>done()} hint="Type the right number and tap Done."/>}
    {held && <HeldCallout held={held} onKeep={()=>done(true)} onFix={()=>setHeld(null)}/>}
    {cards.map(item=>{
      const key=choiceKey(item.choice),own='entryId' in item.choice;
      return <section key={key} className="rz-legrow" aria-label={`Team ${item.team.number}`}>
        <div className="rz-legrow__head"><div className="rz-teamcard__title"><h3 className="rz-teamcard__name">Team {item.team.number}</h3><TeamNote legs={item.legs.map(wristband=>({wristband}))}/></div>
          <button type="button" className="rz-btn rz-btn--small" onClick={()=>{cancel();setDraft(previous=>previous.filter(choice=>choiceKey(choice)!==key));}}>Take off</button></div>
        <ul className="rz-legchips">{item.legs.map((wristband,index)=>{
          const inner=<><span className="rz-legchip__ord">{ordinal(index+1)}</span>{wristband??'–'}</>,on=changing?.key===key && changing.leg===index;
          // A team added in this draft joins with its children as they are; only a team already in the race is retyped here.
          return <li key={index}>{own?<button type="button" className={on?'rz-legchip rz-legchip--changing':'rz-legchip'} aria-pressed={on}
            aria-label={`Team ${item.team.number} ${ordinal(index+1)} leg: ${wristband??'empty'}. Change`} onMouseDown={event=>event.preventDefault()}
            onClick={()=>on?cancel():start(key,index,wristband)}>{inner}</button>:<span className="rz-legchip">{inner}</span>}</li>;
        })}</ul>
      </section>;
    })}
    {!cards.length && <p className="rz-empty">No teams</p>}
    {available.length>0 && <><h3 className="rz-section">Still to run</h3>
      <ul className="rz-teamrows" aria-label="Still to run">{available.map(item=><TeamRow key={item.key} team={item.team} onAdd={()=>{cancel();setDraft(previous=>[...previous,item.choice]);}}/>)}</ul></>}
    <Comment value={comment} onChange={setComment} required={commentRequired}/>
  </Frame>;
}
