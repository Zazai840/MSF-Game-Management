import { useEffect,useRef,useState,type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { finalMark,seedLabel,type FinalMark } from '../../shared/finals.js';
import { ordinal } from '../../shared/ordinal.js';
import { andList,changedLine,doneButtons,placedAsk,raceName,type RaceFlowRead } from '../../shared/race-flow.js';
import { isTeamEntry } from '../../shared/races.js';
import { childCount,legCheck,legsText,runsShortLine,stillToRun,teamCount,teamListOf,type RelayTeam,type TeamLeg } from '../../shared/teams.js';
import { SortableList } from '../flow/SortableList.js';
import { Callout,DockedFooter,Icon,Sheet } from './parts.js';
import { CallUp,DigitsField,KeepFocus,type StepProps } from './Steps.js';
import { useWrites } from './writes.js';

/** A final's mark for a finalist: Here, Absent, or not marked yet. */
export type Mark=FinalMark;
/** Under a team's name, when it runs short: "Runs short · 3 of 4". */
export function TeamNote({legs}:{legs:ReadonlyArray<{wristband:number|null}>}) {
  const line=runsShortLine({legs});
  return line?<span className="rz-teamcard__note">{line}</span>:null;
}
/** A team still to run, at a heat's Start line and in "+ Team not on the list": "Team 3", its four children, and Add. */
export function TeamRow({team,onAdd}:{team:Pick<RelayTeam,'number'|'legs'>;onAdd:()=>void}) {
  return <li className="rz-listrow"><span className="rz-listrow__main"><span className="rz-listrow__label">Team {team.number}</span>
    <span className="rz-listrow__meta">{legsText(team.legs)}</span><TeamNote legs={team.legs}/></span>
    <button type="button" className="rz-btn rz-btn--small rz-btn--primary" aria-label={`Add Team ${team.number}`} onClick={onAdd}><Icon name="plus"/>Add</button>
  </li>;
}
/** A leg as the start line checks it: refused (Fix number only), or a warning (Fix number or Keep). */
export type Held={refused:string}|{warning:string};
/** A held leg under the box: refused with Fix number only, or warned with Keep and Fix number. */
export const HeldCallout=({held,onKeep,onFix}:{held:Held;onKeep:()=>void;onFix:()=>void})=><Callout message={'refused' in held?held.refused:held.warning}
  actions={<>{'warning' in held && <button type="button" className="rz-btn" onClick={onKeep}>Keep</button>}<button type="button" className="rz-btn rz-btn--primary" onClick={onFix}>Fix number</button></>}/>;
/**
 * The start line's number box, on a heat or a final, and changing one leg by its chip: tapping a chip opens the box on
 * that leg, and its Save is checked against the team's version, with Show latest when someone changed it first.
 * `legsOf` finds a team as this start line shows it.
 */
function useLegBox(read:RaceFlowRead,flow:StepProps['flow'],legsOf:(teamId:string)=>{team:{number:number};legs:readonly TeamLeg[]}|undefined) {
  const teams=read.teams||[],relay=teamListOf({...read.group,teams}),relays=read.relays||[];
  const saves=useWrites<RaceFlowRead>(flow.offer);
  const [typed,setTyped]=useState(''),[held,setHeld]=useState<Held|null>(null),[said,setSaid]=useState(''),[fresh,setFresh]=useState(0);
  /** The leg being changed by its chip, and the team's version when the chip was tapped. */
  const [changing,setChanging]=useState<{teamId:string;leg:number;version:number}|null>(null);
  const entry=changing && legsOf(changing.teamId),change=changing && entry?{...changing,entry}:null;
  function problem(teamId:string|null,wristbands:Array<number|null>,index:number):Held|null {
    const {refusal,warnings}=legCheck(relay,relays,teamId,wristbands,index,read.race.id);
    return refusal?{refused:refusal}:warnings.length?{warning:warnings.map(warning=>warning.message).join(' ')}:null;
  }
  const fix=()=>setHeld(null);
  function cancel() {setChanging(null);setTyped('');setHeld(null);saves.clearChanged();}
  function start(teamId:string,leg:number,wristband:number|null) {
    const version=teams.find(team=>team.id===teamId)?.version;
    if(version===undefined) return;
    saves.clearChanged();setHeld(null);setSaid('');setChanging({teamId,leg,version});setTyped(wristband===null?'':String(wristband));
  }
  /** Save on a leg being changed: the team's legs with this one changed, against the version its chip was tapped at. */
  async function saveChange(keep=false) {
    if(!change || !typed || saves.busy) return;
    const value=Number(typed),wristbands=change.entry.legs.map(leg=>leg.wristband);setSaid('');
    if(wristbands[change.leg]===value) {cancel();return;}
    wristbands[change.leg]=value;
    const found=problem(change.teamId,wristbands,change.leg);
    if(found && !keep) {setHeld(found);return;}
    setHeld(null);
    // Every other number is the one already set, so each warning it has stays kept.
    const others=wristbands.filter((wristband,index):wristband is number=>wristband!==null && index!==change.leg);
    const sent=await saves.send(`relays/${read.group.event.id}/teams/${change.teamId}`,{version:change.version,legs:wristbands,keptWarnings:keep?[...others,value]:others,raceId:read.race.id});
    if(typeof sent==='object') {cancel();setSaid(`Team ${change.entry.team.number}: ${ordinal(change.leg+1)} leg changed to ${value}`);}
  }
  /** Show latest after a change refused as changed: the box takes the leg as it now stands, at the team's new version. */
  function latest() {
    if(!change) return;
    saves.clearChanged();setHeld(null);
    const wristband=change.entry.legs[change.leg]?.wristband??null;
    setChanging({teamId:change.teamId,leg:change.leg,version:teams.find(team=>team.id===change.teamId)?.version??change.version});
    setTyped(wristband===null?'':String(wristband));setFresh(fresh+1);
  }
  /** A team's leg chip: a button that opens the box on that leg, or plain where it can't be changed. */
  const chip=(teamId:string,teamNumber:number,tappable:boolean)=>(leg:TeamLeg,place:number,index:number)=>{
    const inner=<><span className="rz-legchip__ord">{ordinal(place)}</span>{leg.wristband??'–'}</>,on=change?.teamId===teamId && change.leg===index;
    if(!tappable) return <span className="rz-legchip">{inner}</span>;
    // Pressing a chip keeps focus in the box, so the number pad stays open.
    return <button type="button" className={on?'rz-legchip rz-legchip--changing':'rz-legchip'} aria-pressed={on} aria-label={`Team ${teamNumber} ${ordinal(place)} leg: ${leg.wristband??'empty'}. Change`}
      onMouseDown={event=>event.preventDefault()} onClick={()=>on?cancel():start(teamId,index,leg.wristband)}>{inner}</button>;
  };
  /** Above the box: a Save refused as changed, with Show latest. */
  const changedCallout=saves.changed && <Callout status message={`${changedLine(saves.changed.by)}.`} actions={<button type="button" className="rz-btn rz-btn--primary" onClick={latest}>Show latest</button>}/>;
  /** The box while a leg is being changed. */
  const changeField=change && <DigitsField id="leg" label="New number" value={typed} held={!!held} onRelease={fix} busy={saves.busy} warn={!!held}
    onChange={digits=>{setTyped(digits);setSaid('');}} onEnter={()=>void saveChange()} selectKey={`${change.teamId}:${change.leg}:${fresh}`} hint="Type the right number and tap Save."/>;
  /** The docked footer while a leg is being changed. */
  const changeFooter=<div className="rz-footer__pair">
    <button type="button" className="rz-btn" onClick={cancel}>Cancel</button>
    <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || !!held || saves.busy} onClick={()=>void saveChange()}>Save</KeepFocus>
  </div>;
  return {saves,typed,setTyped,held,setHeld,fix,said,setSaid,change,problem,saveChange,chip,changedCallout,changeField,changeFooter};
}
/**
 * A relay heat's Start line, like individual check-in: one number box asks "Team 5 · 2nd leg: wristband number?", Next
 * leg by leg, and the 4th leg's Next (or "Save Team 5 with 3") saves the team, every typed child checked in. A team
 * part-typed lives only on this phone; its number is set at save, so if another phone saved that number first it
 * takes the next, and the status line names it. Then Still to run, each team with Add, and the teams in this heat as
 * four leg chips each with a grip, and Take off (asking first if the finish line has placed the team): tapping a chip opens the box on that leg, its Save checked against
 * the team's version. Taps count from anyone as the race stands (ADR 0002). That's everyone marks Runners done.
 */
