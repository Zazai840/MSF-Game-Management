/**
 * PROTOTYPE - throwaway, never merged (map ticket #186: what do the Relays tab, New relay, New team and a relay race
 * look like in the race flow?). Client only, at /prototype/relays: an in-memory relay day on the real race-flow
 * components and styles, no server. Three variants, switched by the pink pill at the top (or ?variant=A|B|C):
 *   D - (owner's pick, 29 Oct) the card's Teams row opens a bottom sheet of every team and its members; New team and Edit in that sheet.
 *   A - Team list on its own screen: New team typed one leg at a time; tick a team in, then each leg Here; finish tiles big team number.
 *   B - Races | Teams switch: New team in a sheet with four boxes; start line in two stages; finish tiles big 4th-leg wristband (today).
 *   C - Team list inside the card: New team typed inline; one tick list with tappable children; finish tiles show both.
 */
import { useEffect,useRef,useState,type ReactNode } from 'react';
import type { DayEvent } from '../../shared/day.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceName,roleLabels,roleSteps,stepLabels,type RaceGroup,type RaceSummary,type Role,type Step,type StepStatus } from '../../shared/race-flow.js';
import { formatTime,formatTimeDigits,parseTimeDigits } from '../../shared/time-entry.js';
import { plainWristbandWarning,wristbandWarnings } from '../../shared/wristband-checks.js';
import { digitsOnly } from '../flow/NumberEntry.js';
import { NewRaceSheet } from './NewRaceSheet.js';
import { Avatar,Callout,HeatChips,HomeBar,Icon,RaceBar,RoleChip,Screen,Sheet,StepStrip } from './parts.js';
import { EventTabs } from './RacesHome.js';
import './Relays.prototype.css';

type Variant='A'|'B'|'C'|'D';
const variantNames:Record<Variant,string>={A:'Team list on its own screen',B:'Races | Teams switch',C:'Team list inside the card',D:'Teams in a bottom sheet'};
const me='Sam Patel';
interface Relay { code:string; name:string; section:DayEvent['section'] }
interface Team { id:string; code:string; number:number; legs:Array<number|null>; by:string }
interface Entry { teamId:string; here:boolean[]; seed?:number; absent?:boolean; atFinish?:boolean }
interface Race { id:string; code:string; kind:'heat'|'final'; number:number; entries:Entry[]; order:string[]; left:Record<string,'dnf'|'dnr'>; times:number[]; done:Partial<Record<Step,boolean>> }
interface Day { teams:Team[]; races:Race[] }

const relays:Relay[]=[
  {code:'R22',name:'4x50m Relay',section:'Girl Cubs'},
  {code:'R21',name:'4x50m Relay',section:'Boy Cubs'},
  {code:'R27',name:'4x100m Relay',section:'Boy Scouts'}
];
const relayOf=(code:string)=>relays.find(relay=>relay.code===code)!;
const all=(value:boolean)=>[value,value,value,value];
let made=0;
const newId=(prefix:string)=>`${prefix}${++made}`;
function seedDay():Day {
  const team=(code:string,number:number,first:number,by:string,legs=4):Team=>({id:`${code}-t${number}`,code,number,legs:[0,1,2,3].map(leg=>leg<legs?first+leg:null),by});
  const teams=[
    ...[1,2,3,4,5,6,7].map(number=>team('R22',number,2000+number*10+1,number%2?'Aisha Noor':me)),team('R22',8,2081,'Aisha Noor',3),
    ...[1,2,3].map(number=>team('R21',number,1000+number*10+1,'Aisha Noor')),
    ...[1,2,3,4,5,6].map(number=>team('R27',number,3000+number*10+1,number<4?me:'Aisha Noor'))
  ];
  const id=(code:string,number:number)=>`${code}-t${number}`;
  const ran=(code:string,numbers:number[],times:number[]):Pick<Race,'entries'|'order'|'left'|'times'|'done'>=>
    ({entries:numbers.map(number=>({teamId:id(code,number),here:all(true)})),order:numbers.map(number=>id(code,number)),left:{},times,done:{runners:true,positions:true,times:true}});
  return {teams,races:[
    {id:'r22-h1',code:'R22',kind:'heat',number:1,...ran('R22',[3,1,4,2],[5240,5391,5502,5677])},
    {id:'r22-h2',code:'R22',kind:'heat',number:2,entries:[{teamId:id('R22',5),here:[true,true,false,false]},{teamId:id('R22',6),here:all(false)}],order:[],left:{},times:[],done:{}},
    {id:'r27-h1',code:'R27',kind:'heat',number:1,...ran('R27',[2,1,3],[6120,6233,6410])},
    {id:'r27-h2',code:'R27',kind:'heat',number:2,...ran('R27',[5,4,6],[6188,6302,6555])},
    {id:'r27-f',code:'R27',kind:'final',number:0,entries:[2,5,1,4,3,6].map((number,index)=>({teamId:id('R27',number),here:all(true),seed:index+1,absent:number===6})),order:[],left:{},times:[],done:{}}
  ]};
}

/** A step's status, as the heat chips and step strip read it. */
function stepStatus(race:Race,step:Step):StepStatus {
  const entries=race.entries.filter(entry=>!entry.absent).length,placed=race.order.length+Object.keys(race.left).length;
  const count=step==='runners'?entries:step==='positions'?placed:race.times.length;
  const state=race.done[step]?'done':count?'in progress':'not started';
  return {state,count,expected:step==='runners'?null:Math.max(entries,race.order.length),version:1,by:null} as StepStatus;
}
function summary(race:Race):RaceSummary {
  const steps:Step[]=race.kind==='final'?['runners','positions']:['runners','positions','times'];
  const saved=steps.every(step=>race.done[step]);
  return {id:race.id,kind:race.kind,number:race.number,state:saved?'saved':'open',createdAt:'',updatedAt:'',steps:Object.fromEntries(steps.map(step=>[step,stepStatus(race,step)]))} as RaceSummary;
}
const heatsOf=(day:Day,code:string)=>day.races.filter(race=>race.code===code).sort((a,b)=>(a.kind==='final'?1:0)-(b.kind==='final'?1:0) || a.number-b.number);
function group(day:Day,relay:Relay):RaceGroup {
  const races=heatsOf(day,relay.code),heats=races.filter(race=>race.kind==='heat');
  return {event:{id:relay.code,code:relay.code,name:relay.name,section:relay.section,format:'heats',type:'relays'} as DayEvent,races:races.map(summary),
    nextHeat:heats.length+1,heatsOpen:!races.some(race=>race.kind==='final'),updatedAt:'',
    finalAvailable:heats.length>0 && !races.some(race=>race.kind==='final') && heats.every(race=>race.done.times)};
}
/** Teams in no heat yet (a team marked Didn't run goes back to still to run). */
const stillToRun=(day:Day,code:string)=>day.teams.filter(team=>team.code===code && !day.races.some(race=>race.kind==='heat' && race.entries.some(entry=>entry.teamId===team.id) && race.left[team.id]!=='dnr'));
const inRace=(day:Day,team:Team)=>day.races.find(race=>race.kind==='heat' && race.entries.some(entry=>entry.teamId===team.id));
const legsText=(team:Team)=>team.legs.map(leg=>leg??'–').join(' · ');
const filled=(team:Team)=>team.legs.filter(leg=>leg!==null).length;
const lastLeg=(team:Team)=>team.legs[3];

