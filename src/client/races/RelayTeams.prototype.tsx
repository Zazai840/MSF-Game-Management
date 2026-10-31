/**
 * PROTOTYPE - throwaway, never merged (wayfinder map #231, ticket #237: how are relay teams made inside the heat,
 * without + New team?). Client only, at /prototype/relay-teams: an in-memory relay (4x50m Relay · Girl Cubs) on the
 * real race-flow components and styles, no server. Heat 1 has run with Teams 1-3; Heat 2 is at the start line with
 * Team 4 in it. "+" on the heat chips makes an empty Heat 3. No team list, no Teams row, no New team at the foot of
 * Relays: a team exists only once it is typed into a heat. Three looks for the start line, switched by the pink pill
 * (or ?variant=A|B|C):
 *   A - Like individual check-in: one number box, "Team 5 · 2nd leg: wristband number?", Next leg by leg; typing a
 *       child is checking them in (no Here marks).
 *   B - Team cards with four boxes in place: "+ Add team 5" opens four leg boxes on the screen; each child then gets
 *       Here at their holding point (two stages, as today).
 *   C - Team tiles and a sheet: two tiles to a row, "+ Team 5" opens a bottom sheet with four boxes; no Here marks.
 */
import { useEffect,useRef,useState,type ReactNode } from 'react';
import { ordinal } from '../../shared/ordinal.js';
import { roleLabels,type RaceSummary,type Role } from '../../shared/race-flow.js';
import { plainWristbandWarning,wristbandWarnings } from '../../shared/wristband-checks.js';
import { digitsOnly } from '../flow/NumberEntry.js';
import { Callout,DockedFooter,HeatChips,Icon,RaceBar,RoleChip,Screen,Sheet,StepStrip } from './parts.js';
import './RelayTeams.prototype.css';

type Variant='A'|'B'|'C';
const variants:Variant[]=['A','B','C'];
const variantNames:Record<Variant,string>={A:'Like individual check-in',B:'Team cards, boxes in place',C:'Team tiles and a sheet'};
const relay={name:'4x50m Relay',section:'Girl Cubs' as const};
type Legs=Array<number|null>;
interface Team { id:string; number:number; legs:Legs }
interface Entry { teamId:string; here:boolean[] }
interface Heat { id:string; number:number; entries:Entry[]; ran:boolean }
interface Day { teams:Team[]; heats:Heat[] }

let made=0;
const legsFrom=(first:number):Legs=>[first,first+1,first+2,first+3];
function seedDay(variant:Variant):Day {
  const teams=[1,2,3,4].map(number=>({id:`t${number}`,number,legs:legsFrom(2000+number*10+1)}));
  return {teams,heats:[
    {id:'h1',number:1,ran:true,entries:['t1','t2','t3'].map(teamId=>({teamId,here:[true,true,true,true]}))},
    // In B a team is typed at the prep area, then each child is marked Here at their holding point.
    {id:'h2',number:2,ran:false,entries:[{teamId:'t4',here:variant==='B'?[true,true,false,false]:[true,true,true,true]}]}
  ]};
}
/** Teams are numbered within the relay in the order they are typed; a team taken off before it runs is gone, so the last number is used again. */
const nextNumber=(day:Day)=>Math.max(0,...day.teams.map(team=>team.number))+1;
const teamOf=(day:Day,id:string)=>day.teams.find(team=>team.id===id)!;
const legsText=(legs:Legs)=>legs.map(leg=>leg??'–').join(' · ');

/**
 * A leg's wristband checked as individual check-in checks it: a child already in this team or in another team of this
 * heat is refused (Fix number only); a wrong section, an unknown number or a child who ran in another heat warns (Fix number or Keep).
 */
function legCheck(day:Day,heat:Heat,number:number,teamId:string|null,team:Legs):{refused?:string;warning?:string} {
  if(team.includes(number)) return {refused:`${number} is already in this team.`};
  const inHeat=heat.entries.map(entry=>teamOf(day,entry.teamId)).find(other=>other.id!==teamId && other.legs.includes(number));
  if(inHeat) return {refused:`${number} is already in Team ${inHeat.number} in this heat. Each child runs for one team.`};
  const section=wristbandWarnings(number,relay.section)[0];
  if(section) return {warning:plainWristbandWarning(section,number,relay.section)};
  const ran=day.heats.filter(other=>other.id!==heat.id).flatMap(other=>other.entries.map(entry=>({heat:other,team:teamOf(day,entry.teamId)}))).find(item=>item.team.legs.includes(number));
  if(ran) return {warning:`${number} already ran in Heat ${ran.heat.number}, in Team ${ran.team.number}.`};
  return {};
}

