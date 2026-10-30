import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ordinal } from '../../shared/ordinal.js';
import { andList,finishedWords,onlyRunners,raceName,usualRunnersPerRace,usualSizeApplies,type RaceFlowRead,type Step } from '../../shared/race-flow.js';
import { entryName,isTeamEntry,runnersOf,runnersText,type RaceEntry } from '../../shared/races.js';
import { changingName,entryCount,filledLegs,stillToRun,teamCount,type TeamLeg } from '../../shared/teams.js';
import { digitsForTime,formatTimeDigits,parseTimeDigits,formatTime } from '../../shared/time-entry.js';
import { plainWristbandWarning } from '../../shared/wristband-checks.js';
import { wrongTimesBanner } from '../../shared/wrong-times.js';
import { phoneStorage } from '../api.js';
import { digitsOnly } from '../flow/NumberEntry.js';
import { SortableList } from '../flow/SortableList.js';
import { wrongTimesByPlace } from '../flow/WrongTime.js';
import { useWristbandEntry } from './wristband-entry.js';
import { Callout,DockedFooter,Icon,Sheet } from './parts.js';
import { CheckInTeamSheet } from './TeamSheet.js';
import { useStepWrites,type useFlowWrite } from './writes.js';

/** What every step body gets: the race, its writes, and Done for its step (That's everyone, Save the order, No more finishers), and `me`, this phone's sign-in. */
export interface StepProps { read:RaceFlowRead; flow:ReturnType<typeof useFlowWrite>; onDone:(step:Step)=>void; locked:boolean; me:string }
/**
 * One number typed on the phone's own number pad (wristbands, times). The input stays mounted and focused between
 * entries so the keyboard never closes; it closes while a warning waits for Fix or Keep, and opens again after with
 * what is in the box selected, so typing replaces it. Tapping the box while a warning waits calls `onRelease` (as Fix
 * does), keeping the typed digits to edit. Enter calls `onEnter`, as the footer's Next does.
 */
function DigitsField({id,label,value,onChange,onEnter,onRelease,held=false,busy=false,warn=false,hint,selectKey}:{id:string;label:string;value:string;onChange:(digits:string)=>void;onEnter:()=>void;
  onRelease:()=>void;held?:boolean;busy?:boolean;warn?:boolean;hint?:ReactNode;selectKey?:string}) {
  const input=useRef<HTMLInputElement>(null),wasHeld=useRef(held);
  useLayoutEffect(()=>{if(held) input.current?.blur();else if(wasHeld.current) {input.current?.focus();input.current?.select();}wasHeld.current=held;},[held]);
  useEffect(()=>{input.current?.focus({preventScroll:true});},[]);
  useLayoutEffect(()=>{if(selectKey!==undefined && !held) {input.current?.focus({preventScroll:true});input.current?.select();}},[selectKey]);
  return <div className={warn?'rz-field rz-field--warn':'rz-field'}>
    <label className="rz-field__label" htmlFor={id}>{label}</label>
    <input ref={input} className="rz-field__input" id={id} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" autoCorrect="off" spellCheck={false}
      value={value} readOnly={busy} aria-describedby={hint?`${id}-hint`:undefined} onChange={event=>onChange(digitsOnly(event.target.value))}
      // The tap's own caret placement lands after the release, so select again once it has (unless held again by then:
      // WebKit's select() would focus the box and release it).
      onFocus={()=>{if(held) {onRelease();requestAnimationFrame(()=>{if(document.activeElement===input.current) input.current?.select();});}}}
      onKeyDown={event=>{if(event.key==='Enter' && !event.nativeEvent.isComposing) {event.preventDefault();onEnter();}}}/>
    {hint && <p className="rz-field__hint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}
/**
 * A footer button that keeps the number pad open (the tap does not take focus from the input). Greyed out it is
 * aria-disabled, not disabled: a disabled button gets no mousedown to cancel, so a tap on it would close the keyboard.
 */
const KeepFocus=({className,disabled=false,onClick,children}:{className:string;disabled?:boolean;onClick:()=>void;children:ReactNode})=>
  <button type="button" className={className} aria-disabled={disabled || undefined} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(!disabled) onClick();}}>{children}</button>;
/** The usual-heat-size warning shows once per race per person: has this phone shown it for this race? */
function useSizeWarning(raceId:string) {
  const [showing,setShowing]=useState(false);
  return {showing,show:()=>{if(phoneStorage.warnedSize(raceId)) return;phoneStorage.rememberWarnedSize(raceId);setShowing(true);},dismiss:()=>setShowing(false)};
}

type Entry={id?:string;wristband:number};
/**
 * Start line: wristbands checked in one at a time, each saved as it is typed, with the existing warnings as Fix
 * number / Keep. Tapping a typed number changes it: its number moves into the big box, checked like a new one when
 * saved (the entry, so any finish place, kept), or Remove takes the runner off (asking first if the finish line has
 * placed them). A half-typed next number waits meanwhile. "That's everyone" marks Runners done. On a Races-tab event
 * the 6th runner brings the usual-heat-size note, once. On a final it is the Here / Absent list of the seeded runners.
 */