/** The phone's number pad box, as on the race steps: stays focused between entries; Enter is Next. */
function Digits({id,label,value,onChange,onEnter,warn=false,hint,autoFocus=true}:{id:string;label:string;value:string;onChange:(digits:string)=>void;onEnter:()=>void;warn?:boolean;hint?:ReactNode;autoFocus?:boolean}) {
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(autoFocus) input.current?.focus({preventScroll:true});},[]);
  return <div className={warn?'rz-field rz-field--warn':'rz-field'}>
    <label className="rz-field__label" htmlFor={id}>{label}</label>
    <input ref={input} className="rz-field__input" id={id} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" value={value} readOnly={warn}
      onChange={event=>onChange(digitsOnly(event.target.value))} onKeyDown={event=>{if(event.key==='Enter') {event.preventDefault();onEnter();}}}/>
    {hint && <p className="rz-field__hint">{hint}</p>}
  </div>;
}
/** A leg's wristband checked as the team list checks it: a number already in this relay is refused; a wrong section or unknown number warns. */
function legCheck(day:Day,relay:Relay,number:number,teamId:string|null,typed:Array<number|null>):{refused?:string;warning?:string} {
  const other=day.teams.find(team=>team.code===relay.code && team.id!==teamId && team.legs.includes(number));
  if(other) return {refused:`${number} is already in Team ${other.number}. Each child runs for one team.`};
  if(typed.includes(number)) return {refused:`${number} is already in this team.`};
  const warning=wristbandWarnings(number,relay.section)[0];
  return warning?{warning:plainWristbandWarning(warning,number,relay.section)}:{};
}
const nextNumber=(day:Day,code:string)=>Math.max(0,...day.teams.filter(team=>team.code===code).map(team=>team.number))+1;

/** One leg box at a time (variant A's New team screen): "Team 9 · 2nd leg: wristband number?" */
function LegByLeg({day,relay,team,onSave,onCancel,note}:{day:Day;relay:Relay;team:Team|null;onSave:(legs:Array<number|null>)=>void;onCancel:()=>void;note?:string}) {
  const [legs,setLegs]=useState<Array<number|null>>(team?.legs??[]);
  const [at,setAt]=useState(team?null:0),[typed,setTyped]=useState(''),[held,setHeld]=useState<{refused?:string;warning?:string}|null>(null);
  const number=team?.number??nextNumber(day,relay.code);
  function next(keep=false) {
    const value=Number(typed);
    if(!typed || at===null) return;
    const check=legCheck(day,relay,value,team?.id??null,legs.filter((_,index)=>index!==at));
    if(!keep && (check.refused || check.warning)) {setHeld(check);return;}
    const updated=[...legs];updated[at]=value;setLegs(updated);setTyped('');setHeld(null);
    const empty=[0,1,2,3].find(index=>updated[index]==null);
    setAt(empty===undefined?null:empty);
  }
  const done=at===null;
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{relay.name} · {relay.section}{note?` · ${note}`:''}</p>
        <h2 className="rz-prompt__q">{done?`Team ${number}: all four legs`:<>Team {number} · {ordinal(at+1)} leg: wristband?</>}</h2></div>
      <ol className="proto-legs" aria-label={`Team ${number} legs`}>{[0,1,2,3].map(index=><li key={index}>
        <button type="button" className={`proto-leg${index===at?' proto-leg--current':''}${legs[index]==null?' proto-leg--empty':''}`} onMouseDown={event=>event.preventDefault()}
          onClick={()=>{setAt(index);setTyped(legs[index]!=null?String(legs[index]):'');setHeld(null);}}>
          <span className="proto-leg__ord">{ordinal(index+1)} leg</span><span className="proto-leg__num">{index===at?typed||'?':legs[index]??'–'}</span></button></li>)}</ol>
      {!done && <Digits id="leg" label={`${ordinal(at+1)} leg wristband`} value={typed} warn={!!held} onChange={setTyped} onEnter={()=>next()} hint="Type each child's wristband in running order. Tap a leg above to change it."/>}
      {held && <Callout message={held.refused??held.warning} actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={()=>setHeld(null)}>Fix number</button>{!held.refused && <button type="button" className="rz-btn" onClick={()=>next(true)}>Keep</button>}</>}/>}
      {done && <p className="rz-note">A team short of four can still be saved: it runs short and a lead checks it.</p>}
    </main>
    <footer className="rz-footer rz-footer--sticky"><div className="rz-footer__pair">
      <button type="button" className="rz-btn" onClick={onCancel}>Cancel</button>
      {done || legs.some(leg=>leg!=null) && at!==null && !typed?<button type="button" className="rz-btn rz-btn--primary" disabled={!legs.some(leg=>leg!=null)} onClick={()=>onSave([0,1,2,3].map(index=>legs[index]??null))}>Save team {number}</button>
        :<button type="button" className="rz-btn rz-btn--primary" disabled={!typed || !!held} onMouseDown={event=>event.preventDefault()} onClick={()=>next()}>Next</button>}
    </div></footer>
  </>;
}
/** Four boxes at once (variant B's sheet, variant C inline). */
function FourBoxes({day,relay,team,onSave,onCancel,compact=false}:{day:Day;relay:Relay;team:Team|null;onSave:(legs:Array<number|null>)=>void;onCancel:()=>void;compact?:boolean}) {
  const [legs,setLegs]=useState<string[]>(team?team.legs.map(leg=>leg==null?'':String(leg)):['','','','']);
  const [kept,setKept]=useState<number[]>([]);
  const numbers=legs.map(leg=>leg?Number(leg):null);
  const checks=numbers.map((value,index)=>value===null?{}:legCheck(day,relay,value,team?.id??null,numbers.filter((_,other)=>other!==index)));
  const waiting=checks.findIndex((check,index)=>check.refused || check.warning && !kept.includes(numbers[index]!));
  const number=team?.number??nextNumber(day,relay.code),box=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(compact) box.current?.scrollIntoView({block:'center'});},[]);
  return <div ref={box} className={compact?'proto-four proto-four--compact':'proto-four'}>
    {!compact && <p className="rz-field__hint">Type each child's wristband in running order, 1st leg first.</p>}
    <div className="proto-four__boxes">{legs.map((value,index)=>{
      const check=checks[index]!,warn=!!check.refused || !!check.warning && !kept.includes(numbers[index]!);
      return <label key={index} className={warn?'proto-box proto-box--warn':'proto-box'}><span>{ordinal(index+1)} leg</span>
        <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" autoFocus={index===0 && !team} value={value} placeholder="Wristband"
          onChange={event=>{const next=[...legs];next[index]=digitsOnly(event.target.value);setLegs(next);}}/></label>;
    })}</div>
    {waiting>=0 && <Callout message={checks[waiting]!.refused??checks[waiting]!.warning} actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={()=>{const next=[...legs];next[waiting]='';setLegs(next);}}>Fix number</button>
      {!checks[waiting]!.refused && <button type="button" className="rz-btn" onClick={()=>setKept([...kept,numbers[waiting]!])}>Keep</button>}</>}/>}
    <div className="rz-footer__pair">
      <button type="button" className="rz-btn" onClick={onCancel}>Cancel</button>
      <button type="button" className="rz-btn rz-btn--primary" disabled={!numbers.some(leg=>leg!==null) || waiting>=0} onClick={()=>onSave(numbers)}>Save team {number}</button>
    </div>
  </div>;
}

