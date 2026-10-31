import { useEffect,useRef,useState,type ReactNode } from 'react';
import { seedLabel } from '../../shared/finals.js';
import { ordinal } from '../../shared/ordinal.js';
import { andList,changedLine,raceName,type RaceFlowRead } from '../../shared/race-flow.js';
import { isTeamEntry } from '../../shared/races.js';
import { changerOf,changingLine,childCount,legRefusal,legsText,legWarnings,runsShortLine,stillToRun,teamCount,teamListOf,type RelayTeam,type TeamLeg } from '../../shared/teams.js';
import { SortableList } from '../flow/SortableList.js';
import { Callout,DockedFooter,Icon,Sheet } from './parts.js';
import { DigitsField,KeepFocus,type StepProps } from './Steps.js';
import { CheckInTeamSheet } from './TeamSheet.js';
import { useWrites } from './writes.js';

/** A final's mark for a finalist: Here, Absent, or not marked yet. */
export type Mark='here'|'absent'|null;
/** Who else has a team open in Edit, for "Aisha Noor is changing this team", or null: never this phone itself. */
const changerIn=(read:RaceFlowRead,me:string,teamId:string)=>{const team=read.teams?.find(item=>item.id===teamId);return team?changerOf(team,me):null;};
/** Under a team's name: who else has it open ("Aisha Noor is changing this team"), else whether it runs short. */
function TeamNote({changer,legs}:{changer:string|null;legs:readonly TeamLeg[]}) {
  const line=changer?changingLine(changer):runsShortLine({legs});
  return line?<span className="rz-teamcard__note">{line}</span>:null;
}
/** Edit on a team card at check-in: the team's leg boxes open straight away, with no Change anyway. */
const EditTeam=({number,onEdit}:{number:number;onEdit:()=>void})=>
  <button type="button" className="rz-btn rz-btn--small" aria-label={`Edit Team ${number}`} onClick={onEdit}>Edit</button>;
/**
 * A team still to run, at a heat's Start line and in "+ Team not on the list": "Team 3", its four children, and Add,
 * which a team someone else is changing doesn't have until they finish.
 */
function TeamRow({team,me,onAdd}:{team:RelayTeam;me:string;onAdd:()=>void}) {
  const changer=changerOf(team,me);
  return <li className="rz-listrow"><span className="rz-listrow__main"><span className="rz-listrow__label">Team {team.number}</span>
    <span className="rz-listrow__meta">{legsText(team.legs)}</span><TeamNote changer={changer} legs={team.legs}/></span>
    {!changer && <button type="button" className="rz-btn rz-btn--small rz-btn--primary" aria-label={`Add Team ${team.number}`} onClick={onAdd}><Icon name="plus"/>Add</button>}
  </li>;
}
/** A leg as the start line checks it: refused (Fix number only), or a warning (Fix number or Keep). */
type Held={refused:string}|{warning:string};
/**
 * A relay heat's Start line, like individual check-in: one number box asks "Team 5 · 2nd leg: wristband number?", Next
 * leg by leg, and the 4th leg's Next (or "Save Team 5 with 3") saves the team, every typed child checked in. A team
 * part-typed lives only on this phone; its number is set at save, so if another phone saved that number first it
 * takes the next, and the status line names it. Then Still to run, each team with Add, and the teams in this heat as
 * four leg chips each with a grip, and Take off: tapping a chip opens the box on that leg, its Save checked against
 * the team's version. Taps count from anyone as the race stands (ADR 0002). That's everyone marks Runners done.
 */