export function StartLine({read,flow,onDone,locked,me}:StepProps) {
  const {race,group}=read,event=group.event,runners=runnersOf(race.parts.runners.value);
  const writes=useStepWrites<{runners:Entry[];keptWarnings:number[]}>(flow.write,'check-in','runners',race.id,race.parts.runners.version);
  const size=useSizeWarning(race.id),applies=usualSizeApplies(event) && race.kind!=='final';
  const entries:Entry[]=writes.pending?.runners||runners.map(({id,wristband})=>({id,wristband}));
  // The entry being changed, found again by id once saved (a number just typed has none until the server answers).
  const [changing,setChanging]=useState<Entry|null>(null),[asking,setAsking]=useState(false),[said,setSaid]=useState('');
  const target=changing && entries.find(item=>changing.id!==undefined?item.id===changing.id:item.wristband===changing.wristband)||null;
  const entry=useWristbandEntry(event,race.id,entries.map(item=>item.wristband),async(wristband,kept)=>{
    const sent=await writes.send({runners:[...entries,{wristband}],keptWarnings:kept?[wristband]:[]});
    if(typeof sent==='object' && applies && entries.length+1===usualRunnersPerRace) size.show();
    return sent;
  });
  const change=useWristbandEntry(event,race.id,entries.filter(item=>item!==target).map(item=>item.wristband),async(wristband,kept)=>{
    const sent=await writes.send({runners:entries.map(item=>item===target?{...item,wristband}:item),keptWarnings:kept?[wristband]:[]});
    if(typeof sent==='object') {setSaid(`${target!.wristband} changed to ${wristband}`);setChanging(null);}
    return sent;
  });
  if(race.kind==='final') return event.relay?<TeamAttendance {...{read,flow,onDone,locked,me}}/>:<Attendance {...{read,flow,onDone,locked,me}}/>;
  if(event.relay) return <TeamStartLine {...{read,flow,onDone,locked,me}}/>;
  const count=entries.length,more=applies && count>usualRunnersPerRace,on=target?change:entry;
  const cancel=()=>{change.fix();setAsking(false);setChanging(null);};
  const start=(item:Entry)=>{change.fix();change.type(String(item.wristband));setAsking(false);setSaid('');setChanging(item);};
  // An unchanged number just closes the change; any other is checked like a new number.
  const save=()=>{if(Number(change.current)===target!.wristband) cancel();else void change.next();};
  const place=target?.id?(race.parts.finish.value?.order||[]).indexOf(target.id):-1;
  function remove() {
    if(place>=0 && !asking) {setAsking(true);return;}
    void writes.send({runners:entries.filter(item=>item!==target),keptWarnings:[]});
    setSaid(`${target!.wristband} taken off this heat`);cancel();
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact">
        {locked?<><p className="rz-prompt__meta">{raceName(race)}</p><h2 className="rz-prompt__q">{runnersText(count)} checked in</h2></>
          :<><p className="rz-prompt__meta">{raceName(race)} · {count} {count===1?'runner':'runners'} so far{more?' · more than usual':''}</p>
          <h2 className="rz-prompt__q">{target?`Change wristband ${target.wristband}`:`Runner ${count+1}: wristband number?`}</h2></>}
      </div>
      {flow.error && <Callout message={flow.error}/>}
      {said && !target && <p className="rz-note" role="status">{said}</p>}
      {count>0 && <ul className="rz-chips" aria-label={locked?'Checked in':'Wristbands entered'}>{entries.map(item=>{
        const runner=runners.find(other=>other.id===item.id);
        const kept=!!runner?.warnings?.length,look=['rz-chip',kept?'rz-chip--warn':'',item===target?'rz-chip--changing':''].filter(Boolean).join(' ');
        // A locked race lists its runners, with nothing to change.
        if(locked) return <li key={item.id||item.wristband}><span className={look}>{item.wristband}</span></li>;
        return <li key={item.id||item.wristband}><button type="button" className={look} aria-pressed={item===target} aria-label={`${item.wristband}, ${kept?'kept for a lead to check. ':''}Change`}
          onMouseDown={event=>event.preventDefault()} onClick={()=>item===target?cancel():start(item)}>{item.wristband} <Icon name="pencil"/></button></li>;
      })}</ul>}
      {size.showing && !target && <Callout status message={`That's ${usualRunnersPerRace} runners, the usual number for a heat. Tap That's everyone, or add more if this heat really has more.`}
        actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={()=>{size.dismiss();onDone('runners');}}>That's everyone</button><button type="button" className="rz-btn" onClick={size.dismiss}>Add another runner</button></>}/>}
      {!locked && <DigitsField id="wristband" label={target?`New number for ${target.wristband}`:'Wristband number'} value={on.current} held={on.held} onRelease={on.fix} busy={on.checking || writes.sending} warn={on.held}
        onChange={digits=>{if(target) change.type(digits);else {entry.type(digits);size.dismiss();setSaid('');}}} onEnter={target?save:()=>void entry.next()} selectKey={target?String(target.id??target.wristband):undefined}
        hint={target?'Type the right number and tap Save, or Remove to take this runner off.':count>0?'Tap a number above to change it.':undefined}/>}
      {on.error && <Callout message={on.error}/>}
      {on.held && <Callout message={on.refused||on.pending.map(warning=>plainWristbandWarning(warning,Number(on.current),event.section)).join(' ')}
        actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={on.fix}>Fix number</button>{!on.refused && <button type="button" className="rz-btn" onClick={()=>void on.keep()}>Keep</button>}</>}/>}
      {target && asking && <Callout message={`${target.wristband} is already placed ${ordinal(place+1)} at the finish. Take them off anyway?`}
        actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={remove}>Take off</button><button type="button" className="rz-btn" onClick={()=>setAsking(false)}>Keep</button></>}/>}
    </main>
    {!locked && <DockedFooter>{target?<div className="rz-footer__trio">
      <button type="button" className="rz-btn" onClick={cancel}>Cancel</button>
      <button type="button" className="rz-btn rz-btn--remove" onClick={remove}>Remove</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!change.current || change.held || change.checking} onClick={save}>{change.checking?'Checking…':'Save'}</KeepFocus>
    </div>:<div className="rz-footer__pair">
      <button type="button" className="rz-btn" disabled={!count || writes.sending} onClick={()=>onDone('runners')}>That's everyone</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!entry.current || entry.held || entry.checking} onClick={()=>void entry.next()}>{entry.checking?'Checking…':'Next'}</KeepFocus>
    </div>}</DockedFooter>}
  </>;
}
/** A team short of four children runs short: it never blocks the race, and a lead checks it once saved. */
const RunsShort=({legs}:{legs:TeamLeg[]})=>filledLegs({legs})<4?<span className="rz-teamcard__note">Runs short · {filledLegs({legs})} of 4</span>:null;
/**
 * A relay heat's Start line: the teams in this heat as cards, each child in leg order with Here / Not yet and a grip,
 * and Take off while none of its children is here, then Still to run, each team with Add. Taps count from anyone as
 * the race stands (ADR 0002), so phones tapping at once all land and the last tap on a child wins. That's everyone
 * marks Runners done.
 */