/** The centred popup tile when Edit team is tapped on a team someone else set (Relays tab only). */
function ChangeAnyway({team,onChange,onCancel}:{team:Team;onChange:()=>void;onCancel:()=>void}) {
  return <div className="rz-scrim proto-centre" onClick={event=>{if(event.target===event.currentTarget) onCancel();}}>
    <div className="proto-popup" role="alertdialog" aria-modal="true" aria-labelledby="proto-anyway">
      <p className="proto-popup__text" id="proto-anyway"><strong>{team.by}</strong> has already set this team.</p>
      <p className="proto-popup__meta">Team {team.number} · {legsText(team)}</p>
      <div className="rz-footer__pair"><button type="button" className="rz-btn" onClick={onCancel}>Cancel</button><button type="button" className="rz-btn rz-btn--primary" onClick={onChange}>Change anyway</button></div>
    </div>
  </div>;
}
/** "+ New team" or "+ Team not on the list" asks which relay when it has none yet. */
function PickRelay({title,onPick,onClose}:{title:string;onPick:(code:string)=>void;onClose:()=>void}) {
  return <Sheet title={title} onClose={onClose}>
    <fieldset><legend className="rz-field__label">Relay</legend><div className="rz-choices rz-choices--grid">
      {relays.map(relay=><button key={relay.code} type="button" className="rz-choice" onClick={()=>onPick(relay.code)}>{relay.name} · {relay.section}</button>)}
    </div></fieldset>
  </Sheet>;
}

type View={kind:'home'}|{kind:'teams';code:string}|{kind:'team';code:string;teamId:string|null;raceId?:string}|{kind:'race';id:string};
function firstVariant():Variant {
  const asked=new URLSearchParams(location.search).get('variant');
  return asked==='B' || asked==='C' || asked==='D'?asked:'A';
}
export function RelaysPrototype() {
  const [variant,setVariant]=useState<Variant>(firstVariant);
  const [day,setDay]=useState(seedDay);
  const [role,setRole]=useState<Role>(()=>(new URLSearchParams(location.search).get('role') as Role|null)??'start');
  const [view,setView]=useState<View>(()=>{const race=new URLSearchParams(location.search).get('race');return race?{kind:'race',id:race}:{kind:'home'};});
  const [roleSheet,setRoleSheet]=useState(false);
  const [toast,setToast]=useState('');
  useEffect(()=>{document.body.classList.toggle('proto-nocodes',role!=='lead');},[role]);
  useEffect(()=>{if(!toast) return;const timer=setTimeout(()=>setToast(''),5000);return ()=>clearTimeout(timer);},[toast]);
  function cycle(step:number) {
    const keys:Variant[]=['A','B','C','D'],next=keys[(keys.indexOf(variant)+step+keys.length)%keys.length]!;
    const params=new URLSearchParams(location.search);params.set('variant',next);history.replaceState(null,'',`${location.pathname}?${params}`);setVariant(next);
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.target instanceof HTMLInputElement) return;if(event.key==='ArrowLeft') cycle(-1);if(event.key==='ArrowRight') cycle(1);};
    addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);
  });
  const update=(change:(day:Day)=>Day)=>setDay(current=>change(structuredClone(current)));
  function saveTeam(code:string,teamId:string|null,legs:Array<number|null>,raceId?:string) {
    update(next=>{
      let team=next.teams.find(item=>item.id===teamId);
      if(team) team.legs=legs;
      else {team={id:newId(`${code}-new`),code,number:nextNumber(next,code),legs,by:me};next.teams.push(team);}
      const race=next.races.find(item=>item.id===raceId);
      if(race && !race.entries.some(entry=>entry.teamId===team!.id)) race.entries.push({teamId:team.id,here:all(false)});
      return next;
    });
  }
  function createRace(code:string,kind:'heat'|'final') {
    const id=newId(`${code}-race`);
    update(next=>{
      const heats=next.races.filter(race=>race.code===code && race.kind==='heat');
      const entries:Entry[]=kind==='final'?heats.flatMap(race=>race.order.map((teamId,index)=>({teamId,time:race.times[index]??Infinity}))).sort((a,b)=>a.time-b.time).slice(0,6)
        .map(({teamId},index)=>({teamId,here:all(true),seed:index+1})):[];
      next.races.push({id,code,kind,number:kind==='final'?0:heats.length+1,entries,order:[],left:{},times:[],done:{}});
      return next;
    });
    setView({kind:'race',id});
  }
  function markDone(race:Race,step:Step) {
    update(next=>{next.races.find(item=>item.id===race.id)!.done[step]=true;return next;});
    if(role!=='lead') {setToast(`${stepLabels[step]} saved · ${relayOf(race.code).section} ${raceName(race)}`);setView({kind:'home'});}
  }
  const ctx:Ctx={day,variant,role,update,saveTeam,createRace,markDone,go:setView,openRole:()=>setRoleSheet(true)};
  const screen=view.kind==='race'?<RaceView key={view.id} ctx={ctx} raceId={view.id}/>
    :view.kind==='team'?<TeamScreen ctx={ctx} code={view.code} teamId={view.teamId} raceId={view.raceId}/>
    :view.kind==='teams'?<TeamListScreen ctx={ctx} code={view.code}/>
    :<RelaysHome ctx={ctx}/>;
  return <Screen screen="Relays prototype" wide={view.kind==='home'}>
    {screen}
    {toast && <div className="rz-toast" role="status"><span className="rz-toast__msg"><Icon name="check"/>{toast}</span><button type="button" onClick={()=>setToast('')}>Undo</button></div>}
    {roleSheet && <Sheet title="Your job" onClose={()=>setRoleSheet(false)}><div className="rz-choices rz-choices--grid">
      {(['start','finish','timer','lead'] as Role[]).map(item=><button key={item} type="button" className="rz-choice" aria-pressed={item===role} onClick={()=>{setRole(item);setRoleSheet(false);}}>{roleLabels[item]}</button>)}
    </div></Sheet>}
    <div className="proto-switcher" aria-label="Prototype variant"><button type="button" aria-label="Previous variant" onClick={()=>cycle(-1)}>‹</button>
      <span>{variant} · {variantNames[variant]}</span><button type="button" aria-label="Next variant" onClick={()=>cycle(1)}>›</button>
      <button type="button" className="proto-switcher__reset" aria-label="Start the day again" onClick={()=>{setDay(seedDay());setView({kind:'home'});}}>↺</button></div>
  </Screen>;
}
interface Ctx { day:Day; variant:Variant; role:Role; update:(change:(day:Day)=>Day)=>void; saveTeam:(code:string,teamId:string|null,legs:Array<number|null>,raceId?:string)=>void;
  createRace:(code:string,kind:'heat'|'final')=>void; markDone:(race:Race,step:Step)=>void; go:(view:View)=>void; openRole:()=>void }