export function TeamStartLine({read,flow,onDone,locked,me}:StepProps) {
  const {race,group}=read,teams=read.teams||[],entries=(race.parts.runners.value||[]).filter(isTeamEntry),toRun=teams.filter(stillToRun);
  const relay=teamListOf({...group,teams}),relays=read.relays||[],number=group.nextTeam??1;
  const here=entries.reduce((sum,entry)=>sum+entry.legs.filter(leg=>leg.here).length,0);
  const tap=(teamId:string,what:string,body:object={})=>void flow.write(`teams/${teamId}/${what}`,body);
  const saves=useWrites<RaceFlowRead>(flow.offer);
  const [legs,setLegs]=useState<number[]>([]),[kept,setKept]=useState<number[]>([]),[typed,setTyped]=useState('');
  const [held,setHeld]=useState<Held|null>(null),[said,setSaid]=useState(''),[fresh,setFresh]=useState(0);
  /** The leg being changed by its chip, and the team's version when the chip was tapped. */
  const [changing,setChanging]=useState<{teamId:string;leg:number;version:number}|null>(null);
  const entry=changing && entries.find(item=>item.team.id===changing.teamId),change=changing && entry?{...changing,entry}:null;
  function problem(teamId:string|null,wristbands:Array<number|null>,index:number):Held|null {
    const refused=legRefusal(relay.teams,teamId,wristbands,index);
    if(refused) return {refused};
    const warnings=legWarnings(wristbands[index]!,relay,relays);
    return warnings.length?{warning:warnings.map(warning=>warning.message).join(' ')}:null;
  }
  const fix=()=>setHeld(null);
  function cancel() {setChanging(null);setTyped('');setHeld(null);saves.clearChanged();}
  function start(teamId:string,leg:number,wristband:number|null) {
    const version=teams.find(team=>team.id===teamId)?.version;
    if(version===undefined) return;
    saves.clearChanged();setHeld(null);setSaid('');setChanging({teamId,leg,version});setTyped(wristband===null?'':String(wristband));
  }
  /** The team typed so far saved into this heat: the number it got comes back with the race. */
  async function save(typedLegs:number[],keptWarnings:number[]) {
    const wristbands=[0,1,2,3].map(index=>typedLegs[index]??null);
    const sent=await saves.send(`relays/${group.event.id}/teams`,{legs:wristbands,keptWarnings,joinRaceId:race.id});
    if(typeof sent!=='object') return;
    const saved=(sent.race.parts.runners.value||[]).filter(isTeamEntry).find(item=>item.legs.every((leg,index)=>leg.wristband===wristbands[index]));
    setSaid(`Team ${saved?.team.number??number} checked in: ${typedLegs.join(', ')}`);setLegs([]);setKept([]);setTyped('');
  }
  async function next(keep=false) {
    if(!typed || saves.busy) return;
    const value=Number(typed);setSaid('');
    if(change) {
      const wristbands=change.entry.legs.map(leg=>leg.wristband);
      if(wristbands[change.leg]===value) {cancel();return;}
      wristbands[change.leg]=value;
      const found=problem(change.teamId,wristbands,change.leg);
      if(found && !keep) {setHeld(found);return;}
      setHeld(null);
      // Every other number is the one already set, so each warning it has stays kept.
      const others=wristbands.filter((wristband,index):wristband is number=>wristband!==null && index!==change.leg);
      const sent=await saves.send(`relays/${group.event.id}/teams/${change.teamId}`,{version:change.version,legs:wristbands,keptWarnings:keep?[...others,value]:others,raceId:race.id});
      if(typeof sent==='object') {cancel();setSaid(`Team ${change.entry.team.number}: ${ordinal(change.leg+1)} leg changed to ${value}`);}
      return;
    }
    const found=problem(null,[...legs,value],legs.length);
    if(found && !keep) {setHeld(found);return;}
    setHeld(null);
    const typedLegs=[...legs,value],keptNow=keep?[...kept,value]:kept;
    if(typedLegs.length<4) {setLegs(typedLegs);setKept(keptNow);setTyped('');return;}
    await save(typedLegs,keptNow);
  }
  /** Show latest after a change refused as changed: the box takes the leg as it now stands, at the team's new version. */
  function latest() {
    if(!change) return;
    saves.clearChanged();setHeld(null);
    const wristband=change.entry.legs[change.leg]?.wristband??null;
    setChanging({teamId:change.teamId,leg:change.leg,version:teams.find(team=>team.id===change.teamId)?.version??change.version});
    setTyped(wristband===null?'':String(wristband));setFresh(fresh+1);
  }
  const chip=(teamId:string,teamNumber:number)=>(leg:TeamLeg,place:number,index:number)=>{
    const inner=<><span className="rz-legchip__ord">{ordinal(place)}</span>{leg.wristband??'–'}</>,on=change?.teamId===teamId && change.leg===index;
    if(locked) return <span className="rz-legchip">{inner}</span>;
    // Pressing a chip keeps focus in the box, so the number pad stays open.
    return <button type="button" className={on?'rz-legchip rz-legchip--changing':'rz-legchip'} aria-pressed={on} aria-label={`Team ${teamNumber} ${ordinal(place)} leg: ${leg.wristband??'empty'}. Change`}
      onMouseDown={event=>event.preventDefault()} onClick={()=>on?cancel():start(teamId,index,leg.wristband)}>{inner}</button>;
  };
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact">
        {locked?<><p className="rz-prompt__meta">{raceName(race)}</p><h2 className="rz-prompt__q">{teamCount(entries.length)} checked in</h2></>
          :<><p className="rz-prompt__meta">{raceName(race)} · {teamCount(entries.length)} · {childCount(here)} here</p>
          <h2 className="rz-prompt__q">{change?`Change Team ${change.entry.team.number}'s ${ordinal(change.leg+1)} leg`:`Team ${number} · ${ordinal(legs.length+1)} leg: wristband number?`}</h2></>}
      </div>
      {flow.error && <Callout message={flow.error}/>}
      {saves.error && <Callout message={saves.error}/>}
      {saves.changed && <Callout status message={`${changedLine(saves.changed.by)}.`} actions={<button type="button" className="rz-btn rz-btn--primary" onClick={latest}>Show latest</button>}/>}
      {said && !change && <p className="rz-note" role="status">{said}</p>}
      {!locked && !change && <section className="rz-legrow rz-legrow--typing" aria-label={`Team ${number}, being typed`}>
        <div className="rz-legrow__head"><h3 className="rz-teamcard__name">Team {number}</h3><span className="rz-legrow__count">{legs.length} of 4</span></div>
        <ol className="rz-legchips">{[0,1,2,3].map(index=><li key={index}><span className={index===legs.length?'rz-legchip rz-legchip--next':index<legs.length?'rz-legchip':'rz-legchip rz-legchip--empty'}>
          <span className="rz-legchip__ord">{ordinal(index+1)}</span>{index<legs.length?legs[index]:index===legs.length?typed||'?':'–'}</span></li>)}</ol>
      </section>}
      {!locked && <DigitsField id="leg" label={change?'New number':`${ordinal(legs.length+1)} leg wristband`} value={typed} held={!!held} onRelease={fix} busy={saves.busy} warn={!!held}
        onChange={digits=>{setTyped(digits);setSaid('');}} onEnter={()=>void next()} selectKey={change?`${change.teamId}:${change.leg}:${fresh}`:undefined}
        hint={change?'Type the right number and tap Save.':`Type each child in running order, 1st leg first.${entries.length?' Tap a leg below to change it.':''}`}/>}
      {held && <Callout message={'refused' in held?held.refused:held.warning}
        actions={<>{'warning' in held && <button type="button" className="rz-btn" onClick={()=>void next(true)}>Keep</button>}<button type="button" className="rz-btn rz-btn--primary" onClick={fix}>Fix number</button></>}/>}
      {!locked && !change && legs.length>0 && !typed && <KeepFocus className="rz-btn rz-btn--small rz-legrow__short" disabled={saves.busy} onClick={()=>void save(legs,kept)}>Save Team {number} with {legs.length}</KeepFocus>}
      {!locked && toRun.length>0 && <>
        <h3 className="rz-section">Still to run</h3>
        <ul className="rz-teamrows" aria-label="Still to run">{toRun.map(team=><TeamRow key={team.id} team={team} me={me} onAdd={()=>tap(team.id,'tick')}/>)}</ul>
      </>}
      {!locked && entries.length>0 && <h3 className="rz-section">In this heat</h3>}
      {entries.map(item=>{
        const changer=changerIn(read,me,item.team.id);
        return <section key={item.id} className="rz-legrow" aria-label={`Team ${item.team.number}`}>
          <div className="rz-legrow__head"><div className="rz-teamcard__title"><h3 className="rz-teamcard__name">Team {item.team.number}</h3><TeamNote changer={changer} legs={item.legs}/></div>
            {!locked && <button type="button" className="rz-btn rz-btn--small" onClick={()=>tap(item.team.id,'take-off')}>Take off</button>}</div>
          <TeamLegs read={read} flow={flow} team={item.team} legs={item.legs} grips={!locked && !change && !changer} across list="rz-legchips" row={()=>''} content={chip(item.team.id,item.team.number)}/>
        </section>;
      })}
    </main>
    {!locked && <DockedFooter>{change?<div className="rz-footer__pair">
      <button type="button" className="rz-btn" onClick={cancel}>Cancel</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || !!held || saves.busy} onClick={()=>void next()}>Save</KeepFocus>
    </div>:<div className="rz-footer__pair">
      <button type="button" className="rz-btn" disabled={!entries.length || legs.length>0 || flow.busy} onClick={()=>onDone('runners')}>That's everyone</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || !!held || saves.busy} onClick={()=>void next()}>{legs.length===3?`Save Team ${number}`:'Next'}</KeepFocus>
    </div>}</DockedFooter>}
  </>;
}
/**
 * A start-line team card's legs in leg order, an empty leg as "–". With `grips` each leg has one to drag it to another
 * leg ("Move 2071", "Move empty 4th leg"; arrow keys too), the labels following live. A drop is the team's Edit at
 * check-in with the legs in their new order: it saves the race and the team list together, every child still checked
 * in, and a drop on a team changed meanwhile comes back as changed, the phone showing the latest. `across` lays the
 * legs side by side (a heat's leg chips); `content` also gets the leg's index as saved.
 */