export function TeamStartLine({read,flow,onDone,locked}:StepProps) {
  const {race,group}=read,teams=read.teams||[],entries=(race.parts.runners.value||[]).filter(isTeamEntry),toRun=teams.filter(stillToRun);
  const number=read.nextTeam??1;
  const here=entries.reduce((sum,entry)=>sum+entry.legs.filter(leg=>leg.here).length,0);
  const tap=(teamId:string,what:string,body:object={})=>void flow.write(`teams/${teamId}/${what}`,body);
  const box=useLegBox(read,flow,teamId=>entries.find(item=>item.team.id===teamId));
  const {saves,typed,setTyped,held,setHeld,fix,said,setSaid,change,problem}=box;
  const [legs,setLegs]=useState<number[]>([]),[kept,setKept]=useState<number[]>([]);
  // Take off on a team the finish line has placed asks first: its place's time goes with it.
  const [asking,setAsking]=useState<string|null>(null),placeOf=(entryId:string)=>(race.parts.finish.value?.order||[]).indexOf(entryId);
  /** The team typed so far saved into this heat: the number it got comes back with the race. */
  async function save(typedLegs:number[],keptWarnings:number[]) {
    const wristbands=[0,1,2,3].map(index=>typedLegs[index]??null);
    const sent=await saves.send(`relays/${group.event.id}/teams`,{legs:wristbands,keptWarnings,joinRaceId:race.id});
    if(typeof sent!=='object') return;
    const saved=(sent.race.parts.runners.value||[]).filter(isTeamEntry).find(item=>item.legs.every((leg,index)=>leg.wristband===wristbands[index]));
    setSaid(`Team ${saved?.team.number??number} checked in: ${typedLegs.join(', ')}`);setLegs([]);setKept([]);setTyped('');
  }
  async function next(keep=false) {
    if(change) return box.saveChange(keep);
    if(!typed || saves.busy) return;
    const value=Number(typed);setSaid('');
    const found=problem(null,[...legs,value],legs.length);
    if(found && !keep) {setHeld(found);return;}
    setHeld(null);
    const typedLegs=[...legs,value],keptNow=keep?[...kept,value]:kept;
    if(typedLegs.length<4) {setLegs(typedLegs);setKept(keptNow);setTyped('');return;}
    await save(typedLegs,keptNow);
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact">
        {locked?<><p className="rz-prompt__meta">{raceName(race)}</p><h2 className="rz-prompt__q">{teamCount(entries.length)} checked in</h2></>
          :<><p className="rz-prompt__meta">{raceName(race)} · {teamCount(entries.length)} · {childCount(here)} here</p>
          <h2 className="rz-prompt__q">{change?`Change Team ${change.entry.team.number}'s ${ordinal(change.leg+1)} leg`:`Team ${number} · ${ordinal(legs.length+1)} leg: wristband number?`}</h2></>}
      </div>
      {flow.error && <Callout message={flow.error}/>}
      {saves.error && <Callout message={saves.error}/>}
      {box.changedCallout}
      {said && !change && <p className="rz-note" role="status">{said}</p>}
      {!locked && !change && <section className="rz-legrow rz-legrow--typing" aria-label={`Team ${number}, being typed`}>
        <div className="rz-legrow__head"><h3 className="rz-teamcard__name">Team {number}</h3><span className="rz-legrow__count">{legs.length} of 4</span></div>
        <ol className="rz-legchips">{[0,1,2,3].map(index=><li key={index}><span className={index===legs.length?'rz-legchip rz-legchip--next':index<legs.length?'rz-legchip':'rz-legchip rz-legchip--empty'}>
          <span className="rz-legchip__ord">{ordinal(index+1)}</span>{index<legs.length?legs[index]:index===legs.length?typed||'?':'–'}</span></li>)}</ol>
      </section>}
      {!locked && (box.changeField || <DigitsField id="leg" label={`${ordinal(legs.length+1)} leg wristband`} value={typed} held={!!held} onRelease={fix} busy={saves.busy} warn={!!held}
        onChange={digits=>{setTyped(digits);setSaid('');}} onEnter={()=>void next()}
        hint={`Type each child in running order, 1st leg first.${entries.length?' Tap a leg below to change it.':''}`}/>)}
      {held && <HeldCallout held={held} onKeep={()=>void next(true)} onFix={fix}/>}
      {!locked && !change && legs.length>0 && !typed && <KeepFocus className="rz-btn rz-btn--small rz-legrow__short" disabled={saves.busy} onClick={()=>void save(legs,kept)}>Save Team {number} with {legs.length}</KeepFocus>}
      {!locked && toRun.length>0 && <>
        <h3 className="rz-section">Still to run</h3>
        <ul className="rz-teamrows" aria-label="Still to run">{toRun.map(team=><TeamRow key={team.id} team={team} onAdd={()=>tap(team.id,'tick')}/>)}</ul>
      </>}
      {!locked && entries.length>0 && <h3 className="rz-section">In this heat</h3>}
      {entries.map(item=><section key={item.id} id={`team-${item.id}`} className="rz-legrow" aria-label={`Team ${item.team.number}`}>
        <div className="rz-legrow__head"><div className="rz-teamcard__title"><h3 className="rz-teamcard__name">Team {item.team.number}</h3><TeamNote legs={item.legs}/></div>
          {!locked && <button type="button" className="rz-btn rz-btn--small" onClick={()=>{
            if(placeOf(item.id)<0) {tap(item.team.id,'take-off');return;}
            flushSync(()=>setAsking(item.id)); // the question first, so it is scrolled clear of the footer
            document.getElementById(`team-${item.id}`)?.scrollIntoView({block:'center'});
          }}>Take off</button>}</div>
        {!locked && asking===item.id && placeOf(item.id)>=0 && <Callout message={placedAsk(`Team ${item.team.number}`,placeOf(item.id),'Take off')}
          actions={<><button type="button" className="rz-btn" onClick={()=>setAsking(null)}>Keep</button><button type="button" className="rz-btn rz-btn--primary" onClick={()=>{setAsking(null);tap(item.team.id,'take-off');}}>Take off</button></>}/>}
        <TeamLegs read={read} flow={flow} team={item.team} legs={item.legs} grips={!locked && !change} content={box.chip(item.team.id,item.team.number,!locked)}/>
      </section>)}
    </main>
    {!locked && <DockedFooter>{change?box.changeFooter:<div className="rz-footer__pair">
      <button type="button" className="rz-btn" disabled={!entries.length || legs.length>0 || flow.busy} onClick={()=>onDone('runners')}>{doneButtons.runners}</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || !!held || saves.busy} onClick={()=>void next()}>{legs.length===3?`Save Team ${number}`:'Next'}</KeepFocus>
    </div>}</DockedFooter>}
  </>;
}
/**
 * A start-line team's legs as leg chips side by side in leg order, an empty leg as "–". With `grips` each leg has one
 * under it to drag it to another leg ("Move 2071", "Move empty 4th leg"; arrow keys too), the labels following live.
 * A drop is the team's change at check-in with the legs in their new order: it saves the race and the team together,
 * every child still checked in, and a drop on a team changed meanwhile comes back as changed, the phone showing the
 * latest. `content` also gets the leg's index as saved.
 */