function firstVariant():Variant {
  const asked=new URLSearchParams(location.search).get('variant');
  return variants.includes(asked as Variant)?asked as Variant:'A';
}
export function RelayTeamsPrototype() {
  const [variant,setVariant]=useState<Variant>(firstVariant);
  const [day,setDay]=useState(()=>seedDay(variant));
  const [heatId,setHeatId]=useState('h2');
  const [role,setRole]=useState<Role>('start');
  const [roleSheet,setRoleSheet]=useState(false);
  function cycle(step:number) {
    const next=variants[(variants.indexOf(variant)+step+variants.length)%variants.length]!;
    const params=new URLSearchParams(location.search);params.set('variant',next);history.replaceState(null,'',`${location.pathname}?${params}`);
    setVariant(next);setDay(seedDay(next));setHeatId('h2');
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.target instanceof HTMLInputElement) return;if(event.key==='ArrowLeft') cycle(-1);if(event.key==='ArrowRight') cycle(1);};
    addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);
  });
  useEffect(()=>{document.body.classList.toggle('proto-nocodes',role!=='lead');},[role]);
  const heat=day.heats.find(item=>item.id===heatId)!;
  const update=(change:(next:Day,heat:Heat)=>void)=>setDay(current=>{const next=structuredClone(current);change(next,next.heats.find(item=>item.id===heatId)!);return next;});
  const ctx:Ctx={day,heat,variant,
    /** Save a team typed or changed in this heat: a new one takes the relay's next number and joins the heat. */
    save:(teamId,legs)=>update((next,at)=>{
      const team=next.teams.find(item=>item.id===teamId);
      if(team) {team.legs=legs;return;}
      const id=`new${++made}`;
      next.teams.push({id,number:nextNumber(next),legs});
      at.entries.push({teamId:id,here:legs.map(()=>variant!=='B')});
    }),
    takeOff:teamId=>update((next,at)=>{at.entries=at.entries.filter(entry=>entry.teamId!==teamId);next.teams=next.teams.filter(team=>team.id!==teamId);}),
    here:(teamId,leg)=>update((_,at)=>{const entry=at.entries.find(item=>item.teamId===teamId)!;entry.here[leg]=!entry.here[leg];}),
    done:()=>update((_,at)=>{at.ran=true;})};
  const summaries:RaceSummary[]=day.heats.map(item=>({id:item.id,kind:'heat',number:item.number,state:item.ran?'saved':'in progress',createdAt:'',updatedAt:'',steps:{
    runners:{state:item.ran?'done':item.entries.length?'in progress':'not started',count:item.entries.length,expected:null,version:0,by:null,at:null,doneBy:null,doneAt:null},
    positions:{state:item.ran?'done':'not started',count:item.ran?item.entries.length:0,expected:item.entries.length,version:0,by:null,at:null,doneBy:null,doneAt:null},
    times:{state:item.ran?'done':'not started',count:item.ran?item.entries.length:0,expected:item.entries.length,version:0,by:null,at:null,doneBy:null,doneAt:null}}}));
  const Body=variant==='A'?StartA:variant==='B'?StartB:StartC;
  return <Screen screen="Relay teams prototype">
    <div className="proto-switcher" aria-label="Prototype variant"><div className="proto-switcher__pill"><button type="button" aria-label="Previous variant" onClick={()=>cycle(-1)}>‹</button>
      <span>{variant} · {variantNames[variant]}</span><button type="button" aria-label="Next variant" onClick={()=>cycle(1)}>›</button>
      <button type="button" className="proto-switcher__reset" aria-label="Start again" onClick={()=>{setDay(seedDay(variant));setHeatId('h2');}}>↺</button></div></div>
    <RaceBar title={`${relay.name} · ${relay.section}`} code="R22" role={role} onBack={()=>{}}><RoleChip role={role} onOpen={()=>setRoleSheet(true)}/></RaceBar>
    <nav className="rz-heats-nav" aria-label="Heats"><HeatChips races={summaries} role={role} current={heat.id} nextHeat={day.heats.length+1}
      onRace={setHeatId} onAdd={()=>{const id=`h${day.heats.length+1}`;setDay(current=>({...current,heats:[...current.heats,{id,number:current.heats.length+1,entries:[],ran:false}]}));setHeatId(id);}}/></nav>
    <StepStrip race={summaries.find(item=>item.id===heat.id)!} role={role} label={`Heat ${heat.number} steps`} relay/>
    {heat.ran?<main className="rz-main"><div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">Heat {heat.number}</p><h2 className="rz-prompt__q">{heat.entries.length} teams ran</h2></div>
      <ul className="proto-teamlist">{heat.entries.map(entry=>{const team=teamOf(day,entry.teamId);return <li key={team.id}><strong>Team {team.number}</strong> {legsText(team.legs)}</li>;})}</ul></main>
      :<Body key={`${variant}-${heat.id}`} ctx={ctx}/>}
    {roleSheet && <Sheet title="Your job" onClose={()=>setRoleSheet(false)}><div className="rz-choices rz-choices--grid">
      {(['start','finish','timer','lead'] as Role[]).map(item=><button key={item} type="button" className="rz-choice" aria-pressed={item===role} onClick={()=>{setRole(item);setRoleSheet(false);}}>{roleLabels[item]}</button>)}
    </div></Sheet>}
  </Screen>;
}
interface Ctx { day:Day; heat:Heat; variant:Variant; save:(teamId:string|null,legs:Legs)=>void; takeOff:(teamId:string)=>void; here:(teamId:string,leg:number)=>void; done:()=>void }
const childCount=(heat:Heat)=>heat.entries.reduce((sum,entry)=>sum+entry.here.filter(Boolean).length,0);
const teamsText=(count:number)=>`${count} ${count===1?'team':'teams'}`;