/** The Relays tab, in the race flow's look: one card per relay, its heat chips, and its teams the variant's way. */
function RelaysHome({ctx}:{ctx:Ctx}) {
  const {day,variant,role}=ctx;
  const [newRelay,setNewRelay]=useState(false),[pickFor,setPickFor]=useState(false);
  const [segment,setSegment]=useState<'races'|'teams'>('races');
  const [open,setOpen]=useState<string|null>(null),[typing,setTyping]=useState<{code:string;teamId:string|null}|null>(null),[sheet,setSheet]=useState<{code:string;teamId:string|null}|null>(null);
  const [asking,setAsking]=useState<Team|null>(null),[teamsSheet,setTeamsSheet]=useState<string|null>(null);
  const groups=relays.map(relay=>group(day,relay));
  /** Edit team on the Relays tab: someone else's team asks first. */
  const edit=(team:Team)=>team.by===me?openEditor(team.code,team.id):setAsking(team);
  function openEditor(code:string,teamId:string|null) {
    if(variant==='A') ctx.go({kind:'team',code,teamId});
    else if(variant==='B') setSheet({code,teamId});
    else if(variant==='D') {setTeamsSheet(code);setSheet({code,teamId});}
    else {setOpen(code);setTyping({code,teamId});}
  }
  const teamRows=(code:string)=>{
    const teams=day.teams.filter(team=>team.code===code);
    return <ul className="proto-teamrows" aria-label="Teams">{teams.map(team=>{
      const race=inRace(day,team);
      return typing?.teamId===team.id?<li key={team.id}><FourBoxes compact day={day} relay={relayOf(code)} team={team} onCancel={()=>setTyping(null)} onSave={legs=>{ctx.saveTeam(code,team.id,legs);setTyping(null);}}/></li>
        :<li key={team.id} className="proto-teamrow"><span className="proto-teamrow__num">{team.number}</span>
          <span className="proto-teamrow__legs">{legsText(team)}{filled(team)<4 && <em> · {filled(team)} of 4</em>}<small>{race?`${raceName(race)}${race.done.times?' · ran':' · change at check-in'}`:'Still to run'}</small></span>
          {!race && <button type="button" className="rz-btn rz-btn--small" onClick={()=>edit(team)}>Edit</button>}</li>;
    })}
    {variant==='C' && (typing?.code===code && typing.teamId===null?<li><FourBoxes compact day={day} relay={relayOf(code)} team={null} onCancel={()=>setTyping(null)} onSave={legs=>{ctx.saveTeam(code,null,legs);setTyping(null);}}/></li>
      :<li><button type="button" className="rz-btn rz-btn--small proto-addrow" onClick={()=>setTyping({code,teamId:null})}><Icon name="plus"/>New team</button></li>)}
    </ul>;
  };
  const card=(group:RaceGroup)=>{
    const code=group.event.code,teams=day.teams.filter(team=>team.code===code),toRun=stillToRun(day,code).length;
    const status=!group.races.length?teams.length?`${teams.length} teams ready · no heats yet`:'No teams yet':group.races.every(race=>race.state==='saved')?'Every race saved':!toRun?'Every team has run a heat':`${toRun} ${toRun===1?'team':'teams'} still to run`;
    return <article key={code} className="rz-racecard" aria-label={`${group.event.name} · ${group.event.section}`}>
      <div className="rz-racecard__head"><h3 className="rz-racecard__title">{group.event.name} · {group.event.section}</h3><span className="rz-code-tag">{code}</span></div>
      <p className="rz-racecard__status">{status}</p>
      {group.races.length>0 && <HeatChips races={group.races} role={role} nextHeat={group.nextHeat} onRace={id=>ctx.go({kind:'race',id})}
        onAdd={group.heatsOpen?()=>ctx.createRace(code,'heat'):undefined} onFinal={group.finalAvailable?()=>ctx.createRace(code,'final'):undefined}/>}
      {(variant==='A' || variant==='D') && <button type="button" className="proto-cardlink" onClick={()=>variant==='A'?ctx.go({kind:'teams',code}):setTeamsSheet(code)}><span>Teams <strong>{teams.length}</strong>{toRun>0 && ` · ${toRun} still to run`}</span><Icon name="chevron-right"/></button>}
      {variant==='C' && <details className="proto-carddetails" open={open===code} onToggle={event=>{const now=(event.target as HTMLDetailsElement).open;if(now) setOpen(code);else if(open===code) setOpen(null);}}>
        <summary>Teams ({teams.length}){toRun>0 && ` · ${toRun} still to run`}</summary>{teamRows(code)}</details>}
    </article>;
  };
  return <>
    <HomeBar><RoleChip role={role} onOpen={ctx.openRole}/><Avatar name={me} onOpen={()=>{}}/></HomeBar>
    <EventTabs tab="relays" onTab={()=>{}}/>
    {variant==='B' && <div className="proto-segment" role="tablist" aria-label="Relays">{(['races','teams'] as const).map(key=>
      <button key={key} type="button" role="tab" aria-selected={segment===key} onClick={()=>setSegment(key)}>{key==='races'?'Races':`Teams (${day.teams.length})`}</button>)}</div>}
    <main className="rz-main rz-main--cards">
      {variant==='B' && segment==='teams'?relays.map(relay=><section key={relay.code} className="proto-teamsection">
        <div className="rz-heading-row"><h2 className="rz-section">{relay.name} · {relay.section}</h2><button type="button" className="rz-btn rz-btn--small" onClick={()=>setSheet({code:relay.code,teamId:null})}><Icon name="plus"/>Team</button></div>
        {teamRows(relay.code)}</section>)
        :<>
          <h2 className="rz-section">In progress</h2>{groups.filter(item=>item.races.some(race=>race.state!=='saved')).map(card)}
          <h2 className="rz-section">Teams ready, no heats yet</h2>{groups.filter(item=>!item.races.length).map(card)}
          {groups.some(item=>item.races.length && item.races.every(race=>race.state==='saved')) && <><h2 className="rz-section">Done</h2>{groups.filter(item=>item.races.length && item.races.every(race=>race.state==='saved')).map(card)}</>}
        </>}
    </main>
    <footer className="rz-footer rz-footer--sticky rz-footer--home"><div className="rz-footer__pair">
      <button type="button" className="rz-btn" onClick={()=>setPickFor(true)}><Icon name="plus"/>New team</button>
      <button type="button" className="rz-btn rz-btn--primary" onClick={()=>setNewRelay(true)}><Icon name="plus"/>New relay</button>
    </div></footer>
    {newRelay && <NewRaceSheet groups={groups} choice={{}} onClose={()=>setNewRelay(false)} onCreate={choice=>{setNewRelay(false);ctx.createRace(choice.eventCode,choice.kind);}}/>}
    {pickFor && <PickRelay title="New team" onClose={()=>setPickFor(false)} onPick={code=>{setPickFor(false);if(variant==='B') setSegment('teams');openEditor(code,null);}}/>}
    {teamsSheet && <TeamsSheet day={day} code={teamsSheet} editing={sheet?.code===teamsSheet?sheet:null} onClose={()=>{setTeamsSheet(null);setSheet(null);}}
      onTeam={edit} onNew={()=>setSheet({code:teamsSheet,teamId:null})} onDone={()=>setSheet(null)} onSave={(teamId,legs)=>{ctx.saveTeam(teamsSheet,teamId,legs);setSheet(null);}}/>}
    {sheet && variant!=='D' && <Sheet title={sheet.teamId?`Edit team ${day.teams.find(team=>team.id===sheet.teamId)!.number}`:`New team · ${relayOf(sheet.code).name} ${relayOf(sheet.code).section}`} onClose={()=>setSheet(null)}>
      <FourBoxes day={day} relay={relayOf(sheet.code)} team={day.teams.find(team=>team.id===sheet.teamId)??null} onCancel={()=>setSheet(null)} onSave={legs=>{ctx.saveTeam(sheet.code,sheet.teamId,legs);setSheet(null);}}/></Sheet>}
    {asking && <ChangeAnyway team={asking} onCancel={()=>setAsking(null)} onChange={()=>{setAsking(null);openEditor(asking.code,asking.id);}}/>}
  </>;
}
/**
 * Variant D (the owner's answer, 29 Oct): the card's Teams row opens a bottom sheet with every team and its four
 * members; tapping a team, or New team, turns the same sheet into the four leg boxes, and Save or Cancel comes back.
 */