function TeamLegs<Leg extends TeamLeg>({read,flow,team,legs,grips,content}:{read:RaceFlowRead;flow:StepProps['flow'];team:{id:string;number:number};legs:Leg[];grips:boolean;
  content:(leg:Leg,place:number,index:number)=>ReactNode}) {
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
  if(!grips) return <ul className="rz-legchips">{rows.map((item,index)=><li key={item.key}>{content(item.leg,index+1,legs.indexOf(item.leg))}</li>)}</ul>;
  return <SortableList label={`Team ${team.number} legs`} items={rows} itemKey={item=>item.key} itemName={name} disabled={moved!==null} across
    look={{list:'rz-legchips rz-teamgrips',row:'',handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:what=>`Move ${what}`}}
    onReorder={next=>void drop(next)} renderItem={(item,place)=>content(item.leg,place,legs.indexOf(item.leg))}/>;
}
/**
 * A relay final's start line: a card per seeded team (and any team a lead called up or added), each with its children
 * as four leg chips with a grip under each unless it is Absent, and Here / Absent for the whole team, neither lit at
 * first; tapping a lit mark again unmarks it. Tapping a chip opens the box on that leg, as on a heat: its Save changes
 * the team's kept copy too, Here or not. Only teams Here run it, as on a children's final. Taps count from anyone as
 * the race stands (ADR 0002). That's everyone with a team unmarked asks before recording it Absent.
 */