/** The number pad box, kept focused between entries as the individual start line keeps it. */
function Digits({id,label,value,onChange,onEnter,warn=false,hint}:{id:string;label:string;value:string;onChange:(digits:string)=>void;onEnter:()=>void;warn?:boolean;hint?:ReactNode}) {
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!warn) input.current?.focus({preventScroll:true});},[warn,label]);
  return <div className={warn?'rz-field rz-field--warn':'rz-field'}>
    <label className="rz-field__label" htmlFor={id}>{label}</label>
    <input ref={input} className="rz-field__input" id={id} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" value={value} readOnly={warn}
      onChange={event=>onChange(digitsOnly(event.target.value))} onKeyDown={event=>{if(event.key==='Enter') {event.preventDefault();onEnter();}}}/>
    {hint && <p className="rz-field__hint">{hint}</p>}
  </div>;
}
const KeepFocus=({className,disabled=false,onClick,children}:{className:string;disabled?:boolean;onClick:()=>void;children:ReactNode})=>
  <button type="button" className={className} aria-disabled={disabled || undefined} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(!disabled) onClick();}}>{children}</button>;
const Held=({held,onFix,onKeep}:{held:{refused?:string;warning?:string};onFix:()=>void;onKeep:()=>void})=>
  <Callout message={held.refused??held.warning} actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={onFix}>Fix number</button>{!held.refused && <button type="button" className="rz-btn" onClick={onKeep}>Keep</button>}</>}/>;

/**
 * A: the individual start line, team by team. "Team 5 · 1st leg: wristband number?", one box, Next; the 4th leg's
 * Next saves the team and asks for the next team's 1st leg. Saved teams sit above as a row of chips; tapping a chip
 * changes that leg. A team short of four is saved with "Save Team 5 with 3".
 */