function TeamsSheet({day,code,editing,onClose,onTeam,onNew,onDone,onSave}:{day:Day;code:string;editing:{teamId:string|null}|null;onClose:()=>void;onTeam:(team:Team)=>void;
  onNew:()=>void;onDone:()=>void;onSave:(teamId:string|null,legs:Array<number|null>)=>void}) {
  const relay=relayOf(code),teams=day.teams.filter(team=>team.code===code),team=editing?.teamId?teams.find(item=>item.id===editing.teamId)!:null;
  if(editing) return <Sheet title={team?`Edit team ${team.number}`:`New team ${nextNumber(day,code)}`} onClose={onClose}>
    <p className="rz-field__hint">{relay.name} · {relay.section}</p>
    <FourBoxes key={editing.teamId??'new'} day={day} relay={relay} team={team} onCancel={onDone} onSave={legs=>onSave(editing.teamId,legs)}/></Sheet>;
  return <Sheet title={`${relay.name} · ${relay.section}`} onClose={onClose}>
    <p className="rz-field__hint">{teams.length} teams · {stillToRun(day,code).length} still to run. Tap a team still to run to change it.</p>
    <ul className="proto-list proto-sheetlist">{teams.map(item=>{
      const race=inRace(day,item),body=<>
        <span className="proto-member__head"><strong>Team {item.number}</strong><small>{race?`${raceName(race)}${race.done.times?' · ran':' · change it at check-in'}`:filled(item)<4?`Still to run · ${filled(item)} of 4`:'Still to run'}</small>{!race && <Icon name="pencil"/>}</span>
        <span className="proto-members">{item.legs.map((leg,index)=><span key={index} className={leg===null?'proto-member proto-member--empty':'proto-member'}><small>{ordinal(index+1)}</small>{leg??'–'}</span>)}</span></>;
      return <li key={item.id}>{race?<div className="proto-memberrow proto-memberrow--ran">{body}</div>:<button type="button" className="proto-memberrow" onClick={()=>onTeam(item)}>{body}</button>}</li>;
    })}</ul>
    <button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={onNew}><Icon name="plus"/>New team</button>
  </Sheet>;
}
/** Variant A: a relay's team list, its own screen from the card. */
function TeamListScreen({ctx,code}:{ctx:Ctx;code:string}) {
  const {day}=ctx,relay=relayOf(code),teams=day.teams.filter(team=>team.code===code);
  const [asking,setAsking]=useState<Team|null>(null);
  return <>
    <RaceBar title={`${relay.name} · ${relay.section}`} code={code} onBack={()=>ctx.go({kind:'home'})}><RoleChip role={ctx.role} onOpen={ctx.openRole}/></RaceBar>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{teams.length} teams · {stillToRun(day,code).length} still to run</p><h2 className="rz-prompt__q">Teams</h2></div>
      <ul className="proto-list">{teams.map(team=>{const race=inRace(day,team);return <li key={team.id}>
        <div className="rz-listrow"><span className="rz-listrow__main"><span className="rz-listrow__label">Team {team.number}</span>
          <span className="rz-listrow__meta">{legsText(team)}{filled(team)<4?` · ${filled(team)} of 4`:''}</span>
          <span className="rz-listrow__meta">{race?`${raceName(race)}${race.done.times?', ran':', change it at check-in'}`:`Still to run · set by ${team.by===me?'you':team.by}`}</span></span>
          {!race && <button type="button" className="rz-btn rz-btn--small" onClick={()=>team.by===me?ctx.go({kind:'team',code,teamId:team.id}):setAsking(team)}>Edit</button>}</div></li>;})}</ul>
    </main>
    <footer className="rz-footer rz-footer--sticky"><button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>ctx.go({kind:'team',code,teamId:null})}><Icon name="plus"/>New team</button></footer>
    {asking && <ChangeAnyway team={asking} onCancel={()=>setAsking(null)} onChange={()=>{setAsking(null);ctx.go({kind:'team',code,teamId:asking.id});}}/>}
  </>;
}
/** Variant A: New team (or Edit team) as its own screen, typed leg by leg. */
function TeamScreen({ctx,code,teamId,raceId}:{ctx:Ctx;code:string;teamId:string|null;raceId?:string}) {
  const relay=relayOf(code),team=ctx.day.teams.find(item=>item.id===teamId)??null;
  const back=()=>ctx.go(raceId?{kind:'race',id:raceId}:{kind:'teams',code});
  return <>
    <RaceBar title={team?`Edit team ${team.number}`:'New team'} code={code} onBack={back}><RoleChip role={ctx.role} onOpen={ctx.openRole}/></RaceBar>
    <LegByLeg day={ctx.day} relay={relay} team={team} note={raceId?'joins this heat':undefined} onCancel={back} onSave={legs=>{ctx.saveTeam(code,teamId,legs,raceId);back();}}/>
  </>;
}