function TeamStartLine({read,flow,onDone,locked,me}:StepProps) {
  const {race}=read,teams=read.teams||[],entries=(race.parts.runners.value||[]).filter(isTeamEntry),toRun=teams.filter(stillToRun);
  const here=entries.reduce((sum,entry)=>sum+entry.legs.filter(leg=>leg.here).length,0);
  const tap=(teamId:string,what:string,body:object={})=>void flow.write(`teams/${teamId}/${what}`,body);
  /** The team open in the teams sheet: its id for Edit, null for New team. */
  const [editing,setEditing]=useState<{teamId:string|null}|null>(null);
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · {teamCount(entries.length)} · {here} {here===1?'child':'children'} here</p>
        <h2 className="rz-prompt__q">Which teams are running?</h2></div>
      {flow.error && <Callout message={flow.error}/>}
      {entries.map(entry=><section key={entry.id} className="rz-teamcard" aria-label={`Team ${entry.team.number}`}>
        <div className="rz-teamcard__head"><h3 className="rz-teamcard__name">Team {entry.team.number}</h3><TeamNote read={read} me={me} teamId={entry.team.id} legs={entry.legs}/>
          {!locked && <span className="rz-teamcard__marks">
            <EditTeam number={entry.team.number} onEdit={()=>setEditing({teamId:entry.team.id})}/>
            {!entry.legs.some(leg=>leg.here) && <button type="button" className="rz-btn rz-btn--small" onClick={()=>tap(entry.team.id,'take-off')}>Take off</button>}
          </span>}</div>
        <TeamLegs read={read} flow={flow} team={entry.team} legs={entry.legs} grips={!locked && !editing && !changerOf(read,me,entry.team.id)}
          list="rz-attendance rz-attendance--one" row={leg=>leg.here?'':'is-absent'} content={(leg,place)=><>
            <span className="rz-attendance__who"><span className="rz-attendance__seed">{ordinal(place)} leg</span><span className="label">{leg.wristband??'–'}</span></span>
            {leg.wristband!==null && <button type="button" className={leg.here?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'} disabled={locked} aria-pressed={leg.here} aria-label={`${leg.wristband}: Here`}
              onClick={()=>tap(entry.team.id,'here',{leg:entry.legs.indexOf(leg),here:!leg.here})}>{leg.here?'Here':'Not yet'}</button>}
          </>}/>
      </section>)}
      {!locked && <>
        <h3 className="rz-section">Still to run</h3>
        {toRun.length?<ul className="rz-teamrows" aria-label="Still to run">{toRun.map(team=>{
          const changer=changingName(team);
          return <li key={team.id} className="rz-listrow"><span className="rz-listrow__main"><span className="rz-listrow__label">Team {team.number}</span>
            <span className="rz-listrow__meta">{team.legs.flatMap(leg=>leg.wristband===null?[]:[leg.wristband]).join(' · ')}</span>
            {changer?<span className="rz-teamcard__note">{changer} is changing this team</span>:<RunsShort legs={team.legs}/>}</span>
            {!changer && <button type="button" className="rz-btn rz-btn--small rz-btn--primary" aria-label={`Add Team ${team.number}`} onClick={()=>tap(team.id,'tick')}><Icon name="plus"/>Add</button>}
          </li>;
        })}</ul>:<p className="rz-empty">{teams.length?'Every team on the list is in a heat.':'No teams on the list yet.'}</p>}
        <button type="button" className="rz-btn rz-btn--block" onClick={()=>setEditing({teamId:null})}><Icon name="plus"/>New team</button>
      </>}
    </main>
    {!locked && <DockedFooter><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!entries.length || flow.busy} onClick={()=>onDone('runners')}>That's everyone</button></DockedFooter>}
    {editing && <CheckInTeamSheet read={read} teamId={editing.teamId} offer={flow.offer} onClose={()=>setEditing(null)}/>}
  </>;
}
/** Edit on a team card at check-in: the team's leg boxes open straight away, with no Change anyway. */
const EditTeam=({number,onEdit}:{number:number;onEdit:()=>void})=>
  <button type="button" className="rz-btn rz-btn--small" aria-label={`Edit Team ${number}`} onClick={onEdit}>Edit</button>;
/** Who else has the team open in Edit, for "Aisha Noor is changing this team", or null. */
function changerOf(read:RaceFlowRead,me:string,teamId:string) {
  const changing=read.teams?.find(item=>item.id===teamId)?.changing;
  return changing && changing.id!==me?changing.name:null;
}
/** Under a team card's name: who else has the team open ("Aisha Noor is changing this team"), else whether it runs short. */
function TeamNote({read,me,teamId,legs}:{read:RaceFlowRead;me:string;teamId:string;legs:TeamLeg[]}) {
  const changer=changerOf(read,me,teamId);
  return changer?<span className="rz-teamcard__note">{changer} is changing this team</span>:<RunsShort legs={legs}/>;
}
/**
 * A start-line team card's legs in leg order, an empty leg as "–". With `grips` each leg has one to drag it to another
 * leg ("Move 2071", "Move empty 4th leg"; arrow keys too), the labels following live. A drop is the team's Edit at
 * check-in with the legs in their new order: it saves the race and the team list together, each Here mark following
 * its child, and a drop on a team changed meanwhile comes back as changed, the phone showing the latest.
 */
function TeamLegs<Leg extends TeamLeg>({read,flow,team,legs,grips,list,row,content}:{read:RaceFlowRead;flow:StepProps['flow'];team:{id:string;number:number};legs:Leg[];grips:boolean;
  list:string;row:(leg:Leg)=>string;content:(leg:Leg,place:number)=>ReactNode}) {
  const [moved,setMoved]=useState<Leg[]|null>(null),shown=moved??legs;
  // An empty leg is known by how many empty legs come before it, so a team's one empty leg keeps its row as it moves.
  const rows=shown.map((leg,index)=>({leg,key:leg.wristband===null?`empty-${shown.slice(0,index).filter(other=>other.wristband===null).length}`:String(leg.wristband)}));
  const name=(item:typeof rows[number])=>item.leg.wristband===null?`empty ${ordinal(rows.indexOf(item)+1)} leg`:String(item.leg.wristband);
  async function drop(next:typeof rows) {
    const version=read.teams?.find(item=>item.id===team.id)?.version,wristbands=next.map(item=>item.leg.wristband);
    if(version===undefined) return;
    setMoved(next.map(item=>item.leg));
    // Every number is the one already set, so each warning it has stays kept.
    await flow.write(`/relays/${read.group.event.id}/teams/${team.id}`,{version,legs:wristbands,keptWarnings:wristbands.filter(number=>number!==null),raceId:read.race.id});
    setMoved(null);
  }
  if(!grips) return <ul className={list}>{rows.map((item,index)=><li key={item.key} className={row(item.leg)||undefined}>{content(item.leg,index+1)}</li>)}</ul>;
  return <SortableList label={`Team ${team.number} legs`} items={rows} itemKey={item=>item.key} itemName={name} disabled={moved!==null}
    look={{list:`${list} rz-teamgrips`,row:item=>row(item.leg),handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:what=>`Move ${what}`}}
    onReorder={next=>void drop(next)} renderItem={(item,place)=>content(item.leg,place)}/>;
}
type Mark='here'|'absent'|null;
/**
 * A final's start line: every finalist unmarked at first, each row with Here and Absent; tapping a lit mark again
 * unmarks it. Only those Here run it. That's everyone with someone unmarked asks before recording them Absent.
 */
function Attendance({read,flow,onDone,locked}:StepProps) {
  const {race}=read,final=race.final!,inRace=new Set((race.parts.runners.value||[]).map(entry=>entry.id));
  const markOf=(entry:typeof final.entries[number]):Mark=>inRace.has(entry.finalEntryId)?'here':entry.absent?'absent':null;
  const [asking,setAsking]=useState(false),ask=useRef<HTMLDivElement>(null);
  // The question appears under the list, so it is brought into view clear of the footer.
  useEffect(()=>{if(asking) ask.current?.scrollIntoView({block:'center'});},[asking]);
  const ids=(marks:Mark[],mark:Mark)=>final.entries.filter((_,index)=>marks[index]===mark).map(entry=>entry.finalEntryId);
  const send=(marks:Mark[])=>flow.write('absent',{raceId:race.id,version:race.parts.runners.version,here:ids(marks,'here'),absent:ids(marks,'absent')});
  const marks=final.entries.map(markOf),here=marks.filter(mark=>mark==='here').length;
  const unmarked=final.entries.filter((_,index)=>marks[index]===null);
  const tap=(index:number,mark:Mark)=>{setAsking(false);void send(marks.map((old,at)=>at===index?(old===mark?null:mark):old));};
  async function recordAbsent() {
    setAsking(false);
    if(typeof await send(marks.map(mark=>mark??'absent'))==='object') onDone('runners');
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">Final · {here} of {final.entries.length} here{unmarked.length?` · ${unmarked.length} not marked`:''}</p><h2 className="rz-prompt__q">Who is here?</h2></div>
      {flow.error && <Callout message={flow.error}/>}
      <ul className="rz-attendance" aria-label="Who is here">{final.entries.map((entry,index)=><li key={entry.finalEntryId} className={marks[index]==='absent'?'is-absent':undefined}>
        <span className="rz-attendance__who"><span className="rz-attendance__seed">{entry.calledUp?'Called up':entry.seed===null?'Added':`${ordinal(entry.seed)} seed`}</span><span className="label">{entry.wristband}</span></span>
        {(['here','absent'] as const).map(mark=><button key={mark} type="button" className={marks[index]===mark?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'} disabled={locked || flow.busy}
          aria-pressed={marks[index]===mark} aria-label={`${entry.wristband}: ${mark==='here'?'Here':'Absent'}`} onClick={()=>tap(index,mark)}>{mark==='here'?'Here':'Absent'}</button>)}
      </li>)}</ul>
      {asking && unmarked.length>0 && <div ref={ask}><Callout message={`${andList(unmarked.map(entry=>String(entry.wristband)))} ${unmarked.length===1?'is':'are'} not marked. Record them absent?`}
        actions={<><button type="button" className="rz-btn rz-btn--primary" disabled={flow.busy} onClick={()=>void recordAbsent()}>Record them absent</button><button type="button" className="rz-btn" onClick={()=>setAsking(false)}>Go back</button></>}/></div>}
    </main>
    {!locked && <DockedFooter><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!here || flow.busy} onClick={()=>unmarked.length?setAsking(true):onDone('runners')}>That's everyone</button></DockedFooter>}
  </>;
}
/** A finalist's place in the line-up: "1st seed", "Called up" or "Added". */
const seedLabel=(entry:NonNullable<RaceFlowRead['race']['final']>['entries'][number])=>entry.calledUp?'Called up':entry.seed===null?'Added':`${ordinal(entry.seed)} seed`;
/**
 * A relay final's start line: a card per seeded team (and any team a lead called up or added), each with its children
 * in leg order, a grip on each and Edit unless it is Absent, and Here / Absent for the whole team, neither lit at first;
 * tapping a lit mark again unmarks it. Only teams Here run it, as on a children's final. Taps
 * count from anyone as the race stands (ADR 0002). That's everyone with a team unmarked asks before recording it Absent.
 */
function TeamAttendance({read,flow,onDone,locked,me}:StepProps) {
  const {race}=read,final=race.final!,inRace=(race.parts.runners.value||[]).filter(isTeamEntry);
  const [asking,setAsking]=useState(false),ask=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(asking) ask.current?.scrollIntoView({block:'center'});},[asking]);
  // As on a children's final, a team in the race is Here; one out of it is Absent or not marked yet.
  const cards=final.entries.map(entry=>{
    const current=inRace.find(other=>other.id===entry.finalEntryId);
    const mark:Mark=current?'here':entry.absent?'absent':null;
    return {entry,team:entry.team!,legs:current?.legs??entry.legs??[],mark};
  });
  const [editing,setEditing]=useState<string|null>(null);
  const here=cards.filter(item=>item.mark==='here').length,unmarked=cards.filter(item=>item.mark===null);
  const send=(teamId:string,mark:Mark)=>flow.write(`teams/${teamId}/absent`,{mark});
  const tap=(item:typeof cards[number],mark:Mark)=>{setAsking(false);void send(item.team.id,item.mark===mark?null:mark);};
  async function recordAbsent() {
    setAsking(false);
    for(const item of unmarked) if(typeof await send(item.team.id,'absent')!=='object') return;
    onDone('runners');
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">Final · {here} of {teamCount(cards.length)} here{unmarked.length?` · ${unmarked.length} not marked`:''}</p>
        <h2 className="rz-prompt__q">Which teams are here?</h2></div>
      {flow.error && <Callout message={flow.error}/>}
      {cards.map(item=><section key={item.entry.finalEntryId} className={item.mark==='absent'?'rz-teamcard rz-teamcard--final is-absent':'rz-teamcard rz-teamcard--final'} aria-label={`Team ${item.team.number}`}>
        <div className="rz-teamcard__head"><h3 className="rz-teamcard__name"><span className="rz-teamcard__seed">{seedLabel(item.entry)} · </span>Team {item.team.number}</h3><TeamNote read={read} me={me} teamId={item.team.id} legs={item.legs}/>
          {/* Edit sits by the name, apart from Here / Absent, so it never reads as a third mark. */}
          {!locked && item.mark!=='absent' && <EditTeam number={item.team.number} onEdit={()=>setEditing(item.team.id)}/>}
          <span className="rz-teamcard__marks">{(['here','absent'] as const).map(mark=><button key={mark} type="button" className={item.mark===mark?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'}
            disabled={locked || flow.busy} aria-pressed={item.mark===mark} aria-label={`Team ${item.team.number}: ${mark==='here'?'Here':'Absent'}`} onClick={()=>tap(item,mark)}>{mark==='here'?'Here':'Absent'}</button>)}</span></div>
        <TeamLegs read={read} flow={flow} team={item.team} legs={item.legs} grips={!locked && item.mark!=='absent' && !editing && !changerOf(read,me,item.team.id)} list="rz-teamlegs" row={()=>''}
          content={(leg,place)=><><span className="rz-teamlegs__leg">{ordinal(place)} leg</span><span className="label">{leg.wristband??'–'}</span></>}/>
      </section>)}
      {asking && unmarked.length>0 && <div ref={ask}><Callout message={`${andList(unmarked.map(item=>`Team ${item.team.number}`))} ${unmarked.length===1?'is':'are'} not marked. Record them absent?`}
        actions={<><button type="button" className="rz-btn rz-btn--primary" disabled={flow.busy} onClick={()=>void recordAbsent()}>Record them absent</button><button type="button" className="rz-btn" onClick={()=>setAsking(false)}>Go back</button></>}/></div>}
    </main>
    {!locked && <DockedFooter><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!here || flow.busy} onClick={()=>unmarked.length?setAsking(true):onDone('runners')}>That's everyone</button></DockedFooter>}
    {editing && <CheckInTeamSheet read={read} teamId={editing} offer={flow.offer} onClose={()=>setEditing(null)}/>}
  </>;
}

type Unplaced='dnf'|'dnr';
/** The wristband of a team's 4th leg, the child the finish line sees cross, as it reads: "–" with no 4th leg. */
const fourthLeg=(entry:RaceEntry)=>isTeamEntry(entry)?String(entry.legs[3]?.wristband??'–'):'';
/** An entry as Check the order names it: a child's wristband, or "Team 3 · 2034" with its 4th leg; nothing for one no longer in the race. */
const nameOf=(entry:RaceEntry|undefined)=>!entry?'':isTeamEntry(entry)?`${entryName(entry)} · ${fourthLeg(entry)}`:entryName(entry);
/** An entry on the places board: a child's wristband, or "T3", so the board stays readable. */
const boardName=(entry:RaceEntry)=>isTeamEntry(entry)?`T${entry.team.number}`:entryName(entry);
/**
 * "+ Team not on the list" on a relay heat: the teams still to run, each with Add, never a typed wristband. A team
 * someone is changing can't be added until they finish.
 */
function TeamPicker({read,onAdd,onClose}:{read:RaceFlowRead;onAdd:(teamId:string)=>void;onClose:()=>void}) {
  const toRun=(read.teams||[]).filter(stillToRun);
  return <Sheet title="Team not on the list" onClose={onClose}>
    {toRun.length?<><p className="rz-sheet__text">Add the team whose 4th leg crossed the line. It takes the next place.</p>
      <ul className="rz-teamrows" aria-label="Still to run">{toRun.map(team=>{
        const changer=changingName(team);
        return <li key={team.id} className="rz-listrow"><span className="rz-listrow__main"><span className="rz-listrow__label">Team {team.number}</span>
          <span className="rz-listrow__meta">{team.legs.flatMap(leg=>leg.wristband===null?[]:[leg.wristband]).join(' · ')}</span>
          {changer?<span className="rz-teamcard__note">{changer} is changing this team</span>:<RunsShort legs={team.legs}/>}</span>
          {!changer && <button type="button" className="rz-btn rz-btn--small rz-btn--primary" aria-label={`Add Team ${team.number}`} onClick={()=>onAdd(team.id)}><Icon name="plus"/>Add</button>}
        </li>;
      })}</ul></>
      :<p className="rz-sheet__text">Every team is in a heat already.</p>}
  </Sheet>;
}
/**
 * Finish line: the PlacesBoard (one slot per runner, the current place gold) over a button per runner not yet
 * placed, in check-in order. Tapping one places it and moves on; tapping a placed slot makes it the place to fill
 * again: it stays outlined with its runner, who is a button again, until another runner takes it or Keep puts it back. When the last runner is placed, or on "Nobody else crossed the line", Check the order: drag to move, arrow
 * keys too, and each runner left is Did not finish or Didn't run. Save the order marks Finishing order done.
 */
export function FinishLine({read,flow,onDone,locked}:StepProps) {
  const {race,group}=read,event=group.event,relay=event.relay;
  const writes=useStepWrites<{order:string[];didNotFinish:string[];didNotRun:string[];added:number[];keptWarnings:number[];addedTeams:string[]}>(flow.write,'order','finish',race.id,race.parts.finish.version);
  const runners=race.parts.runners.value||[],byId=new Map(runners.map(runner=>[runner.id,runner]));
  const stored=race.parts.finish.value,shown=writes.pending||{order:stored?.order||[],didNotFinish:stored?.didNotFinish||[],didNotRun:[]};
  const {order,didNotFinish}=onlyRunners(shown,runners);
  const unplaced=runners.filter(runner=>!order.includes(runner.id) && !didNotFinish.includes(runner.id));
  // Everyone already placed (coming back to the step, or a lead opening the tab): straight to Check the order, never a flash of the next place.
  const [mode,setMode]=useState<'place'|'check'|'add'>(()=>runners.length && !unplaced.length && order.length?'check':'place');
  const [redo,setRedo]=useState<number|null>(null);
  const [leftAs,setLeftAs]=useState<Record<string,Unplaced>>({}),[asked,setAsked]=useState(false),[picking,setPicking]=useState(false);
  const size=useSizeWarning(`${race.id}:finish`),applies=usualSizeApplies(event) || race.kind==='final';
  const current=redo!==null && redo<order.length?redo:order.length;
  // A placed slot being changed keeps its runner, who is a button again until someone takes the slot.
  const changing=current<order.length?byId.get(order[current]):undefined;
  const choices=runners.filter(runner=>runner===changing || unplaced.includes(runner));
  const send=(next:{order:string[];didNotFinish?:string[];didNotRun?:string[]},added:number[]=[],kept:number[]=[],addedTeams:string[]=[])=>
    writes.send({order:next.order,didNotFinish:next.didNotFinish??didNotFinish,didNotRun:next.didNotRun??[],added,keptWarnings:kept,addedTeams});
  // A relay final's teams are its seeds, call-ups and a lead's additions, so it has no "+ Team not on the list".
  const canAdd=!relay || race.kind!=='final',addLabel=relay?'+ Team not on the list':'+ Runner not on the list';
  const openAdd=()=>{if(relay) {setRedo(null);setPicking(true);} else setMode('add');};
  const picker=picking && <TeamPicker read={read} onClose={()=>setPicking(false)} onAdd={teamId=>{setPicking(false);void send({order},[],[],[teamId]);}}/>;
  // The last runner placed: on to Check the order at once (its save goes on behind), before the screen paints, so the
  // placing screen never asks for a place past the last runner.
  useLayoutEffect(()=>{if(mode==='place' && runners.length && !unplaced.length && order.length) setMode('check');},[unplaced.length,order.length]);
  const entry=useWristbandEntry(event,race.id,runnersOf(runners).map(runner=>runner.wristband),async(wristband,kept)=>{
    const sent=await send({order},[wristband],kept?[wristband]:[]);
    if(typeof sent==='object') {setMode('place');if(applies && runners.length+1>usualRunnersPerRace) size.show();}
    return sent;
  });
  function place(runner:RaceEntry) {
    if(runner===changing) return setRedo(null);
    const next=[...order];
    if(current<order.length) next[current]=runner.id;else next.push(runner.id);
    setRedo(null);void send({order:next});
  }
  const slots=Math.max(runners.length,order.length);
  const sizeNote=size.showing && <Callout status message={race.kind==='final'?`Finals usually have ${usualRunnersPerRace} runners. Add another only if a lead has agreed.`:`That's more than ${usualRunnersPerRace} runners, the usual number for a heat. Carry on if this heat really has more.`}
    actions={<button type="button" className="rz-btn" onClick={size.dismiss}>Carry on</button>}/>;
  if(mode==='add') return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · {runnersText(runners.length)}</p><h2 className="rz-prompt__q">Runner not on the list: wristband number?</h2></div>
      {entry.error && <Callout message={entry.error}/>}
      <DigitsField id="added" label="Wristband number" value={entry.current} held={entry.held} onRelease={entry.fix} busy={entry.checking || writes.sending} warn={entry.held} onChange={entry.type} onEnter={()=>void entry.next()}/>
      {entry.held && <Callout message={entry.refused||entry.pending.map(warning=>plainWristbandWarning(warning,Number(entry.current),event.section)).join(' ')}
        actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={entry.fix}>Fix number</button>{!entry.refused && <button type="button" className="rz-btn" onClick={()=>void entry.keep()}>Keep</button>}</>}/>}
    </main>
    <DockedFooter><div className="rz-footer__pair">
      <button type="button" className="rz-btn" onClick={()=>{entry.fix();entry.type('');setMode('place');}}>Back</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!entry.current || entry.held || entry.checking} onClick={()=>void entry.next()}>Add runner</KeepFocus>
    </div></DockedFooter>
  </>;
  if(mode==='check') {
    const left=runners.filter(runner=>!order.includes(runner.id));
    // A runner already saved as Did not finish keeps that answer; anyone else left is asked, with nothing chosen for them.
    const as=(runner:RaceEntry):Unplaced|undefined=>leftAs[runner.id]??(didNotFinish.includes(runner.id)?'dnf':undefined);
    const unanswered=left.filter(runner=>!as(runner));
    async function save() {
      if(unanswered.length) {
        flushSync(()=>setAsked(true)); // the callout first, so the row scrolled to stays clear of the footer
        document.getElementById(`left-${unanswered[0].id}`)?.scrollIntoView({block:'center'});
        return;
      }
      const result=await send({order,didNotFinish:left.filter(runner=>as(runner)==='dnf').map(runner=>runner.id),didNotRun:left.filter(runner=>as(runner)==='dnr').map(runner=>runner.id)});
      if(typeof result==='object') onDone('positions');
    }
    const choice=(runner:RaceEntry,value:Unplaced,label:string)=><button type="button" className={as(runner)===value?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'}
      disabled={locked} aria-pressed={as(runner)===value} onClick={()=>setLeftAs({...leftAs,[runner.id]:value})}>{label}</button>;
    return <>
      <main className="rz-main">
        {/* The line above spans the screen, so it stays on one line at 360px; Back sits beside the question. */}
        <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · drag a handle to move a {relay?'team':'runner'}</p>
          <div className="rz-heading-row"><h2 className="rz-prompt__q">Check the order</h2>
            {!locked && <button type="button" className="rz-btn rz-btn--small" onClick={()=>setMode('place')}>Back</button>}</div></div>
        {flow.error && <Callout message={flow.error}/>}
        {sizeNote}
        {order.length>0 && <SortableList label="Finishing order" items={order} itemKey={id=>id} itemName={id=>nameOf(byId.get(id))} disabled={locked}
          look={{list:'rz-orderrows',row:'rz-orderrow',handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:name=>`Move ${name}`}}
          onReorder={next=>void send({order:next})}
          renderItem={(id,place)=><><span className="rz-orderrow__place">{ordinal(place)}</span><span className="rz-orderrow__num">{nameOf(byId.get(id))}</span></>}/>}
        <div className="rz-heading-row"><h3 className="rz-section">{left.length?`${left.length} not placed`:'Not placed'}</h3>{!locked && canAdd && <button type="button" className="rz-btn rz-btn--small" onClick={openAdd}>{addLabel}</button>}</div>
        {asked && unanswered.length>0 && <Callout message={`Say what happened to ${relay?entryCount(unanswered.length,true):runnersText(unanswered.length)} first.`}/>}
        {left.length?<ul className="rz-orderrows" aria-label="Not placed">{left.map(runner=><li key={runner.id} id={`left-${runner.id}`}>
          <div role="group" aria-label={entryName(runner)} className={relay?'rz-orderrow rz-orderrow--unplaced rz-orderrow--team':'rz-orderrow rz-orderrow--unplaced'}>
            <span className="rz-orderrow__num">{nameOf(runner)}</span>{choice(runner,'dnf','Did not finish')}{choice(runner,'dnr',"Didn't run")}
          </div></li>)}</ul>:<p className="rz-empty">{relay?'Every team has a place.':'Everyone has a place.'}</p>}
        {picker}
      </main>
      {!locked && <DockedFooter>
        <button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={writes.sending || (!order.length && !left.length)} onClick={()=>void save()}>Save the order</button>
      </DockedFooter>}
    </>;
  }
  return <>
    <main className="rz-main">
      <ol className="rz-places" aria-label={`Places: ${order.length} of ${slots} recorded`}>{Array.from({length:slots},(_,index)=>{
        const runner=index===current?undefined:byId.get(order[index]);
        if(index===current && changing) return <li key={index}><span className="rz-placeslot rz-placeslot--changing" aria-current="step" aria-label={`Changing ${ordinal(index+1)}: ${entryName(changing)}`}><span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">{boardName(changing)}</span></span></li>;
        if(index===current && unplaced.length) return <li key={index}><span className="rz-placeslot rz-placeslot--current" aria-current="step" aria-label={`${ordinal(index+1)} place: choosing now`}><span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">?</span></span></li>;
        if(runner) return <li key={index}><button type="button" className="rz-placeslot rz-placeslot--placed" disabled={locked} aria-label={`${ordinal(index+1)} place: ${entryName(runner)}. Change`} onClick={()=>setRedo(index)}>
          <span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">{boardName(runner)}</span></button></li>;
        return <li key={index}><span className="rz-placeslot rz-placeslot--empty" aria-label={`${ordinal(index+1)} place: empty`}><span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">–</span></span></li>;
      })}</ol>
      <div className="rz-heading-row"><div className="rz-prompt rz-prompt--compact">
        <p className="rz-prompt__meta">{changing?`Changing ${ordinal(current+1)}: ${entryName(changing)}`:relay?`${raceName(race)} · ${teamCount(runners.length)} · ${unplaced.length} to place · tap the team whose 4th leg crossed`
          :`${raceName(race)} · ${runnersText(runners.length)} · ${unplaced.length} to place`}</p>
        <h2 className="rz-prompt__q">{!runners.length?(relay?'No team is in this heat yet':'Nobody is checked in yet'):!choices.length?(relay?'Every team is placed':'Everyone is placed'):<>{relay?'Which team':'Who'} came <em>{ordinal(current+1)}?</em></>}</h2>
      </div>{changing && <button type="button" className="rz-btn rz-btn--small" onClick={()=>setRedo(null)}>Keep {entryName(changing)}</button>}</div>
      {flow.error && <Callout message={flow.error}/>}
      {sizeNote}
      {!runners.length && <p className="rz-empty">{relay?'Teams appear here as the start line adds them.':'Runners appear here as the start line checks them in. Add one who crossed the line but is not on the list.'}</p>}
      {/* A relay's team tiles, two to a row: "Team 5" over its 4th leg's wristband, the same size, so either can be matched. */}
      {!locked && choices.length>0 && relay && <ul className="rz-runners rz-runners--teams" aria-label="Teams not yet placed">{choices.map(runner=><li key={runner.id}>
        <button type="button" className="rz-runner rz-runner--team" aria-label={`${entryName(runner)}, ${fourthLeg(runner)==='–'?'no 4th leg':`4th leg ${fourthLeg(runner)}`}, came ${ordinal(current+1)}`} onClick={()=>place(runner)}>
          <span>{entryName(runner)}</span><span>{fourthLeg(runner)}</span></button>
      </li>)}</ul>}
      {/* A heat of more than 9 gets smaller buttons, so all 12 of a full heat fit above the footer. */}
      {!locked && choices.length>0 && !relay && <ul className={runners.length>9?'rz-runners rz-runners--compact':'rz-runners'} aria-label="Runners not yet placed">{choices.map(runner=><li key={runner.id}>
        <button type="button" className="rz-runner" aria-label={`${entryName(runner)} came ${ordinal(current+1)}`} onClick={()=>place(runner)}>{entryName(runner)}</button>
      </li>)}</ul>}
      {picker}
    </main>
    {!locked && <DockedFooter>
      <button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>setMode('check')}>{relay?'No other team crossed the line':'Nobody else crossed the line'}</button>
      {canAdd && <button type="button" className="rz-btn rz-btn--block" onClick={openAdd}>{addLabel}</button>}
    </DockedFooter>}
  </>;
}

/**
 * Timer: one slot per place (each finisher once the order is saved, before that each runner), the current one gold; tap any
 * to retype it. Digits only: the app puts the point in. A time faster than an earlier place waits for Fix time or
 * Keep, its warning just above the time box and its reason in the footer. The last place's time, or No more finishers,
 * marks Times done. Times never wait for the finish line.
 */
export function Timer({read,flow,onDone,locked}:StepProps) {
  const {race}=read,status=read.steps.times!,order=read.steps.positions!;
  const writes=useStepWrites<{places:number[];keptWrong:number[]}>(flow.write,'times','times',race.id,race.parts.times.version);
  const [typed,setTyped]=useState(''),[retype,setRetype]=useState<number|null>(null);
  const stored=race.parts.times.value,places=writes.pending?.places||(stored?.places||[]).filter((time):time is number=>time!==null);
  const keptWrong=writes.pending?.keptWrong||stored?.keptWrong||[],wrong=wrongTimesByPlace(places);
  const unkept=[...wrong.values()].find(item=>!keptWrong.includes(item.index));
  const slots=Math.max(status.expected||0,places.length);
  const held=retype===null && !!unkept,target=held?unkept!.index:retype??places.length,full=target>=slots;
  const digits=held?digitsForTime(places[target]):typed;
  const fix=()=>{setRetype(unkept!.index);setTyped(digits);};
  async function next() {
    const time=parseTimeDigits(typed);
    if(time===null || full) return;
    const updated=[...places];updated[target]=time;
    const stillWrong=wrongTimesByPlace(updated);
    setTyped('');setRetype(null);
    const sent=await writes.send({places:updated,keptWrong:keptWrong.filter(index=>index!==target && stillWrong.has(index))});
    // The last place's time marks Times done, unless it is one the timer must look at again.
    if(typeof sent==='object' && updated.length>=slots && !stillWrong.size && retype===null) onDone('times');
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact">
        <p className="rz-prompt__meta">{raceName(race)} · {read.group.event.relay?'one time per team, to the 4th leg crossing':order.state==='done'?finishedWords(order):runnersText(race.parts.runners.value?.length||0)}</p>
        <h2 className="rz-prompt__q">{full?'Every place has a time':`${ordinal(target+1)} place time?`}</h2>
      </div>
      {flow.error && <Callout message={flow.error}/>}
      {/* A heat of more than 9 gets the compact grid, 4 across, so a warning and the time box (without its hint, which the warning
        replaces) stay above the footer, even at 360px. */}
      {slots>0?<ol className={slots>9?'rz-slots rz-slots--compact':'rz-slots'} aria-label="Place times">{Array.from({length:slots},(_,index)=>{
        const time=places[index],isWrong=wrong.has(index);
        const kind=isWrong?'rz-slot rz-slot--warn':index===target && !full?'rz-slot rz-slot--current':time===undefined?'rz-slot rz-slot--empty':'rz-slot';
        return <li key={index}><button type="button" className={kind} aria-current={index===target && !full?'step':undefined} disabled={locked || held || (time===undefined && index!==places.length)}
          aria-label={`${ordinal(index+1)} place: ${time===undefined?'no time yet':formatTime(time)}${isWrong?`, ${wrong.get(index)!.reason}`:''}`}
          onClick={()=>{setRetype(time===undefined?null:index);setTyped(time===undefined?'':digitsForTime(time));}}>
          <span className="rz-slot__ord">{ordinal(index+1)}{isWrong && <Icon name="warning" className="rz-slot__flag"/>}</span><span className="rz-slot__time">{time===undefined?'–':formatTime(time)}</span>
          {isWrong && <span className="rz-slot__note">{keptWrong.includes(index)?'Kept':wrong.get(index)!.reason}</span>}
        </button></li>;
      })}</ol>:<p className="rz-empty">Places appear here once {read.group.event.relay?'teams are in the heat':'runners are checked in'}.</p>}
      {held && <Callout message={`${wrongTimesBanner([unkept!])} Fix it, or keep it if the timer really shows that.`}
        actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={fix}>Fix time</button>
          <button type="button" className="rz-btn" onClick={()=>void writes.send({places,keptWrong:[...keptWrong,unkept!.index]})}>Keep</button></>}/>}
      {!locked && !full && slots>0 && <DigitsField id="place-time" label="Place time" value={digits} held={held} onRelease={fix} warn={held} onChange={setTyped} onEnter={()=>void next()}
        selectKey={`${target}:${retype===null?'next':'retype'}`} hint={held?undefined:digits?<>Shows as <strong>{formatTimeDigits(digits)}</strong>. Type digits only.</>:'Type digits only: 1234 shows as 12.34.'}/>}
    </main>
    {!locked && <DockedFooter>{held && <p className="rz-footer__reason">Fix or keep the {ordinal(target+1)} place time first</p>}<div className="rz-footer__trio">
      <KeepFocus className="rz-btn" disabled={target===0 && retype===null && !places.length} onClick={()=>{const back=Math.max(0,(retype??places.length)-1);if(places[back]!==undefined) {setRetype(back);setTyped(digitsForTime(places[back]));}}}>Back</KeepFocus>
      <button type="button" className="rz-btn" disabled={!places.length || held || writes.sending} onClick={()=>onDone('times')}>No more finishers</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || held || full} onClick={()=>void next()}>Next</KeepFocus>
    </div></DockedFooter>}
  </>;
}
