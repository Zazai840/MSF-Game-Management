import { useEffect,useRef,useState,type ReactNode } from 'react';
import { seedLabel } from '../../shared/finals.js';
import { ordinal } from '../../shared/ordinal.js';
import { andList,raceName,type RaceFlowRead } from '../../shared/race-flow.js';
import { isTeamEntry } from '../../shared/races.js';
import { changerOf,changingLine,childCount,legsText,runsShortLine,stillToRun,teamCount,type RelayTeam,type TeamLeg } from '../../shared/teams.js';
import { SortableList } from '../flow/SortableList.js';
import { Callout,DockedFooter,Icon,Sheet } from './parts.js';
import type { StepProps } from './Steps.js';
import { CheckInTeamSheet } from './TeamSheet.js';

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
/**
 * A relay heat's Start line: the teams in this heat as cards, each child in leg order with Here / Not yet and a grip,
 * and Take off while none of its children is here, then Still to run, each team with Add. Taps count from anyone as
 * the race stands (ADR 0002), so phones tapping at once all land and the last tap on a child wins. That's everyone
 * marks Runners done.
 */
export function TeamStartLine({read,flow,onDone,locked,me}:StepProps) {
  const {race}=read,teams=read.teams||[],entries=(race.parts.runners.value||[]).filter(isTeamEntry),toRun=teams.filter(stillToRun);
  const here=entries.reduce((sum,entry)=>sum+entry.legs.filter(leg=>leg.here).length,0);
  const tap=(teamId:string,what:string,body:object={})=>void flow.write(`teams/${teamId}/${what}`,body);
  /** The team open in the teams sheet: its id for Edit, null for New team. */
  const [editing,setEditing]=useState<{teamId:string|null}|null>(null);
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · {teamCount(entries.length)} · {childCount(here)} here</p>
        <h2 className="rz-prompt__q">Which teams are running?</h2></div>
      {flow.error && <Callout message={flow.error}/>}
      {entries.map(entry=>{
        const changer=changerIn(read,me,entry.team.id);
        return <section key={entry.id} className="rz-teamcard" aria-label={`Team ${entry.team.number}`}>
          <div className="rz-teamcard__head"><div className="rz-teamcard__title"><h3 className="rz-teamcard__name">Team {entry.team.number}</h3><TeamNote changer={changer} legs={entry.legs}/></div>
            {!locked && <span className="rz-teamcard__marks">
              <EditTeam number={entry.team.number} onEdit={()=>setEditing({teamId:entry.team.id})}/>
              {!entry.legs.some(leg=>leg.here) && <button type="button" className="rz-btn rz-btn--small" onClick={()=>tap(entry.team.id,'take-off')}>Take off</button>}
            </span>}</div>
          <TeamLegs read={read} flow={flow} team={entry.team} legs={entry.legs} grips={!locked && !editing && !changer}
            list="rz-attendance rz-attendance--one" row={leg=>leg.here?'':'is-absent'} content={(leg,place)=><>
              <span className="rz-attendance__who"><span className="rz-attendance__seed">{ordinal(place)} leg</span><span className="label">{leg.wristband??'–'}</span></span>
              {leg.wristband!==null && <button type="button" className={leg.here?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'} disabled={locked} aria-pressed={leg.here} aria-label={`${leg.wristband}: Here`}
                onClick={()=>tap(entry.team.id,'here',{leg:entry.legs.indexOf(leg),here:!leg.here})}>{leg.here?'Here':'Not yet'}</button>}
            </>}/>
        </section>;
      })}
      {!locked && <>
        <h3 className="rz-section">Still to run</h3>
        {toRun.length?<ul className="rz-teamrows" aria-label="Still to run">{toRun.map(team=><TeamRow key={team.id} team={team} me={me} onAdd={()=>tap(team.id,'tick')}/>)}</ul>
          :<p className="rz-empty">{teams.length?'Every team on the list is in a heat.':'No teams on the list yet.'}</p>}
        <button type="button" className="rz-btn rz-btn--block" onClick={()=>setEditing({teamId:null})}><Icon name="plus"/>New team</button>
      </>}
    </main>
    {!locked && <DockedFooter><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!entries.length || flow.busy} onClick={()=>onDone('runners')}>That's everyone</button></DockedFooter>}
    {editing && <CheckInTeamSheet read={read} teamId={editing.teamId} offer={flow.offer} onClose={()=>setEditing(null)}/>}
  </>;
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
    await flow.writeTeam(read.group.event.id,team.id,{version,legs:wristbands,keptWarnings:wristbands.filter(number=>number!==null),raceId:read.race.id});
    setMoved(null);
  }
  if(!grips) return <ul className={list}>{rows.map((item,index)=><li key={item.key} className={row(item.leg)||undefined}>{content(item.leg,index+1)}</li>)}</ul>;
  return <SortableList label={`Team ${team.number} legs`} items={rows} itemKey={item=>item.key} itemName={name} disabled={moved!==null}
    look={{list:`${list} rz-teamgrips`,row:item=>row(item.leg),handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:what=>`Move ${what}`}}
    onReorder={next=>void drop(next)} renderItem={(item,place)=>content(item.leg,place)}/>;
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