function StartA({ctx}:{ctx:Ctx}) {
  const {day,heat}=ctx;
  const [legs,setLegs]=useState<number[]>([]),[typed,setTyped]=useState(''),[held,setHeld]=useState<{refused?:string;warning?:string}|null>(null);
  const [changing,setChanging]=useState<{teamId:string;leg:number}|null>(null),[said,setSaid]=useState('');
  const number=nextNumber(day),changeTeam=changing && teamOf(day,changing.teamId);
  function next(keep=false) {
    if(!typed) return;
    const value=Number(typed);
    const others=changeTeam?changeTeam.legs.filter((_,index)=>index!==changing!.leg):legs;
    const check=legCheck(day,heat,value,changeTeam?.id??null,others);
    if(!keep && (check.refused || check.warning)) {setHeld(check);return;}
    setHeld(null);setTyped('');
    if(changeTeam) {const updated=[...changeTeam.legs];updated[changing!.leg]=value;ctx.save(changeTeam.id,updated);setSaid(`Team ${changeTeam.number}: ${ordinal(changing!.leg+1)} leg changed to ${value}`);setChanging(null);return;}
    const updated=[...legs,value];
    if(updated.length<4) {setLegs(updated);setSaid('');return;}
    ctx.save(null,updated);setLegs([]);setSaid(`Team ${number} checked in: ${updated.join(', ')}`);
  }
  function saveShort() {ctx.save(null,[...legs,...Array(4-legs.length).fill(null)]);setSaid(`Team ${number} checked in with ${legs.length}: it runs short`);setLegs([]);}
  const meta=`Heat ${heat.number} · ${teamsText(heat.entries.length)} · ${childCount(heat)} children`;
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{meta}</p>
        <h2 className="rz-prompt__q">{changeTeam?`Change Team ${changeTeam.number}'s ${ordinal(changing!.leg+1)} leg`:<>Team {number} · {ordinal(legs.length+1)} leg: wristband number?</>}</h2></div>
      {said && !changing && <p className="rz-note" role="status">{said}</p>}
      {!changing && <section className="proto-arow proto-arow--typing" aria-label={`Team ${number}, being typed`}>
        <div className="proto-arow__head"><h3 className="rz-teamcard__name">Team {number}</h3><span className="proto-arow__state">{legs.length} of 4</span></div>
        <ol className="rz-chips">{[0,1,2,3].map(index=><li key={index}><span className={index===legs.length?'rz-chip proto-chip--next':index<legs.length?'rz-chip':'rz-chip proto-chip--empty'}>
          <span className="proto-chip__ord">{ordinal(index+1)}</span>{index<legs.length?legs[index]:index===legs.length?typed||'?':'–'}</span></li>)}</ol>
      </section>}
      <Digits id="leg" label={changing?'New number':`${ordinal(legs.length+1)} leg wristband`} value={typed} warn={!!held} onChange={value=>{setTyped(value);setSaid('');}} onEnter={()=>next()}
        hint={changing?'Type the right number and tap Save.':'Type each child in running order, 1st leg first. Tap a number above to change it.'}/>
      {held && <Held held={held} onFix={()=>{setHeld(null);setTyped('');}} onKeep={()=>next(true)}/>}
      {!changing && legs.length>0 && !typed && <button type="button" className="rz-btn rz-btn--small proto-short" onClick={saveShort}>Save Team {number} with {legs.length}</button>}
      {heat.entries.length>0 && <h3 className="rz-section">In this heat</h3>}
      {heat.entries.map(entry=>{const team=teamOf(day,entry.teamId);return <section key={team.id} className="proto-arow" aria-label={`Team ${team.number}`}>
        <div className="proto-arow__head"><h3 className="rz-teamcard__name">Team {team.number}</h3>
          <button type="button" className="rz-btn rz-btn--small" onClick={()=>{ctx.takeOff(team.id);setSaid(`Team ${team.number} taken off this heat`);}}>Take off</button></div>
        <ul className="rz-chips" aria-label={`Team ${team.number} legs`}>{team.legs.map((leg,index)=><li key={index}>
          <button type="button" className={changing?.teamId===team.id && changing.leg===index?'rz-chip rz-chip--changing':'rz-chip'} onMouseDown={event=>event.preventDefault()}
            onClick={()=>{setChanging({teamId:team.id,leg:index});setTyped(leg===null?'':String(leg));setHeld(null);}}>
            <span className="proto-chip__ord">{ordinal(index+1)}</span>{leg??'–'} <Icon name="pencil"/></button></li>)}</ul>
      </section>;})}
    </main>
    <DockedFooter>{changing?<div className="rz-footer__pair">
      <button type="button" className="rz-btn" onClick={()=>{setChanging(null);setTyped('');setHeld(null);}}>Cancel</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || !!held} onClick={()=>next()}>Save</KeepFocus>
    </div>:<div className="rz-footer__pair">
      <button type="button" className="rz-btn" disabled={!heat.entries.length || legs.length>0} onClick={ctx.done}>That's everyone</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || !!held} onClick={()=>next()}>{legs.length===3?`Save Team ${number}`:'Next'}</KeepFocus>
    </div>}</DockedFooter>
  </>;
}