/** A relay race: the race shell (app bar, heat chips, steps) with the step for my role, or every step for a lead. */
function RaceView({ctx,raceId}:{ctx:Ctx;raceId:string}) {
  const {day,role}=ctx,race=day.races.find(item=>item.id===raceId)!,relay=relayOf(race.code),g=group(day,relay);
  const [tab,setTab]=useState<Step>('runners'),[viewing,setViewing]=useState<Step|null>(null);
  const own=role==='lead'?null:roleSteps[role],steps:Step[]=race.kind==='final'?['runners','positions']:['runners','positions','times'];
  const step=role==='lead'?tab:viewing??own!;
  const change=(edit:(race:Race)=>void)=>ctx.update(next=>{edit(next.races.find(item=>item.id===raceId)!);return next;});
  const props:StepBody={ctx,race,relay,change,done:(at:Step)=>ctx.markDone(race,at)};
  return <>
    <RaceBar title={`${relay.name} · ${relay.section}`} code={relay.code} onBack={()=>ctx.go({kind:'home'})}><RoleChip role={role} onOpen={ctx.openRole}/></RaceBar>
    <nav className="rz-heats-nav" aria-label="Heats"><HeatChips races={g.races} role={role} current={race.id} nextHeat={g.nextHeat} onRace={id=>ctx.go({kind:'race',id})}
      onAdd={g.heatsOpen?()=>ctx.createRace(relay.code,'heat'):undefined} onFinal={g.finalAvailable?()=>ctx.createRace(relay.code,'final'):undefined}/></nav>
    <StepStrip race={summary(race)} role={role} label={`${raceName(race)} steps`} selected={step} onSelect={role==='lead'?setTab:at=>setViewing(at===own?null:at)}/>
    {own && step!==own?<main className="rz-main"><div className="rz-readonly" role="status"><p className="rz-readonly__text"><Icon name="eye"/><span>Viewing {stepLabels[step]} · read-only.</span></p>
      <div className="rz-readonly__actions"><button type="button" className="rz-btn rz-btn--small rz-btn--primary" onClick={()=>setViewing(null)}>Back to {stepLabels[own]}</button></div></div></main>
      :step==='runners'?(race.kind==='final'?<FinalHere {...props}/>:ctx.variant==='A' || ctx.variant==='D'?<StartA {...props}/>:ctx.variant==='B'?<StartB {...props}/>:<StartC {...props}/>)
      :step==='positions'?<FinishLine {...props}/>:steps.includes('times')?<Timer {...props}/>:null}
  </>;
}
interface StepBody { ctx:Ctx; race:Race; relay:Relay; change:(edit:(race:Race)=>void)=>void; done:(step:Step)=>void }
const teamOf=(day:Day,id:string)=>day.teams.find(team=>team.id===id)!;
const shortNote=(team:Team)=>filled(team)<4?<span className="rz-tag rz-tag--kept">Runs short · {filled(team)} of 4</span>:null;