function TeamLegs<Leg extends TeamLeg>({read,flow,team,legs,grips,across=false,list,row,content}:{read:RaceFlowRead;flow:StepProps['flow'];team:{id:string;number:number};legs:Leg[];grips:boolean;
  across?:boolean;list:string;row:(leg:Leg)=>string;content:(leg:Leg,place:number,index:number)=>ReactNode}) {
  const [moved,setMoved]=useState<Leg[]|null>(null),shown=moved??legs;
  // An empty leg is known by how many empty legs come before it, so a team's one empty leg keeps its row as it moves.
  const rows=shown.map((leg,index)=>({leg,key:leg.wristband===null?`empty-${shown.slice(0,index).filter(other=>other.wristband===null).length}`:String(leg.wristband)}));
  const name=(item:typeof rows[number])=>item.leg.wristband===null?`empty ${ordinal(rows.indexOf(item)+1)} leg`:String(item.leg.wristband);
  async function drop(next:typeof rows) {
    const version=read.teams?.find(item=>item.id===team.id)?.version,wristbands=next.map(item=>item.leg.wristband);
    if(version===undefined) return;
    setMoved(next.map(item=>item.leg));
    // Every number is the one already set, so each warning it has stays kept.
    await flow.writeTeam(read.group.event.id,team.id,{version,legs:wristbands,keptWarnings:wristbands.filter(number=>number!==null),raceId:read.race.id});
    setMoved(null);
  }
  if(!grips) return <ul className={list}>{rows.map((item,index)=><li key={item.key} className={row(item.leg)||undefined}>{content(item.leg,index+1,legs.indexOf(item.leg))}</li>)}</ul>;
  return <SortableList label={`Team ${team.number} legs`} items={rows} itemKey={item=>item.key} itemName={name} disabled={moved!==null} across={across}
    look={{list:`${list} rz-teamgrips`,row:item=>row(item.leg),handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:what=>`Move ${what}`}}
    onReorder={next=>void drop(next)} renderItem={(item,place)=>content(item.leg,place,legs.indexOf(item.leg))}/>;
}
/**
 * A relay final's start line: a card per seeded team (and any team a lead called up or added), each with its children
 * in leg order, a grip on each and Edit unless it is Absent, and Here / Absent for the whole team, neither lit at first;
 * tapping a lit mark again unmarks it. Only teams Here run it, as on a children's final. Taps count from anyone as the
 * race stands (ADR 0002). That's everyone with a team unmarked asks before recording it Absent.
 */