/** Four leg boxes at once, checked as they are typed (B in place, C in a sheet). */
function FourBoxes({ctx,team,onDone,onRemove}:{ctx:Ctx;team:Team|null;onDone:()=>void;onRemove?:()=>void}) {
  const {day,heat}=ctx;
  const [boxes,setBoxes]=useState<string[]>(team?team.legs.map(leg=>leg===null?'':String(leg)):['','','','']);
  const [kept,setKept]=useState<number[]>([]),[typing,setTyping]=useState<number|null>(0);
  const numbers=boxes.map(box=>box?Number(box):null);
  const checks=numbers.map((value,index)=>value===null || typing===index?{}:legCheck(day,heat,value,team?.id??null,numbers.slice(0,index).filter((leg):leg is number=>leg!==null)));
  const waiting=checks.findIndex((check,index)=>check.refused || (check.warning && !kept.includes(numbers[index]!)));
  const number=team?.number??nextNumber(day),inputs=useRef<Array<HTMLInputElement|null>>([]),box=useRef<HTMLDivElement>(null);
  useEffect(()=>{box.current?.scrollIntoView({block:'nearest'});},[]);
  const fix=(index:number)=>{setBoxes(boxes.map((value,at)=>at===index?'':value));inputs.current[index]?.focus();};
  return <div ref={box} className="proto-four">
    <p className="rz-field__hint">Type each child's wristband in running order, 1st leg first.</p>
    <ol className="rz-legboxes">{boxes.map((value,index)=>{
      const check=checks[index]!,warn=!!check.refused || (!!check.warning && !kept.includes(numbers[index]!));
      return <li key={index} className="proto-legbox"><label className={warn?'rz-field rz-field--warn':'rz-field'}><span className="rz-field__label">{ordinal(index+1)} leg</span>
        <input ref={input=>{inputs.current[index]=input;}} className="rz-field__input" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint={index<3?'next':'done'}
          autoFocus={index===0 && !team} value={value} placeholder="Wristband" onFocus={()=>setTyping(index)} onBlur={()=>setTyping(null)}
          onChange={event=>setBoxes(boxes.map((other,at)=>at===index?digitsOnly(event.target.value):other))}
          onKeyDown={event=>{if(event.key!=='Enter') return;event.preventDefault();if(index<3) inputs.current[index+1]?.focus();else event.currentTarget.blur();}}/></label></li>;
    })}</ol>
    {waiting>=0 && <Held held={checks[waiting]!} onFix={()=>fix(waiting)} onKeep={()=>setKept([...kept,numbers[waiting]!])}/>}
    <div className="rz-footer__pair">
      <button type="button" className="rz-btn" onMouseDown={event=>event.preventDefault()} onClick={onDone}>Cancel</button>
      <button type="button" className="rz-btn rz-btn--primary" disabled={!numbers.some(leg=>leg!==null) || waiting>=0} onClick={()=>{ctx.save(team?.id??null,numbers);onDone();}}>Save team {number}</button>
    </div>
    {onRemove && <button type="button" className="rz-btn rz-btn--small rz-btn--block proto-remove" onClick={onRemove}>Take Team {number} off this heat</button>}
  </div>;
}

/**
 * B: today's start line without a team list. Team cards, each child with Here / Not yet (marked at their holding point
 * by anyone, ADR 0002), Edit and Take off; "+ Add team 5" opens four boxes on the screen, under the cards.
 */