export function TeamAttendance({read,flow,onDone,locked}:StepProps) {
  const {race}=read,final=race.final!,inRace=(race.parts.runners.value||[]).filter(isTeamEntry);
  const [asking,setAsking]=useState(false),ask=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(asking) ask.current?.scrollIntoView({block:'center'});},[asking]);
  // As on a children's final, a team in the race is Here; one out of it is Absent or not marked yet.
  const cards=final.entries.map(entry=>{
    const current=inRace.find(other=>other.id===entry.finalEntryId);
    const mark=finalMark(entry,inRace);
    return {entry,team:entry.team!,legs:current?.legs??entry.legs??[],mark};
  });
  const box=useLegBox(read,flow,teamId=>cards.find(item=>item.team.id===teamId)),{change,held}=box;
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
        <h2 className="rz-prompt__q">{change?`Change Team ${change.entry.team.number}'s ${ordinal(change.leg+1)} leg`:'Which teams are here?'}</h2></div>
      {flow.error && <Callout message={flow.error}/>}
      {box.saves.error && <Callout message={box.saves.error}/>}
      {box.changedCallout}
      {box.said && !change && <p className="rz-note" role="status">{box.said}</p>}
      {!locked && box.changeField}
      {held && <HeldCallout held={held} onKeep={()=>void box.saveChange(true)} onFix={box.fix}/>}
      {cards.map(item=><section key={item.entry.finalEntryId} className={item.mark==='absent'?'rz-teamcard rz-teamcard--final is-absent':'rz-teamcard rz-teamcard--final'} aria-label={`Team ${item.team.number}`}>
        <div className="rz-teamcard__head"><div className="rz-teamcard__title"><h3 className="rz-teamcard__name"><span className="rz-teamcard__seed">{seedLabel(item.entry)} · </span>Team {item.team.number}</h3><TeamNote legs={item.legs}/></div>
          <span className="rz-teamcard__marks">{(['here','absent'] as const).map(mark=><button key={mark} type="button" className={item.mark===mark?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'}
            disabled={locked || flow.busy} aria-pressed={item.mark===mark} aria-label={`Team ${item.team.number}: ${mark==='here'?'Here':'Absent'}`} onClick={()=>tap(item,mark)}>{mark==='here'?'Here':'Absent'}</button>)}</span></div>
        <TeamLegs read={read} flow={flow} team={item.team} legs={item.legs} grips={!locked && item.mark!=='absent' && !change}
          content={box.chip(item.team.id,item.team.number,!locked && item.mark!=='absent')}/>
      </section>)}
      {!locked && !change && <CallUp read={read} flow={flow}/>}
      {asking && unmarked.length>0 && <div ref={ask}><Callout message={`${andList(unmarked.map(item=>`Team ${item.team.number}`))} ${unmarked.length===1?'is':'are'} not marked. Record them absent?`}
        actions={<><button type="button" className="rz-btn" onClick={()=>setAsking(false)}>Go back</button><button type="button" className="rz-btn rz-btn--primary" disabled={flow.busy} onClick={()=>void recordAbsent()}>Record them absent</button></>}/></div>}
    </main>
    {!locked && <DockedFooter>{change?box.changeFooter:<button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!here || flow.busy} onClick={()=>unmarked.length?setAsking(true):onDone('runners')}>{doneButtons.runners}</button>}</DockedFooter>}
  </>;
}
/** "+ Team not on the list" on a relay heat: the teams still to run, each with Add, never a typed wristband. */
export function TeamPicker({read,onAdd,onClose}:{read:RaceFlowRead;onAdd:(teamId:string)=>void;onClose:()=>void}) {
  const toRun=(read.teams||[]).filter(stillToRun);
  return <Sheet title="Team not on the list" onClose={onClose}>
    {toRun.length?<><p className="rz-sheet__text">Add the team whose 4th leg crossed the line. It takes the next place.</p>
      <ul className="rz-teamrows" aria-label="Still to run">{toRun.map(team=><TeamRow key={team.id} team={team} onAdd={()=>onAdd(team.id)}/>)}</ul></>
      :<p className="rz-sheet__text">Every team is in a heat already.</p>}
  </Sheet>;
}