export function TeamAttendance({read,flow,onDone,locked,me}:StepProps) {
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
      {cards.map(item=>{
        const changer=changerIn(read,me,item.team.id);
        return <section key={item.entry.finalEntryId} className={item.mark==='absent'?'rz-teamcard rz-teamcard--final is-absent':'rz-teamcard rz-teamcard--final'} aria-label={`Team ${item.team.number}`}>
          <div className="rz-teamcard__head"><div className="rz-teamcard__title"><h3 className="rz-teamcard__name"><span className="rz-teamcard__seed">{seedLabel(item.entry)} · </span>Team {item.team.number}</h3><TeamNote changer={changer} legs={item.legs}/></div>
            {/* Edit sits by the name, apart from Here / Absent, so it never reads as a third mark. */}
            {!locked && item.mark!=='absent' && <EditTeam number={item.team.number} onEdit={()=>setEditing(item.team.id)}/>}
            <span className="rz-teamcard__marks">{(['here','absent'] as const).map(mark=><button key={mark} type="button" className={item.mark===mark?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'}
              disabled={locked || flow.busy} aria-pressed={item.mark===mark} aria-label={`Team ${item.team.number}: ${mark==='here'?'Here':'Absent'}`} onClick={()=>tap(item,mark)}>{mark==='here'?'Here':'Absent'}</button>)}</span></div>
          <TeamLegs read={read} flow={flow} team={item.team} legs={item.legs} grips={!locked && item.mark!=='absent' && !editing && !changer} list="rz-teamlegs" row={()=>''}
            content={(leg,place)=><><span className="rz-teamlegs__leg">{ordinal(place)} leg</span><span className="label">{leg.wristband??'–'}</span></>}/>
        </section>;
      })}
      {asking && unmarked.length>0 && <div ref={ask}><Callout message={`${andList(unmarked.map(item=>`Team ${item.team.number}`))} ${unmarked.length===1?'is':'are'} not marked. Record them absent?`}
        actions={<><button type="button" className="rz-btn" onClick={()=>setAsking(false)}>Go back</button><button type="button" className="rz-btn rz-btn--primary" disabled={flow.busy} onClick={()=>void recordAbsent()}>Record them absent</button></>}/></div>}
    </main>
    {!locked && <DockedFooter><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!here || flow.busy} onClick={()=>unmarked.length?setAsking(true):onDone('runners')}>That's everyone</button></DockedFooter>}
    {editing && <CheckInTeamSheet read={read} teamId={editing} offer={flow.offer} onClose={()=>setEditing(null)}/>}
  </>;
}
/**
 * "+ Team not on the list" on a relay heat: the teams still to run, each with Add, never a typed wristband. A team
 * someone else is changing can't be added until they finish.
 */
export function TeamPicker({read,me,onAdd,onClose}:{read:RaceFlowRead;me:string;onAdd:(teamId:string)=>void;onClose:()=>void}) {
  const toRun=(read.teams||[]).filter(stillToRun);
  return <Sheet title="Team not on the list" onClose={onClose}>
    {toRun.length?<><p className="rz-sheet__text">Add the team whose 4th leg crossed the line. It takes the next place.</p>
      <ul className="rz-teamrows" aria-label="Still to run">{toRun.map(team=><TeamRow key={team.id} team={team} me={me} onAdd={()=>onAdd(team.id)}/>)}</ul></>
      :<p className="rz-sheet__text">Every team is in a heat already.</p>}
  </Sheet>;
}