function StartB({ctx}:{ctx:Ctx}) {
  const {day,heat}=ctx;
  const [editing,setEditing]=useState<string|null|undefined>(heat.entries.length?undefined:null);
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">Heat {heat.number} · {teamsText(heat.entries.length)} · {childCount(heat)} children here</p>
        <h2 className="rz-prompt__q">Which teams are running?</h2></div>
      {heat.entries.map(entry=>{
        const team=teamOf(day,entry.teamId);
        if(editing===team.id) return <section key={team.id} className="rz-teamcard proto-editing" aria-label={`Edit Team ${team.number}`}>
          <div className="rz-teamcard__head"><h3 className="rz-teamcard__name">Edit Team {team.number}</h3></div>
          <FourBoxes ctx={ctx} team={team} onDone={()=>setEditing(undefined)}/></section>;
        return <section key={team.id} className="rz-teamcard" aria-label={`Team ${team.number}`}>
          <div className="rz-teamcard__head"><div className="rz-teamcard__title"><h3 className="rz-teamcard__name">Team {team.number}</h3></div>
            <span className="rz-teamcard__marks"><button type="button" className="rz-btn rz-btn--small" onClick={()=>setEditing(team.id)}>Edit</button>
              {!entry.here.some(Boolean) && <button type="button" className="rz-btn rz-btn--small" onClick={()=>ctx.takeOff(team.id)}>Take off</button>}</span></div>
          <ul className="rz-attendance rz-attendance--one">{team.legs.map((leg,index)=><li key={index} className={entry.here[index]?undefined:'is-absent'}>
            <span className="rz-attendance__who"><span className="rz-attendance__seed">{ordinal(index+1)} leg</span><span className="label">{leg??'–'}</span></span>
            {leg!==null && <button type="button" className={entry.here[index]?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'} aria-pressed={entry.here[index]}
              onClick={()=>ctx.here(team.id,index)}>{entry.here[index]?'Here':'Not yet'}</button>}
            <span className="proto-grip"><Icon name="drag"/></span></li>)}</ul>
        </section>;
      })}
      {editing===null?<section className="rz-teamcard proto-editing" aria-label={`New Team ${nextNumber(day)}`}>
        <div className="rz-teamcard__head"><h3 className="rz-teamcard__name">Team {nextNumber(day)}</h3></div>
        <FourBoxes ctx={ctx} team={null} onDone={()=>setEditing(undefined)}/></section>
        :editing===undefined && <button type="button" className="rz-btn rz-btn--block" onClick={()=>setEditing(null)}><Icon name="plus"/>Add team {nextNumber(day)}</button>}
    </main>
    <DockedFooter><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!heat.entries.length || editing!==undefined} onClick={ctx.done}>That's everyone</button></DockedFooter>
  </>;
}

/**
 * C: a grid of team tiles, two to a row, each its number over its four children in leg order. "+ Team 5" opens a
 * bottom sheet with four boxes; tapping a tile opens the same sheet to change it or take it off. No Here marks.
 */
function StartC({ctx}:{ctx:Ctx}) {
  const {day,heat}=ctx;
  const [open,setOpen]=useState<string|null|undefined>(undefined);
  const team=open?teamOf(day,open):null;
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">Heat {heat.number} · {teamsText(heat.entries.length)} · {childCount(heat)} children</p>
        <h2 className="rz-prompt__q">Which teams are running?</h2></div>
      <ul className="proto-tiles" aria-label="Teams in this heat">
        {heat.entries.map(entry=>{const item=teamOf(day,entry.teamId);return <li key={item.id}><button type="button" className="proto-tile" aria-label={`Team ${item.number}: ${legsText(item.legs)}. Change`} onClick={()=>setOpen(item.id)}>
          <span className="proto-tile__name">Team {item.number}<Icon name="pencil"/></span>
          <ol className="proto-tile__legs">{item.legs.map((leg,index)=><li key={index}><span>{ordinal(index+1)}</span>{leg??'–'}</li>)}</ol></button></li>;})}
        <li><button type="button" className="proto-tile proto-tile--add" onClick={()=>setOpen(null)}><Icon name="plus"/>Team {nextNumber(day)}</button></li>
      </ul>
    </main>
    <DockedFooter><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!heat.entries.length} onClick={ctx.done}>That's everyone</button></DockedFooter>
    {open!==undefined && <Sheet title={team?`Team ${team.number}`:`Team ${nextNumber(day)} · joins Heat ${heat.number}`} onClose={()=>setOpen(undefined)}>
      <FourBoxes ctx={ctx} team={team} onDone={()=>setOpen(undefined)} onRemove={team?()=>{ctx.takeOff(team.id);setOpen(undefined);}:undefined}/></Sheet>}
  </>;
}