/** "+ New team" at check-in: a missed team, typed in leg order, joins the list and this heat. Each variant its own way. */
function useNewTeamAtCheckIn({ctx,race,relay}:StepBody) {
  const [typing,setTyping]=useState<string|null|false>(false);
  const open=(teamId:string|null)=>ctx.variant==='A'?ctx.go({kind:'team',code:relay.code,teamId,raceId:race.id}):setTyping(teamId);
  const editor=typing!==false && (ctx.variant==='B' || ctx.variant==='D'
    ?<Sheet title={typing?`Edit team ${teamOf(ctx.day,typing).number}`:'New team · joins this heat'} onClose={()=>setTyping(false)}>
      <FourBoxes day={ctx.day} relay={relay} team={typing?teamOf(ctx.day,typing):null} onCancel={()=>setTyping(false)} onSave={legs=>{ctx.saveTeam(relay.code,typing,legs,race.id);setTyping(false);}}/></Sheet>
    :<FourBoxes compact day={ctx.day} relay={relay} team={typing?teamOf(ctx.day,typing):null} onCancel={()=>setTyping(false)} onSave={legs=>{ctx.saveTeam(relay.code,typing,legs,race.id);setTyping(false);}}/>);
  return {open,editor,typing};
}
/** Variant A start line: teams in this heat, each with its four legs to mark Here; teams still to run below, each with Add. */
function StartA(props:StepBody) {
  const {ctx,race,change,done}=props,day=ctx.day,toRun=stillToRun(day,race.code),added=useNewTeamAtCheckIn(props);
  const here=race.entries.reduce((sum,entry)=>sum+entry.here.filter(Boolean).length,0);
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · {race.entries.length} teams · {here} children here</p><h2 className="rz-prompt__q">Which teams are running?</h2></div>
      {race.entries.map(entry=>{const team=teamOf(day,entry.teamId);return <section key={team.id} className="proto-teamcard" aria-label={`Team ${team.number}`}>
        <div className="proto-teamcard__head"><strong>Team {team.number}</strong>{shortNote(team)}
          <span className="proto-teamcard__actions"><button type="button" className="rz-btn rz-btn--small" onClick={()=>added.open(team.id)}>Edit</button>
            {!entry.here.some(Boolean) && <button type="button" className="rz-btn rz-btn--small" onClick={()=>change(next=>{next.entries=next.entries.filter(item=>item.teamId!==team.id);})}>Take off</button>}</span></div>
        <ul className="rz-attendance">{team.legs.map((leg,index)=>leg===null?null:<li key={index} className={entry.here[index]?undefined:'is-absent'}>
          <span className="rz-attendance__who"><span className="rz-attendance__seed">{ordinal(index+1)} leg</span><span className="label">{leg}</span></span>
          <button type="button" className={entry.here[index]?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'} aria-pressed={entry.here[index]}
            onClick={()=>change(next=>{const item=next.entries.find(other=>other.teamId===team.id)!;item.here[index]=!item.here[index];})}>{entry.here[index]?'Here':'Not yet'}</button></li>)}</ul>
      </section>;})}
      {added.typing!==false && added.editor}
      <div className="rz-heading-row"><h3 className="rz-section">Still to run ({toRun.length})</h3><button type="button" className="rz-btn rz-btn--small" onClick={()=>added.open(null)}><Icon name="plus"/>New team</button></div>
      {toRun.length?<ul className="proto-list">{toRun.map(team=><li key={team.id}><div className="rz-listrow"><span className="rz-listrow__main"><span className="rz-listrow__label">Team {team.number}</span><span className="rz-listrow__meta">{legsText(team)}</span></span>
        <button type="button" className="rz-btn rz-btn--small rz-btn--primary" onClick={()=>change(next=>{next.entries.push({teamId:team.id,here:all(false)});})}><Icon name="plus"/>Add</button></div></li>)}</ul>
        :<p className="rz-empty">Every team on the list is in a heat. A missed team: New team.</p>}
    </main>
    <footer className="rz-footer rz-footer--sticky"><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!race.entries.length} onClick={()=>done('runners')}>That's everyone</button></footer>
  </>;
}
/** Variant B start line in two stages: pick the teams as tiles, then who is here, child by child. */
function StartB(props:StepBody) {
  const {ctx,race,change,done}=props,day=ctx.day,added=useNewTeamAtCheckIn(props);
  const [stage,setStage]=useState<'teams'|'here'>(race.entries.length?'here':'teams');
  const listed=[...race.entries.map(entry=>teamOf(day,entry.teamId)),...stillToRun(day,race.code)].sort((a,b)=>a.number-b.number);
  const ticked=(team:Team)=>race.entries.some(entry=>entry.teamId===team.id);
  const children=race.entries.flatMap(entry=>teamOf(day,entry.teamId).legs.map((leg,index)=>({entry,leg,index}))).filter(item=>item.leg!==null);
  if(stage==='teams') return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · step 1 of 2 · {race.entries.length} ticked</p><h2 className="rz-prompt__q">Which teams are running?</h2></div>
      <ul className="rz-runners proto-teamtiles">{listed.map(team=>{const on=ticked(team),entry=race.entries.find(item=>item.teamId===team.id);return <li key={team.id}>
        <button type="button" className={on?'rz-runner proto-tile--on':'rz-runner'} aria-pressed={on} disabled={on && entry!.here.some(Boolean)}
          onClick={()=>change(next=>{next.entries=on?next.entries.filter(item=>item.teamId!==team.id):[...next.entries,{teamId:team.id,here:all(false)}];})}>
          <small>Team</small>{team.number}{on && <Icon name="check"/>}</button></li>;})}</ul>
      <p className="rz-field__hint">Tap a team to put it in {raceName(race)}, tap again to take it off. A team not on the list: New team.</p>
    </main>
    <footer className="rz-footer rz-footer--sticky"><div className="rz-footer__pair">
      <button type="button" className="rz-btn" onClick={()=>added.open(null)}><Icon name="plus"/>New team</button>
      <button type="button" className="rz-btn rz-btn--primary" disabled={!race.entries.length} onClick={()=>setStage('here')}>Next: who is here</button></div></footer>
    {added.editor}
  </>;
  return <>
    <main className="rz-main">
      <div className="rz-heading-row"><div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · step 2 of 2 · {children.filter(item=>item.entry.here[item.index]).length} of {children.length} here</p><h2 className="rz-prompt__q">Who is here?</h2></div>
        <button type="button" className="rz-btn rz-btn--small" onClick={()=>setStage('teams')}>Teams</button></div>
      <ul className="rz-attendance">{children.map(({entry,leg,index})=>{const team=teamOf(day,entry.teamId),on=entry.here[index];return <li key={`${team.id}:${index}`} className={on?undefined:'is-absent'}>
        <span className="rz-attendance__who"><span className="rz-attendance__seed">Team {team.number} · {ordinal(index+1)} leg</span><span className="label">{leg}</span></span>
        <button type="button" className={on?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'} aria-pressed={on} onClick={()=>change(next=>{const item=next.entries.find(other=>other.teamId===team.id)!;item.here[index]=!item.here[index];})}>{on?'Here':'Not yet'}</button></li>;})}</ul>
    </main>
    <footer className="rz-footer rz-footer--sticky"><button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>done('runners')}>That's everyone</button></footer>
  </>;
}
/** Variant C start line: one tick list of the teams in this heat or still to run; a ticked team shows its four children to tap. */
function StartC(props:StepBody) {
  const {ctx,race,change,done}=props,day=ctx.day,added=useNewTeamAtCheckIn(props);
  const listed=[...race.entries.map(entry=>teamOf(day,entry.teamId)),...stillToRun(day,race.code)].sort((a,b)=>a.number-b.number);
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · {race.entries.length} teams ticked</p><h2 className="rz-prompt__q">Tick the teams, tap who is here</h2></div>
      <ul className="proto-ticklist">{listed.map(team=>{
        const entry=race.entries.find(item=>item.teamId===team.id);
        return <li key={team.id} className={entry?'proto-tick proto-tick--on':'proto-tick'}>
          <div className="proto-tick__row">
            <button type="button" className="proto-tick__box" aria-pressed={!!entry} disabled={!!entry?.here.some(Boolean)} aria-label={`Team ${team.number}${entry?', in this heat':''}`}
              onClick={()=>change(next=>{next.entries=entry?next.entries.filter(item=>item.teamId!==team.id):[...next.entries,{teamId:team.id,here:all(false)}];})}>{entry && <Icon name="check"/>}</button>
            <span className="proto-tick__label"><strong>Team {team.number}</strong>{!entry && <small>{legsText(team)}</small>}</span>
            {shortNote(team)}{entry && <button type="button" className="rz-btn rz-btn--small" onClick={()=>added.open(team.id)}>Edit</button>}
          </div>
          {added.typing===team.id && added.editor}
          {entry && added.typing!==team.id && <ul className="rz-chips proto-legchips">{team.legs.map((leg,index)=>leg===null?null:<li key={index}>
            <button type="button" className={entry.here[index]?'rz-chip proto-chip--here':'rz-chip'} aria-pressed={entry.here[index]} onClick={()=>change(next=>{const item=next.entries.find(other=>other.teamId===team.id)!;item.here[index]=!item.here[index];})}>
              <small>{ordinal(index+1)}</small>{leg}{entry.here[index] && <Icon name="check"/>}</button></li>)}</ul>}
        </li>;})}
        <li>{added.typing===null?added.editor:<button type="button" className="rz-btn rz-btn--small proto-addrow" onClick={()=>added.open(null)}><Icon name="plus"/>New team</button>}</li>
      </ul>
    </main>
    <footer className="rz-footer rz-footer--sticky"><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!race.entries.length} onClick={()=>done('runners')}>That's everyone</button></footer>
  </>;
}
/** A relay final's start line: the seeded teams, each Here or Absent (finals unchanged by the variants but for the team label). */
function FinalHere({ctx,race,change,done}:StepBody) {
  const here=race.entries.filter(entry=>!entry.absent).length;
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">Final · {here} of {race.entries.length} teams here</p><h2 className="rz-prompt__q">Which teams are here?</h2></div>
      <ul className="rz-attendance">{race.entries.map(entry=>{const team=teamOf(ctx.day,entry.teamId);return <li key={team.id} className={entry.absent?'is-absent':undefined}>
        <span className="rz-attendance__who"><span className="rz-attendance__seed">{ordinal(entry.seed!)} seed · {legsText(team)}</span><span className="label">{tileLabel(ctx.variant,team,true)}</span></span>
        <button type="button" className={entry.absent?'rz-btn rz-btn--pill':'rz-btn rz-btn--pill rz-btn--primary'} aria-pressed={!entry.absent}
          onClick={()=>change(next=>{const item=next.entries.find(other=>other.teamId===team.id)!;item.absent=!item.absent;})}>{entry.absent?'Absent':'Here'}</button></li>;})}</ul>
    </main>
    <footer className="rz-footer rz-footer--sticky"><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!here} onClick={()=>done('runners')}>That's everyone</button></footer>
  </>;
}
/** Which label is large on a team: A the team number, B the 4th leg's wristband (today), C both, side by side. */
function tileLabel(variant:Variant,team:Team,inline=false):ReactNode {
  const last=lastLeg(team);
  if(variant==='A' || variant==='D') return inline?`Team ${team.number}`:<><small>Team</small>{team.number}</>;
  if(variant==='B') return last===null?<>{`Team ${team.number}`}<small>no 4th leg</small></>:inline?`${last} (Team ${team.number})`:<>{last}<small>Team {team.number}</small></>;
  return inline?`Team ${team.number} · ${last??'no 4th leg'}`:<><span className="proto-both__team">Team {team.number}</span><span className="proto-both__leg">4th leg {last??'–'}</span></>;
}
/** Finish line: the places board over a tile per team, in the order the 4th leg crosses; then Check the order. */
function FinishLine({ctx,race,change,done}:StepBody) {
  const day=ctx.day,variant=ctx.variant,running=race.entries.filter(entry=>!entry.absent);
  const unplaced=running.filter(entry=>!race.order.includes(entry.teamId) && !race.left[entry.teamId]);
  const [mode,setMode]=useState<'place'|'check'>(running.length && !unplaced.length?'check':'place');
  const [picking,setPicking]=useState(false);
  useEffect(()=>{if(mode==='place' && running.length && !unplaced.length) setMode('check');},[unplaced.length]);
  const slots=Math.max(running.length,race.order.length),current=race.order.length;
  const label=(id:string)=>tileLabel(variant,teamOf(day,id),true);
  const picker=picking && <Sheet title="Team not on the list" onClose={()=>setPicking(false)}>
    <p className="rz-field__hint">Teams still to run in this relay. Tap the team that crossed the line.</p>
    {!stillToRun(day,race.code).length && <p className="rz-empty">Every team on the list is in a heat. A team nobody typed is added at the start line, with New team.</p>}
    <ul className="proto-list">{stillToRun(day,race.code).map(team=><li key={team.id}><button type="button" className="rz-listrow" onClick={()=>{change(next=>{next.entries.push({teamId:team.id,here:all(true),atFinish:true});});setPicking(false);setMode('place');}}>
      <span className="rz-listrow__main"><span className="rz-listrow__label">Team {team.number}</span><span className="rz-listrow__meta">4th leg {lastLeg(team)??'–'} · {legsText(team)}</span></span><Icon name="plus"/></button></li>)}</ul>
  </Sheet>;
  if(mode==='check') {
    const left=running.filter(entry=>!race.order.includes(entry.teamId));
    return <>
      <main className="rz-main">
        <div className="rz-heading-row"><div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · the order the 4th legs crossed</p><h2 className="rz-prompt__q">Check the order</h2></div>
          <button type="button" className="rz-btn rz-btn--small" onClick={()=>setMode('place')}>Back</button></div>
        <ol className="rz-orderrows">{race.order.map((id,index)=><li key={id}><div className="rz-orderrow"><span className="rz-orderrow__place">{ordinal(index+1)}</span><span className="rz-orderrow__num">{label(id)}</span>
          <span className="rz-orderrow__handle"><Icon name="drag"/></span></div></li>)}</ol>
        <div className="rz-heading-row"><h3 className="rz-section">Not placed</h3><button type="button" className="rz-btn rz-btn--small" onClick={()=>setPicking(true)}>+ Team not on the list</button></div>
        {left.length?<ul className="rz-orderrows">{left.map(entry=>{const as=race.left[entry.teamId]??'dnf';return <li key={entry.teamId}>
          <button type="button" className="rz-orderrow rz-orderrow--unplaced" onClick={()=>change(next=>{next.left[entry.teamId]=as==='dnf'?'dnr':'dnf';})}>
            <span className="rz-orderrow__place">–</span><span className="rz-orderrow__num">{label(entry.teamId)}</span><span className="rz-tag rz-tag--dnf">{as==='dnf'?'Did not finish':"Didn't run"}</span></button></li>;})}</ul>
          :<p className="rz-empty">Every team has a place.</p>}
        {left.length>0 && <p className="rz-field__hint">Tap a team to switch Did not finish and Didn't run. Didn't run puts the team back with those still to run.</p>}
      </main>
      <footer className="rz-footer rz-footer--sticky"><button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>{change(next=>{for(const entry of left) next.left[entry.teamId]??='dnf';});done('positions');}}>Save positions</button></footer>
      {picker}
    </>;
  }
  return <>
    <main className="rz-main">
      <ol className="rz-places">{Array.from({length:slots},(_,index)=>{
        const id=race.order[index];
        if(index===current && unplaced.length) return <li key={index}><span className="rz-placeslot rz-placeslot--current"><span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">?</span></span></li>;
        if(id) return <li key={index}><button type="button" className="rz-placeslot rz-placeslot--placed proto-slot" onClick={()=>change(next=>{next.order=next.order.slice(0,index);})}><span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">{variant==='B'?lastLeg(teamOf(day,id)):`T${teamOf(day,id).number}`}</span></button></li>;
        return <li key={index}><span className="rz-placeslot rz-placeslot--empty"><span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">–</span></span></li>;
      })}</ol>
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · {running.length} teams · {unplaced.length} to place · tap the team whose 4th leg crossed</p>
        <h2 className="rz-prompt__q">{!running.length?'No teams checked in yet':<>Which team came <em>{ordinal(current+1)}?</em></>}</h2></div>
      {unplaced.length>0 && <ul className={variant==='C'?'rz-runners proto-teamtiles proto-teamtiles--two':'rz-runners proto-teamtiles'}>{unplaced.map(entry=>{const team=teamOf(day,entry.teamId);return <li key={team.id}>
        <button type="button" className={variant==='C'?'rz-runner proto-both':'rz-runner'} onClick={()=>change(next=>{next.order.push(team.id);})}>{tileLabel(variant,team)}{entry.atFinish && <small className="proto-atfinish">At finish</small>}</button></li>;})}</ul>}
    </main>
    <footer className="rz-footer rz-footer--sticky">
      <button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>setMode('check')}>No other team crossed the line</button>
      <button type="button" className="rz-btn rz-btn--block" onClick={()=>setPicking(true)}>+ Team not on the list</button>
    </footer>
    {picker}
  </>;
}
/** Timer: one time per place, the start to the 4th leg crossing; the same in every variant. */
function Timer({race,change,done}:StepBody) {
  const [typed,setTyped]=useState('');
  const slots=Math.max(race.entries.filter(entry=>!entry.absent).length,race.order.length),full=race.times.length>=slots;
  function next() {
    const time=parseTimeDigits(typed);
    if(time===null || full) return;
    setTyped('');change(next=>{next.times.push(time);});
    if(race.times.length+1>=slots) done('times');
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · {slots} teams · one time per team, to the 4th leg crossing</p><h2 className="rz-prompt__q">{full?'Every place has a time':`${ordinal(race.times.length+1)} place time?`}</h2></div>
      <ol className="rz-slots">{Array.from({length:slots},(_,index)=>{const time=race.times[index];return <li key={index}>
        <span className={index===race.times.length?'rz-slot rz-slot--current':time===undefined?'rz-slot rz-slot--empty':'rz-slot'}><span className="rz-slot__ord">{ordinal(index+1)}</span><span className="rz-slot__time">{time===undefined?'–':formatTime(time)}</span></span></li>;})}</ol>
      {!full && <Digits id="place-time" label="Place time" value={typed} onChange={setTyped} onEnter={next} hint={typed?<>Shows as <strong>{formatTimeDigits(typed)}</strong>. Type digits only.</>:'Type digits only: 1234 shows as 12.34.'}/>}
    </main>
    <footer className="rz-footer rz-footer--sticky"><div className="rz-footer__trio">
      <button type="button" className="rz-btn" disabled>Back</button>
      <button type="button" className="rz-btn" disabled={!race.times.length} onClick={()=>done('times')}>No more finishers</button>
      <button type="button" className="rz-btn rz-btn--primary" disabled={!typed || full} onMouseDown={event=>event.preventDefault()} onClick={next}>Next</button>
    </div></footer>
  </>;
}
