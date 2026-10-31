/**
 * PROTOTYPE - throwaway, never merged (wayfinder map #231, ticket #248: what do the rest of the lead screens look like in the
 * Running Zone design?). Client only, at /prototype/lead-screens, on the real Running Zone parts, no server. One in-memory day:
 * 60m · Girl Cubs (R4), heats then final: Heats 1-3 saved, the final saved (medals to confirm), Heat 4 deleted at 10:42.
 * 2041 in Heat 1 has a kept warning. Only R4 opens in Results.
 *
 * Three looks, switched by the pink pill (or ?variant=A|B|C); the pink "Screen" list jumps to any screen:
 *   A - Sheets for menus (the starting rule): Race actions, runner actions and every "are you sure?" are bottom sheets over
 *       the page; anything the lead edits and then confirms is a full screen. Results is the event grid; an event is one page
 *       with the navy scoreboard; Day setup is cards, with Phones and Events on screens of their own.
 *   B - Every step a screen: no sheets at all. Race actions and a runner are screens (list rows with a line each), and so is
 *       every question. Results is a plain list; an event splits into tabs; Day setup is a settings list, one screen per row.
 *   C - Fix on the page: no menus. A race page lists its fixes under the record; a runner opens in place under its row; a
 *       question opens in place. Results looks like Races (one card per event, heat chips); Day setup is one long page with
 *       Signed in today and Events on it.
 * The same in every look (already decided in #244): Back names the screen it goes to; the job chip is on every lead bar; one
 * toast for every save (no Undo); corrections, Re-run, Delete, Restore and Disqualify are race-flow screens (prompt, docked
 * button); Delete is red.
 */
import { useEffect,useState,type ReactNode } from 'react';
import { disqualificationReasons } from '../../shared/rulings.js';
import { ordinal } from '../../shared/ordinal.js';
import { Callout,DockedFooter,HomeBar,Icon,RoleChip,Screen,Sheet,Star } from '../races/parts.js';
import './LeadScreens.prototype.css';

type Variant='A'|'B'|'C';
const variants:Variant[]=['A','B','C'];
const variantNames:Record<Variant,string>={A:'Sheets for menus',B:'Every step a screen',C:'Fix on the page'};

// ---------- The day ----------
type RaceId=number|'final';
interface Runner { num:number; heat:number; time:number|null }
const heatRunners:Record<number,Runner[]>={
  1:[{num:2003,heat:1,time:1012},{num:2008,heat:1,time:1044},{num:2011,heat:1,time:1071},{num:2002,heat:1,time:1102},{num:2017,heat:1,time:1130},{num:2041,heat:1,time:1185}],
  2:[{num:2014,heat:2,time:1020},{num:2006,heat:2,time:1038},{num:2033,heat:2,time:1055},{num:2019,heat:2,time:1090},{num:2025,heat:2,time:1112},{num:2030,heat:2,time:null}],
  3:[{num:2021,heat:3,time:1031},{num:2009,heat:3,time:1050},{num:2012,heat:3,time:1062},{num:2027,heat:3,time:1120},{num:2035,heat:3,time:1141}],
  4:[{num:2044,heat:4,time:1088},{num:2046,heat:4,time:1105},{num:2048,heat:4,time:1131},{num:2049,heat:4,time:null}]};
const checkedIn:Record<number,string>={1:'10:05',2:'10:12',3:'10:20',4:'10:31'};
const finalOrder=[2014,2003,2021,2008,2006,2009];
const warning={num:2041,text:'Not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2099.',by:'Kept by Start line · Amina Yusuf · 10:05'};
const event={name:'60m',section:'Girl Cubs',code:'R4'};
const fmt=(time:number)=>time>=6000?`${Math.floor(time/6000)}:${String(Math.floor(time%6000/100)).padStart(2,'0')}.${String(time%100).padStart(2,'0')}`:`${Math.floor(time/100)}.${String(time%100).padStart(2,'0')}`;
const fmtDigits=(digits:string)=>digits?fmt(Number(digits)):'';
interface Phone { id:string; name:string; level:'Lead'|'Volunteer'; owner?:boolean; you?:boolean }
interface Ev { code:string; name:string; section:string; type:string; format:string; on:boolean }
interface Day {
  times:Record<number,Array<number|null>>; deleted:Record<number,string>; dq:Record<number,string>; checked:boolean;
  year:string; region:string; day:string; leadCode:string; phones:Phone[]; events:Ev[]; exported:boolean;
}
const freshDay=():Day=>({
  times:Object.fromEntries(Object.entries(heatRunners).map(([heat,runners])=>[heat,runners.map(runner=>runner.time)])),
  deleted:{4:'10:42'},dq:{},checked:false,year:'2026',region:'South',day:'',leadCode:'4821',exported:false,
  phones:[{id:'p1',name:'Sara Ahmed',level:'Lead',owner:true,you:true},{id:'p2',name:'Amina Yusuf',level:'Volunteer'},{id:'p3',name:'Tom Barker',level:'Volunteer'},{id:'p4',name:'Bilal Rahman',level:'Lead'},{id:'p5',name:'Grace Mensah',level:'Volunteer'}],
  events:[['R3','60m','Boy Cubs','Races','Heats then final'],['R4','60m','Girl Cubs','Races','Heats then final'],['R5','60m','Boy Scouts','Races','Heats then final'],['H2','60m Hurdles','Girl Cubs','Hurdles','Timed'],['E2','200m','Girl Cubs','Races','Timed'],['X1','4x100m Relay','Scouts','Relays','Heats then final']]
    .map(([code,name,section,type,format])=>({code:code!,name:name!,section:section!,type:type!,format:format!,on:true}))});
const liveHeats=(day:Day)=>[1,2,3,4].filter(heat=>!day.deleted[heat]);
const runnerOf=(num:number)=>Object.values(heatRunners).flat().find(runner=>runner.num===num)!;
const timeOf=(day:Day,runner:Runner)=>day.times[runner.heat]![heatRunners[runner.heat]!.indexOf(runner)]??null;
/** Place in its race by time; no time is no place. */
function placeInRace(day:Day,runner:Runner) {
  const time=timeOf(day,runner);if(time===null) return null;
  return heatRunners[runner.heat]!.filter(other=>{const t=timeOf(day,other);return t!==null && t<time;}).length+1;
}
interface Row { runner:Runner; time:number|null; rank:number|null; q:boolean }
function leaderboard(day:Day):Row[] {
  const all=liveHeats(day).flatMap(heat=>heatRunners[heat]!).filter(runner=>!day.dq[runner.num]);
  const timed=all.filter(runner=>timeOf(day,runner)!==null).sort((a,b)=>timeOf(day,a)!-timeOf(day,b)!);
  return [...timed.map((runner,index)=>({runner,time:timeOf(day,runner),rank:index+1,q:index<6})),...all.filter(runner=>timeOf(day,runner)===null).map(runner=>({runner,time:null,rank:null,q:false}))];
}
const raceName=(race:RaceId)=>race==='final'?'Final':`Heat ${race}`;
const nextHeat=(day:Day)=>Math.max(...liveHeats(day))+1;
const results=[
  {group:'60m',events:[{code:'R3',section:'Boy Cubs',line:'Heat 2 in progress · Heat 1 saved',state:'running',chips:['H1','H2']},{code:'R4',section:'Girl Cubs',line:'Final saved · confirm the medals',state:'running',chips:['H1','H2','H3','Final']},
    {code:'R5',section:'Boy Scouts',line:'Medals decided',state:'done',chips:['H1','H2','Final']},{code:'R6',section:'Girl Scouts',line:'No races yet',state:'idle',chips:[]}]},
  {group:'200m',events:[{code:'E1',section:'Boy Cubs',line:'Medals decided',state:'done',chips:['H1','H2']},{code:'E2',section:'Girl Cubs',line:'Heat 1 in progress',state:'running',chips:['H1']}]},
  {group:'4x100m Relay',events:[{code:'X1',section:'Scouts',line:'No races yet',state:'idle',chips:[]}]}] as const;

// ---------- Navigation ----------
type Ask={kind:'remove';id:string}|{kind:'lead-code'};
type View={k:'races'}|{k:'opening'}|{k:'access'}|{k:'results'}|{k:'event'}|{k:'race';race:RaceId}|{k:'race-actions';race:RaceId}|{k:'runner';num:number}
  |{k:'times';heat:number}|{k:'delete';race:RaceId;forGood?:boolean}|{k:'restore';heat:number}|{k:'rerun';race:RaceId}|{k:'disqualify';num:number}|{k:'lift';num:number}
  |{k:'day'}|{k:'events'}|{k:'phones'}|{k:'rename';code:string}|{k:'this-day'}|{k:'codes'}|{k:'export'}|{k:'new-day'}|{k:'ask';ask:Ask};
type Overlay={k:'race-actions';race:RaceId}|{k:'runner';num:number}|{k:'ask';ask:Ask}|null;
function title(view:View,day:Day):string {
  switch(view.k) {
    case 'races': return 'Races';case 'opening': return 'Opening';case 'access': return 'Zone lead';case 'results': return 'Results';
    case 'event': return `${event.name} ${event.section}`;case 'race': return raceName(view.race);case 'race-actions': return 'Race actions';case 'runner': return `Runner ${view.num}`;
    case 'times': return 'Correct times';case 'delete': return 'Delete race';case 'restore': return 'Restore race';case 'rerun': return 'Re-run race';
    case 'disqualify': return 'Disqualify';case 'lift': return 'Lift disqualification';case 'day': return 'Day setup';case 'events': return 'Events';
    case 'phones': return 'Signed in today';case 'rename': return `Rename ${view.code}`;case 'this-day': return 'This day';case 'codes': return 'Codes';
    case 'export': return 'Day export';case 'new-day': return 'Start a new day';case 'ask': return view.ask.kind==='remove'?`Remove ${day.phones.find(phone=>phone.id===(view.ask as {id:string}).id)?.name}`:'New lead code';
  }
}
const R:View={k:'races'},RES:View={k:'results'},EV:View={k:'event'},DAY:View={k:'day'};
/** The prototype's screen list: a path to each screen, and the menu or question to open on top of it. */
const jumps:Array<{label:string;stack:View[];open?:Overlay}>=[
  {label:'Opening',stack:[{k:'opening'}]},{label:'Lead access needed',stack:[R,{k:'access'}]},
  {label:'Results',stack:[R,RES]},{label:'An event',stack:[R,RES,EV]},{label:'Race page (Heat 1)',stack:[R,RES,EV,{k:'race',race:1}]},
  {label:'Race actions',stack:[R,RES,EV,{k:'race',race:1}],open:{k:'race-actions',race:1}},
  {label:'Runner actions (2041)',stack:[R,RES,EV],open:{k:'runner',num:2041}},
  {label:'Correct times',stack:[R,RES,EV,{k:'race',race:1},{k:'times',heat:1}]},{label:'Delete race',stack:[R,RES,EV,{k:'race',race:1},{k:'delete',race:1}]},
  {label:'Re-run race',stack:[R,RES,EV,{k:'race',race:1},{k:'rerun',race:1}]},{label:'Disqualify (2033)',stack:[R,RES,EV,{k:'disqualify',num:2033}]},
  {label:'Deleted race (Heat 4)',stack:[R,RES,EV,{k:'race',race:4}]},{label:'Restore race',stack:[R,RES,EV,{k:'race',race:4},{k:'restore',heat:4}]},
  {label:'Day setup',stack:[R,DAY]},{label:'Signed in today',stack:[R,DAY,{k:'phones'}]},{label:'Remove asks first',stack:[R,DAY,{k:'phones'}],open:{k:'ask',ask:{kind:'remove',id:'p3'}}},
  {label:'Events',stack:[R,DAY,{k:'events'}]}];

interface Ctx {
  variant:Variant; day:Day; set:(change:(day:Day)=>Partial<Day>)=>void; say:(text:string)=>void;
  push:(view:View)=>void; back:()=>void; backTo:(k:View['k'])=>void; reset:(stack:View[])=>void; backLabel:string;
  /** A menu or a question: a sheet in A, a screen in B, in place in C. */
  menu:(overlay:Exclude<Overlay,null>)=>void; inline:Overlay; close:()=>void;
}

function firstVariant():Variant {
  const asked=new URLSearchParams(location.search).get('variant');
  return variants.includes(asked as Variant)?asked as Variant:'A';
}
export function LeadScreensPrototype() {
  const [variant,setVariant]=useState<Variant>(firstVariant);
  const [day,setDay]=useState<Day>(freshDay);
  const [stack,setStack]=useState<View[]>([R]);
  const [overlay,setOverlay]=useState<Overlay>(null);
  const [toast,setToast]=useState<{text:string;at:number}|null>(null);
  const [jump,setJump]=useState('');
  useEffect(()=>{if(!toast) return;const timer=setTimeout(()=>setToast(null),6000);return ()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{window.scrollTo(0,0);},[stack]);
  function go(label:string,to=variant) {
    const target=jumps.find(item=>item.label===label);setJump(label);setDay(freshDay());setToast(null);
    if(!target) {setStack([R]);setOverlay(null);return;}
    let next=[...target.stack],open:Overlay=null;
    // C has no Phones or Events screens: they are on Day setup.
    if(to==='C') next=next.map(view=>view.k==='phones' || view.k==='events'?DAY:view).filter((view,index,all)=>!(view===DAY && all.indexOf(DAY)!==index));
    if(target.open) {
      if(to==='B') next.push(target.open.k==='race-actions'?{k:'race-actions',race:target.open.race}:target.open.k==='runner'?{k:'runner',num:target.open.num}:{k:'ask',ask:target.open.ask});
      else open=target.open;
    }
    setStack(next);setOverlay(open);
  }
  function cycle(step:number) {
    const next=variants[(variants.indexOf(variant)+step+variants.length)%variants.length]!;
    const params=new URLSearchParams(location.search);params.set('variant',next);history.replaceState(null,'',`${location.pathname}?${params}`);
    setVariant(next);go(jump,next);
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;if(event.key==='ArrowLeft') cycle(-1);if(event.key==='ArrowRight') cycle(1);};
    addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);
  });
  const view=stack[stack.length-1]!;
  const ctx:Ctx={variant,day,set:change=>setDay(current=>({...current,...change(current)})),say:text=>setToast({text,at:Date.now()}),
    push:next=>{setOverlay(null);setStack(current=>[...current,next]);},
    back:()=>{setOverlay(null);setStack(current=>current.length>1?current.slice(0,-1):current);},
    backTo:k=>{setOverlay(null);setStack(current=>{const at=current.map(item=>item.k).lastIndexOf(k);return at>=0?current.slice(0,at+1):current;});},
    reset:next=>{setOverlay(null);setStack(next);},
    backLabel:stack.length>1?title(stack[stack.length-2]!,day):'',
    menu:open=>{if(variant==='B') {setStack(current=>[...current,open.k==='race-actions'?{k:'race-actions',race:open.race}:open.k==='runner'?{k:'runner',num:open.num}:{k:'ask',ask:open.ask}]);}
      else setOverlay(current=>variant==='C' && JSON.stringify(current)===JSON.stringify(open)?null:open);},
    inline:variant==='C'?overlay:null,close:()=>setOverlay(null)};
  const state=`Stack: ${stack.map(item=>title(item,day)).join(' › ')}${overlay?` + ${variant==='A'?'sheet':'in place'}: ${overlay.k}`:''}`;
  return <Screen screen="Lead screens prototype">
    <div className="proto-switcher" aria-label="Prototype variant"><div className="proto-switcher__pill"><button type="button" aria-label="Previous variant" onClick={()=>cycle(-1)}>‹</button>
      <span>{variant} · {variantNames[variant]}</span><button type="button" aria-label="Next variant" onClick={()=>cycle(1)}>›</button></div>
      <label className="proto-jump">Screen <select aria-label="Jump to screen" value={jump} onChange={event=>go(event.target.value)}><option value="">Races (start)</option>{jumps.map(item=><option key={item.label}>{item.label}</option>)}</select></label>
      <p className="proto-state">{state}</p></div>
    <Page view={view} ctx={ctx}/>
    {variant==='A' && overlay?.k==='race-actions' && <Sheet title={`${raceName(overlay.race)} · actions`} onClose={ctx.close}><RaceActionList race={overlay.race} ctx={ctx}/></Sheet>}
    {variant==='A' && overlay?.k==='runner' && <Sheet title={`Runner ${overlay.num}`} onClose={ctx.close}><RunnerBody num={overlay.num} ctx={ctx}/></Sheet>}
    {variant==='A' && overlay?.k==='ask' && <AskSheet ask={overlay.ask} ctx={ctx}/>}
    {toast && <div className="rz-toast" role="status" key={toast.at}><span className="rz-toast__msg"><Icon name="check"/>{toast.text}</span></div>}
  </Screen>;
}

function Page({view,ctx}:{view:View;ctx:Ctx}) {
  const {variant}=ctx;
  switch(view.k) {
    case 'races': return <RacesHost ctx={ctx}/>;
    case 'opening': return <Opening/>;
    case 'access': return <Access ctx={ctx}/>;
    case 'results': return variant==='A'?<ResultsGrid ctx={ctx}/>:variant==='B'?<ResultsList ctx={ctx}/>:<ResultsCards ctx={ctx}/>;
    case 'event': return variant==='A'?<EventA ctx={ctx}/>:variant==='B'?<EventB ctx={ctx}/>:<EventC ctx={ctx}/>;
    case 'race': return <RacePage race={view.race} ctx={ctx}/>;
    case 'race-actions': return <><Bar title="Race actions" ctx={ctx}/><main className="rz-main proto-main"><p className="proto-meta">{event.name} · {event.section} · {raceName(view.race)}</p><RaceActionList race={view.race} ctx={ctx}/></main></>;
    case 'runner': return <><Bar title={`Runner ${view.num}`} ctx={ctx}/><main className="rz-main proto-main"><RunnerBody num={view.num} ctx={ctx}/></main></>;
    case 'times': return <TimesScreen heat={view.heat} ctx={ctx}/>;
    case 'delete': return <DeleteScreen race={view.race} forGood={view.forGood} ctx={ctx}/>;
    case 'restore': return <Confirm ctx={ctx} title="Restore race" meta={`${event.name} · ${event.section} · deleted ${ctx.day.deleted[view.heat]}`} q={<>Restore <em>Heat {view.heat}?</em></>}
      help={`Its results count in this event again. It comes back as Heat ${view.heat}${liveHeats(ctx.day).includes(view.heat)?'':''}.`} button={`Restore Heat ${view.heat}`}
      onConfirm={()=>{ctx.set(day=>{const deleted={...day.deleted};delete deleted[view.heat];return {deleted};});ctx.say(`Heat ${view.heat} restored · counts again`);ctx.back();}}/>;
    case 'rerun': {
      const heat=nextHeat(ctx.day),count=view.race==='final'?6:heatRunners[view.race]!.length;
      return <Confirm ctx={ctx} title="Re-run race" meta={`${event.name} · ${event.section} · ${raceName(view.race)}`} q={<>Re-run <em>{raceName(view.race)}?</em></>}
        help={`Call a re-run only as a last resort. ${raceName(view.race)} moves to Deleted races, and ${view.race==='final'?'a new final':`Heat ${heat}`} opens with the same ${count} runners checked in.`}
        button={view.race==='final'?'Re-run the final':`Re-run as Heat ${heat}`} comment
        onConfirm={()=>{ctx.reset([R]);ctx.say(`Heat ${heat} opened · re-run of ${raceName(view.race)} (the real app lands on Heat ${heat})`);}}/>;
    }
    case 'disqualify': return <Disqualify num={view.num} ctx={ctx}/>;
    case 'lift': return <Confirm ctx={ctx} title="Lift disqualification" meta={`${view.num} · disqualified: ${ctx.day.dq[view.num]}`} q={<>Lift <em>{view.num}'s</em> disqualification?</>}
      help="Their result counts again." button="Lift disqualification" comment="required"
      onConfirm={()=>{ctx.set(day=>{const dq={...day.dq};delete dq[view.num];return {dq};});ctx.say(`${view.num} counts again`);ctx.back();}}/>;
    case 'day': return variant==='A'?<DayA ctx={ctx}/>:variant==='B'?<DayB ctx={ctx}/>:<DayC ctx={ctx}/>;
    case 'phones': return <><Bar title="Signed in today" ctx={ctx}/><main className="rz-main proto-main"><p className="proto-help">Role changes last for today only.</p><PhoneRows ctx={ctx}/></main></>;
    case 'events': return <><Bar title="Events" ctx={ctx}/><main className="rz-main proto-main"><EventRows ctx={ctx}/></main></>;
    case 'rename': return <Rename code={view.code} ctx={ctx}/>;
    case 'this-day': return <><Bar title="This day" ctx={ctx}/><main className="rz-main proto-main"><ThisDay ctx={ctx}/></main></>;
    case 'codes': return <><Bar title="Codes" ctx={ctx}/><main className="rz-main proto-main"><Codes ctx={ctx}/></main></>;
    case 'export': return <><Bar title="Day export" ctx={ctx}/><main className="rz-main proto-main"><Export ctx={ctx}/></main></>;
    case 'new-day': return <><Bar title="Start a new day" ctx={ctx}/><main className="rz-main proto-main"><NewDay ctx={ctx}/></main></>;
    case 'ask': return <AskScreen ask={view.ask} ctx={ctx}/>;
  }
}

// ---------- Shared frame ----------
/** The lead bar: a back arrow that names where it goes, the screen's title (with the event code), the job chip, then an optional "⋯". */
function Bar({title,code,ctx,more}:{title:string;code?:string;ctx:Ctx;more?:ReactNode}) {
  return <header className="rz-appbar rz-appbar--compact rz-appbar--race proto-bar">
    <div className="proto-bar__start">
      <button type="button" className="proto-bar__back" aria-label={`Back to ${ctx.backLabel}`} onClick={ctx.back}><Icon name="chevron-left" className="rz-icon--bold"/>{ctx.backLabel}</button>
      <div className="rz-appbar__race"><h1>{title}</h1>{code && <span className="rz-code-tag">{code}</span>}</div>
    </div>
    <div className="rz-appbar__end" style={{gap:2}}><RoleChip role="lead" onOpen={()=>ctx.say('Would open Switch job')}/>{more}</div>
  </header>;
}
const Prompt=({meta,q,help}:{meta?:string;q:ReactNode;help?:string})=><div className="rz-prompt rz-prompt--compact">{meta && <p className="rz-prompt__meta">{meta}</p>}<h1 className="rz-prompt__q">{q}</h1>{help && <p className="rz-prompt__help">{help}</p>}</div>;
function Comment({value,onChange,required}:{value:string;onChange:(value:string)=>void;required?:boolean}) {
  return <div className="rz-field rz-field--text proto-comment"><label className="rz-field__label" htmlFor="proto-comment">{required?'Comment':'Comment (optional)'}</label>
    <textarea className="rz-field__input" id="proto-comment" maxLength={1000} value={value} onChange={event=>onChange(event.target.value)}/></div>;
}
/** A confirm screen in the race-flow frame: prompt, an optional comment, a docked main button with the reason above it while it cannot go. */
function Confirm({ctx,title,meta,q,help,button,danger,comment,children,reason,onConfirm}:{ctx:Ctx;title:string;meta:string;q:ReactNode;help:string;button:string;danger?:boolean;
  comment?:boolean|'required';children?:ReactNode;reason?:string;onConfirm:(comment:string)=>void}) {
  const [text,setText]=useState('');
  const why=reason||(comment==='required' && !text.trim()?'Write a comment first.':'');
  return <>
    <Bar title={title} code={event.code} ctx={ctx}/>
    <main className="rz-main proto-main"><Prompt meta={meta} q={q} help={help}/>{children}{comment && <Comment value={text} onChange={setText} required={comment==='required'}/>}</main>
    <DockedFooter>{why && <p className="rz-footer__reason">{why}</p>}
      <button type="button" className={`rz-btn rz-btn--block ${danger?'rz-btn--danger':'rz-btn--primary'}`} aria-disabled={why?true:undefined} onClick={()=>{if(!why) onConfirm(text);}}>{button}</button></DockedFooter>
  </>;
}

// ---------- Host, opening, lead access ----------
function RacesHost({ctx}:{ctx:Ctx}) {
  const [menu,setMenu]=useState(false);
  return <>
    <HomeBar><RoleChip role="lead" onOpen={()=>{}}/><button type="button" className="rz-avatar" aria-label="Avatar menu: Results, Day setup" onClick={()=>setMenu(open=>!open)}>SA</button></HomeBar>
    {menu && <div className="rz-menu" role="menu" style={{top:64,right:12}}><button type="button" role="menuitem" onClick={()=>ctx.push(RES)}>Results</button><button type="button" role="menuitem" onClick={()=>ctx.push(DAY)}>Day setup</button></div>}
    <main className="rz-main">
      <h2 className="rz-section">Action required</h2>
      <article className="rz-racecard"><div className="rz-racecard__head"><h3 className="rz-racecard__title">{event.name} · {event.section}</h3><span className="rz-code-tag">{event.code}</span></div>
        <p className="rz-racecard__status">Final saved · confirm the medals</p></article>
      <p className="proto-note">Races home as today. The avatar (SA) opens Results and Day setup. Or use the pink Screen list.</p>
    </main>
  </>;
}
function Opening() {
  return <><HomeBar><span/></HomeBar><main className="rz-main proto-opening"><span className="proto-spinner" aria-hidden="true"/><p className="proto-help">Opening the Running Zone…</p></main></>;
}
function Access({ctx}:{ctx:Ctx}) {
  const [code,setCode]=useState('');
  return <>
    <Bar title="Zone lead" ctx={ctx}/>
    <main className="rz-main proto-main"><Prompt meta="Results and Day setup are for zone leads" q={<>Type the <em>lead code</em></>} help="Ask the zone lead who set up today."/>
      <div className="rz-field"><label className="rz-field__label" htmlFor="proto-lead">Lead code</label><input className="rz-field__input" id="proto-lead" inputMode="numeric" autoComplete="off" value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/></div></main>
    <DockedFooter>{!code && <p className="rz-footer__reason">Type the code first.</p>}<button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={!code || undefined} onClick={()=>{if(code) {ctx.back();ctx.say('You are a zone lead now');}}}>Become lead</button></DockedFooter>
  </>;
}

// ---------- Results ----------
const openEvent=(ctx:Ctx,code:string)=>code==='R4'?ctx.push(EV):ctx.say('Prototype: only 60m Girl Cubs (R4) opens');
const stateWord={done:'Done',running:'Running',idle:'Not started'} as const;
function ResultsGrid({ctx}:{ctx:Ctx}) {
  return <><Bar title="Results" ctx={ctx}/><main className="rz-main proto-main">
    <ul className="rz-legend" aria-label="Key">{(['done','running','idle'] as const).map(state=><li key={state}><span className={`rz-legend__swatch rz-legend__swatch--${state}`}/>{stateWord[state]}</li>)}</ul>
    {results.map(group=><section key={group.group}><h2 className="rz-section">{group.group}</h2><ul className="rz-events">{group.events.map(item=><li key={item.code}>
      <button type="button" className={`rz-event rz-event--${item.state}`} onClick={()=>openEvent(ctx,item.code)}><span className="rz-event__name">{item.code} · {item.section}</span>
        <span className="rz-event__status">{item.state==='done' && <Icon name="check"/>}{item.line}</span></button></li>)}</ul></section>)}
  </main></>;
}
function ResultsList({ctx}:{ctx:Ctx}) {
  return <><Bar title="Results" ctx={ctx}/><main className="rz-main proto-main">
    {results.map(group=><section key={group.group}><h2 className="rz-section">{group.group}</h2><ul className="rz-list">{group.events.map(item=><li key={item.code}>
      <button type="button" className={item.code==='R4'?'rz-listrow rz-listrow--warn':'rz-listrow'} onClick={()=>openEvent(ctx,item.code)}><span className="rz-listrow__main"><span className="rz-listrow__label">{item.section}</span><span className="rz-listrow__meta">{item.line}</span></span>
        <span className="rz-code-tag">{item.code}</span></button></li>)}</ul></section>)}
  </main></>;
}
function ResultsCards({ctx}:{ctx:Ctx}) {
  return <><Bar title="Results" ctx={ctx}/><main className="rz-main proto-main">
    {results.map(group=><section key={group.group} className="proto-stack"><h2 className="rz-section">{group.group}</h2>{group.events.map(item=>
      <button type="button" key={item.code} className="rz-racecard proto-cardbtn" onClick={()=>openEvent(ctx,item.code)}>
        <span className="rz-racecard__head"><span className="rz-racecard__title">{group.group} · {item.section}</span><span className="rz-code-tag">{item.code}</span></span>
        <span className="rz-racecard__status">{item.line}</span>
        {item.chips.length>0 && <span className="rz-heats">{item.chips.map(chip=><span key={chip} className={`rz-heat rz-heat--${item.state==='running' && chip===item.chips[item.chips.length-1] && item.code!=='R4'?'waiting':'done'}`}>{chip}{(item.state!=='running' || chip!==item.chips[item.chips.length-1] || item.code==='R4') && <Icon name="check"/>}</span>)}</span>}
      </button>)}</section>)}
  </main></>;
}

// ---------- An event ----------
const confirmMedals=(ctx:Ctx)=><button type="button" className="rz-btn rz-btn--primary rz-btn--block" onClick={()=>ctx.say('Would open Confirm the medals (the screen decided in #243)')}>Confirm the medals</button>;
function Scoreboard({ctx}:{ctx:Ctx}) {
  const rows=leaderboard(ctx.day);
  return <section className="rz-scoreboard proto-board" aria-label="Heats leaderboard">
    <div className="rz-stripes" aria-hidden="true"><span/><span/><span/></div>
    <div className="rz-board-head"><span className="rz-live">Final saved · confirm the medals</span><span className="rz-board-note">Heats · Q = fastest 6 go to the final</span></div>
    <ol className="rz-board">{rows.map(row=><BoardRow key={row.runner.num} row={row} ctx={ctx}/>)}{Object.keys(ctx.day.dq).map(num=>
      <li key={num}><button type="button" className="rz-lb rz-lb--outside" onClick={()=>ctx.menu({k:'runner',num:Number(num)})}><span className="rz-lb__rank rz-lb__rank--plain">DQ</span>
        <span className="rz-lb__who"><span className="rz-lb__band">{num}</span><span className="rz-lb__detail">Disqualified: {ctx.day.dq[Number(num)]}</span></span><span className="rz-lb__end"/></button></li>)}</ol>
  </section>;
}
function BoardRow({row,ctx}:{row:Row;ctx:Ctx}) {
  const place=placeInRace(ctx.day,row.runner),warn=row.runner.num===warning.num && !ctx.day.checked;
  return <><li><button type="button" className={`rz-lb ${row.q?'rz-lb--q':row.rank===null?'rz-lb--outside':''}`} aria-label={`${row.runner.num} · Heat ${row.runner.heat}`} onClick={()=>ctx.menu({k:'runner',num:row.runner.num})}>
    <span className={row.q?'rz-lb__rank':'rz-lb__rank rz-lb__rank--plain'}>{row.q && <Star/>}<span>{row.rank??'–'}</span></span>
    <span className="rz-lb__who"><span className="rz-lb__band">{row.runner.num} {row.q && <span className="rz-tag rz-tag--q">Q</span>}{warn && <span className="rz-tag rz-tag--warn">Check</span>}</span>
      <span className="rz-lb__detail">Heat {row.runner.heat} · {place?`${ordinal(place)} in race`:'Did not finish'}</span></span>
    <span className="rz-lb__end"><span className="rz-lb__time">{row.time===null?'–':fmt(row.time)}</span></span></button></li>
    {row.rank===6 && <li className="rz-qline" aria-label="Qualifying line"><span aria-hidden="true">Qualifying line</span></li>}</>;
}
function FinalRows({ctx,onRow}:{ctx:Ctx;onRow:(num:number)=>void}) {
  return <ol className="rz-lead-rows" aria-label="Final">{finalOrder.map((num,index)=><li key={num}><button type="button" className="rz-lead-row proto-rowbtn" onClick={()=>onRow(num)}>
    <span className="rz-lead-row__place">{index<3?<span className="proto-medal"><Star/><b>{index+1}</b></span>:ordinal(index+1)}</span><span className="rz-lead-row__num">{num}</span>
    <span className="proto-rowmeta">from Heat {runnerOf(num).heat}</span></button>{ctx.inline?.k==='runner' && ctx.inline.num===num && <InlineRunner num={num} ctx={ctx}/>}</li>)}</ol>;
}
const lineUp=(ctx:Ctx)=><details className="rz-disclosure"><summary>Line-up, fastest first</summary><div className="rz-disclosure__body">{leaderboard(ctx.day).slice(0,6).map((row,index)=><span key={row.runner.num}>{ordinal(index+1)} fastest · {row.runner.num} · Heat {row.runner.heat} · {fmt(row.time!)}</span>)}</div></details>;
const exportLine=<p className="proto-exportline"><b>Day export</b> 1st 2014 · 2nd 2003 · 3rd 2021</p>;
function RaceRows({ctx}:{ctx:Ctx}) {
  return <ul className="rz-list">{[...liveHeats(ctx.day),'final' as const].map(race=><li key={race}><button type="button" className="rz-listrow" onClick={()=>ctx.push({k:'race',race})}>
    <span className="rz-listrow__main"><span className="rz-listrow__label">{raceName(race)}</span><span className="rz-listrow__meta">{race==='final'?'6 runners · saved':`${heatRunners[race]!.length} runners · saved · checked in ${checkedIn[race]}`}</span></span><Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul>;
}
function DeletedRows({ctx}:{ctx:Ctx}) {
  const heats=Object.keys(ctx.day.deleted).map(Number);
  return heats.length?<ul className="rz-list">{heats.map(heat=><li key={heat}><button type="button" className="rz-listrow" onClick={()=>ctx.push({k:'race',race:heat})}>
    <span className="rz-listrow__main"><span className="rz-listrow__label">Heat {heat}</span><span className="rz-listrow__meta">Deleted {ctx.day.deleted[heat]} · {heatRunners[heat]!.length} runners</span></span><Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul>
    :<p className="proto-help">No deleted races.</p>;
}
const notes=['10:05 Start line kept 2041 in Heat 1 (not a Girl Cubs number)','10:31 Heat 4 checked in','10:42 Sara Ahmed deleted Heat 4: wrong section checked in','11:05 Bilal Rahman made the final from the fastest 6','11:20 Final saved'];
const Notes=()=><details className="rz-disclosure"><summary>Notes ({notes.length})</summary><div className="rz-disclosure__body">{notes.map(note=><span key={note}>{note}</span>)}</div></details>;
function EventA({ctx}:{ctx:Ctx}) {
  return <><Bar title={`${event.name} · ${event.section}`} code={event.code} ctx={ctx}/><Scoreboard ctx={ctx}/><main className="rz-main proto-main">
    <h2 className="rz-section">Final</h2><FinalRows ctx={ctx} onRow={num=>ctx.menu({k:'runner',num})}/>{lineUp(ctx)}{exportLine}{confirmMedals(ctx)}
    <h2 className="rz-section">Races</h2><RaceRows ctx={ctx}/><h2 className="rz-section">Deleted races</h2><DeletedRows ctx={ctx}/><Notes/>
  </main></>;
}
function EventB({ctx}:{ctx:Ctx}) {
  const [tab,setTab]=useState<'Heats'|'Final'|'Races'|'Notes'>('Heats');
  return <><Bar title={`${event.name} · ${event.section}`} code={event.code} ctx={ctx}/>
    <nav className="rz-tabs proto-tabs" aria-label="Event">{(['Heats','Final','Races','Notes'] as const).map(item=><button key={item} type="button" aria-current={tab===item?'page':undefined} onClick={()=>setTab(item)}>{item}</button>)}</nav>
    {tab==='Heats' && <Scoreboard ctx={ctx}/>}
    <main className="rz-main proto-main">
      {tab==='Final' && <><p className="proto-meta">Final saved · confirm the medals</p><FinalRows ctx={ctx} onRow={num=>ctx.menu({k:'runner',num})}/>{lineUp(ctx)}{exportLine}{confirmMedals(ctx)}</>}
      {tab==='Races' && <><RaceRows ctx={ctx}/><h2 className="rz-section">Deleted races</h2><DeletedRows ctx={ctx}/></>}
      {tab==='Notes' && <ol className="proto-notes">{notes.map(note=><li key={note}>{note}</li>)}</ol>}
    </main></>;
}
function EventC({ctx}:{ctx:Ctx}) {
  const rows=leaderboard(ctx.day);
  return <><Bar title={`${event.name} · ${event.section}`} code={event.code} ctx={ctx}/><main className="rz-main proto-main">
    <article className="rz-racecard"><p className="rz-racecard__status">Final saved · confirm the medals</p>{confirmMedals(ctx)}
      <ol className="rz-heats" aria-label="Races">{[...liveHeats(ctx.day),'final' as const].map(race=><li key={race}><button type="button" className="rz-heat rz-heat--done" onClick={()=>ctx.push({k:'race',race})}>{race==='final'?'Final':`H${race}`}<Icon name="check"/></button></li>)}</ol></article>
    <h2 className="rz-section">Final</h2><FinalRows ctx={ctx} onRow={num=>ctx.menu({k:'runner',num})}/>{exportLine}
    <h2 className="rz-section">Heats · Q = fastest 6</h2>
    <ol className="rz-lead-rows" aria-label="Heats leaderboard">{rows.map(row=>{const warn=row.runner.num===warning.num && !ctx.day.checked;return <li key={row.runner.num}>
      <button type="button" className={`rz-lead-row proto-rowbtn${warn?' rz-lead-row--warn':''}`} aria-expanded={ctx.inline?.k==='runner' && ctx.inline.num===row.runner.num} onClick={()=>ctx.menu({k:'runner',num:row.runner.num})}>
        <span className="rz-lead-row__place">{row.rank??'–'}</span><span className="rz-lead-row__num">{row.runner.num} {row.q && <span className="rz-tag rz-tag--q">Q</span>}</span>
        <span className="rz-lead-row__end">{row.time===null?'DNF':fmt(row.time)}</span><span className="proto-rowsub">Heat {row.runner.heat}{warn?' · Not a Girl Cubs number':''}</span></button>
      {ctx.inline?.k==='runner' && ctx.inline.num===row.runner.num && <InlineRunner num={row.runner.num} ctx={ctx}/>}
      {row.rank===6 && <p className="proto-qline">Qualifying line</p>}</li>;})}
      {Object.keys(ctx.day.dq).map(num=><li key={num}><button type="button" className="rz-lead-row proto-rowbtn" onClick={()=>ctx.menu({k:'runner',num:Number(num)})}><span className="rz-lead-row__place">DQ</span><span className="rz-lead-row__num">{num}</span><span className="rz-lead-row__end"/><span className="proto-rowsub">{ctx.day.dq[Number(num)]}</span></button>
        {ctx.inline?.k==='runner' && ctx.inline.num===Number(num) && <InlineRunner num={Number(num)} ctx={ctx}/>}</li>)}</ol>
    {lineUp(ctx)}<h2 className="rz-section">Deleted races</h2><DeletedRows ctx={ctx}/><Notes/>
  </main></>;
}

// ---------- A runner ----------
interface RunnerAction { label:string; run:()=>void; danger?:boolean; primary?:boolean; line:string }
function runnerActions(num:number,ctx:Ctx):RunnerAction[] {
  const runner=runnerOf(num),dq=ctx.day.dq[num],warn=num===warning.num && !ctx.day.checked;
  return [
    ...(warn?[{label:'Mark checked',primary:true,line:'The warning stays in Notes, greyed.',run:()=>{ctx.set(()=>({checked:true}));ctx.close();ctx.say(`Warning checked · ${num}`);}}]:[]),
    {label:'Correct number',line:'They keep their place and time.',run:()=>ctx.say('Would open Correct number (same frame as Correct times)')},
    {label:`Open Heat ${runner.heat}`,line:'The race this result came from.',run:()=>ctx.push({k:'race',race:runner.heat})},
    dq?{label:'Lift disqualification',line:'Their result counts again.',run:()=>ctx.push({k:'lift',num})}:{label:`Disqualify ${num}`,danger:true,line:'Asks for a reason first.',run:()=>ctx.push({k:'disqualify',num})}];
}
function RunnerHead({num,ctx}:{num:number;ctx:Ctx}) {
  const runner=runnerOf(num),time=timeOf(ctx.day,runner),place=placeInRace(ctx.day,runner),warn=num===warning.num;
  return <><p className="proto-meta">{event.name} · {event.section} · Heat {runner.heat} · {place?`${ordinal(place)} in race · ${fmt(time!)}`:'Did not finish'}{ctx.day.dq[num]?` · Disqualified: ${ctx.day.dq[num]}`:''}</p>
    {warn && <><h2 className="rz-section">Notes</h2><ul className="rz-issues"><li className={ctx.day.checked?'rz-issue proto-issue--done':'rz-issue'}><h3 className="rz-issue__title">{warning.text}</h3><p className="rz-issue__body">{warning.by}{ctx.day.checked?' · Checked by Sara Ahmed':''}</p></li></ul></>}</>;
}
/** A: in a sheet. B: on a screen of its own, each action a list row with what it does. */
function RunnerBody({num,ctx}:{num:number;ctx:Ctx}) {
  const actions=runnerActions(num,ctx);
  if(ctx.variant==='B') return <><RunnerHead num={num} ctx={ctx}/><h2 className="rz-section">Actions</h2><ul className="rz-list">{actions.map(action=><li key={action.label}>
    <button type="button" className={`rz-listrow${action.danger?' proto-listrow--danger':''}`} onClick={action.run}><span className="rz-listrow__main"><span className="rz-listrow__label">{action.label}</span><span className="rz-listrow__meta">{action.line}</span></span><Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul></>;
  return <div className="proto-sheetbody"><RunnerHead num={num} ctx={ctx}/><div className="rz-sheet__actions">{actions.map(action=>
    <button key={action.label} type="button" className={`rz-btn rz-btn--block ${action.danger?'rz-btn--danger':action.primary?'rz-btn--primary':''}`} onClick={action.run}>{action.label}</button>)}</div></div>;
}
/** C: under the row, in place. */
function InlineRunner({num,ctx}:{num:number;ctx:Ctx}) {
  const warn=num===warning.num && !ctx.day.checked;
  return <div className="proto-inline">{warn && <p className="proto-inline__note"><Icon name="warning"/>{warning.text} {warning.by}.</p>}{ctx.day.dq[num] && <p className="proto-inline__note">Disqualified: {ctx.day.dq[num]}</p>}
    <div className="proto-inline__actions">{runnerActions(num,ctx).map(action=><button key={action.label} type="button" className={`rz-btn rz-btn--small ${action.danger?'rz-btn--danger':action.primary?'rz-btn--primary':''}`} onClick={action.run}>{action.label}</button>)}</div></div>;
}

// ---------- A race ----------
function raceActions(race:RaceId,ctx:Ctx):RunnerAction[] {
  if(typeof race==='number' && ctx.day.deleted[race]) return [
    {label:`Restore Heat ${race}`,primary:true,line:'Its results count again.',run:()=>ctx.push({k:'restore',heat:race})},
    {label:'Delete for good',danger:true,line:'Cannot be undone. Notes stay.',run:()=>ctx.push({k:'delete',race,forGood:true})}];
  return [
    ...(race==='final'?[]:[{label:'Correct times',line:'Retype a place time from the SprintTimer.',run:()=>ctx.push({k:'times',heat:race})}]),
    {label:'Correct finishing order',line:'Drag runners to their places. Times stay by place.',run:()=>ctx.say('Would open Correct finishing order (same frame as Correct times)')},
    {label:'Correct runner list',line:'Change, add or remove a wristband.',run:()=>ctx.say('Would open Correct runner list (same frame as Correct times)')},
    {label:'Re-run race',line:`${raceName(race)} moves to Deleted races; a new race opens.`,run:()=>ctx.push({k:'rerun',race})},
    {label:`Delete ${raceName(race)}`,danger:true,line:'Moves it to Deleted races, or deletes it for good.',run:()=>ctx.push({k:'delete',race})}];
}
/** A: block buttons in a sheet, Delete last and red. B: list rows with a line each. */
function RaceActionList({race,ctx}:{race:RaceId;ctx:Ctx}) {
  const actions=raceActions(race,ctx);
  if(ctx.variant==='B') return <ul className="rz-list">{actions.map(action=><li key={action.label}><button type="button" className={`rz-listrow${action.danger?' proto-listrow--danger':''}`} onClick={action.run}>
    <span className="rz-listrow__main"><span className="rz-listrow__label">{action.label}</span><span className="rz-listrow__meta">{action.line}</span></span><Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul>;
  return <div className="rz-sheet__actions">{actions.map(action=><button key={action.label} type="button" className={`rz-btn rz-btn--block ${action.danger?'rz-btn--danger proto-gap':action.primary?'rz-btn--primary':''}`} onClick={action.run}>{action.label}</button>)}</div>;
}
function RacePage({race,ctx}:{race:RaceId;ctx:Ctx}) {
  const {variant,day}=ctx,deleted=typeof race==='number' && !!day.deleted[race];
  const rows:Array<{num:number;place:number|null;time:number|null}>=race==='final'?finalOrder.map((num,index)=>({num,place:index+1,time:null}))
    :heatRunners[race]!.map(runner=>({num:runner.num,place:placeInRace(day,runner),time:timeOf(day,runner)})).sort((a,b)=>(a.place??99)-(b.place??99));
  const timed=rows.filter(row=>row.time!==null).length;
  const tap=(num:number)=>{if(!deleted) ctx.menu({k:'runner',num});};
  return <>
    <Bar title={raceName(race)} code={event.code} ctx={ctx} more={variant==='A' && <button type="button" className="rz-iconbtn" aria-label={`${raceName(race)} actions`} onClick={()=>ctx.menu({k:'race-actions',race})}><Icon name="more"/></button>}/>
    <main className="rz-main proto-main">
      <p className="proto-meta">{event.name} · {event.section} · {race==='final'?'final, 6 runners':`checked in ${checkedIn[race]}`} · {deleted?'deleted':'saved'}</p>
      {deleted && <Callout status message={`Deleted at ${day.deleted[race as number]} by Sara Ahmed: wrong section checked in. Its results do not count.`}/>}
      {race!=='final' && <span className="rz-tag rz-tag--ok"><Icon name="check"/>{timed} times · {rows.length-timed===0?`${timed} finishers`:`${timed} finishers · ${rows.length-timed} did not finish`}</span>}
      <ol className="rz-lead-rows" aria-label="Current record">{rows.map(row=>{const warn=row.num===warning.num && !day.checked;return <li key={row.num}>
        <button type="button" className={`rz-lead-row proto-rowbtn${warn?' rz-lead-row--warn':''}`} disabled={deleted} onClick={()=>tap(row.num)}>
          <span className="rz-lead-row__place">{row.place?ordinal(row.place):'–'}</span><span className="rz-lead-row__num">{row.num}{day.dq[row.num] && <span className="rz-tag rz-tag--dnf proto-tagpad">DQ</span>}</span>
          <span className="rz-lead-row__end">{race==='final'?'':row.time===null?<span className="rz-tag rz-tag--dnf">Did not finish</span>:fmt(row.time)}</span>{warn && <span className="proto-rowsub">Not a Girl Cubs number · kept</span>}</button>
        {variant==='C' && ctx.inline?.k==='runner' && ctx.inline.num===row.num && <InlineRunner num={row.num} ctx={ctx}/>}</li>;})}</ol>
      {variant==='B' && <ul className="rz-list"><li><button type="button" className="rz-listrow" onClick={()=>ctx.menu({k:'race-actions',race})}><span className="rz-listrow__main"><span className="rz-listrow__label">Race actions</span>
        <span className="rz-listrow__meta">{deleted?'Restore · Delete for good':'Correct · Re-run · Delete'}</span></span><Icon name="chevron-right" className="rz-icon--bold"/></button></li></ul>}
      {variant==='C' && <section className="proto-fix"><h2 className="rz-section">{deleted?'This deleted race':'Fix this race'}</h2>{raceActions(race,ctx).map(action=>
        <button key={action.label} type="button" className={`rz-btn rz-btn--block ${action.danger?'rz-btn--danger proto-gap':action.primary?'rz-btn--primary':''}`} onClick={action.run}>{action.label}</button>)}</section>}
      <details className="rz-disclosure"><summary>Saved versions (3)</summary><div className="rz-disclosure__body"><span>{race==='final'?'11:08':checkedIn[race]} · checked in · Amina Yusuf</span><span>11:12 · finishing order · Tom Barker</span>{race!=='final' && <span>11:15 · times · Grace Mensah</span>}</div></details>
    </main>
  </>;
}

// ---------- Correction and confirm screens (the same in every look) ----------
function TimesScreen({heat,ctx}:{heat:number;ctx:Ctx}) {
  const [digits,setDigits]=useState(()=>ctx.day.times[heat]!.map(time=>time===null?null:String(time)));
  const [editing,setEditing]=useState<number|null>(null),[comment,setComment]=useState('');
  const changed=digits.some((value,index)=>(value===null?null:Number(value))!==ctx.day.times[heat]![index]);
  const blank=digits.some(value=>value==='');
  return <>
    <Bar title="Correct times" code={event.code} ctx={ctx}/>
    <main className="rz-main proto-main"><Prompt meta={`${event.name} · ${event.section} · Heat ${heat}`} q={<>Correct the <em>times</em></>} help="Read the times from the SprintTimer. Tap a place to retype it."/>
      <ol className="rz-lead-rows" aria-label="Times">{digits.map((value,index)=><li key={index}>{editing===index && value!==null?<div className="rz-field proto-timefield">
        <label className="rz-field__label" htmlFor="proto-time">{ordinal(index+1)} place time</label>
        <input className="rz-field__input" id="proto-time" inputMode="numeric" autoFocus autoComplete="off" value={value} onChange={event=>{const next=event.target.value.replace(/\D/g,'').slice(0,6);setDigits(old=>old.map((item,at)=>at===index?next:item));}}
          onBlur={()=>setEditing(null)}/><p className="rz-field__hint">Shows as <strong>{fmtDigits(value)||'–'}</strong></p></div>
        :<button type="button" className="rz-lead-row proto-rowbtn" onClick={()=>value!==null && setEditing(index)}><span className="rz-lead-row__place">{ordinal(index+1)}</span>
          <span className="rz-lead-row__num">{value===null?<span className="rz-tag rz-tag--dnf">No finisher</span>:value?fmtDigits(value):'Time needed'}</span>{value!==null && <Icon name="pencil"/>}</button>}</li>)}</ol>
      <Comment value={comment} onChange={setComment}/></main>
    <DockedFooter>{(!changed || blank) && <p className="rz-footer__reason">{blank?'Type a time for each place.':'Change a time to save.'}</p>}
      <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={!changed || blank || undefined} onClick={()=>{if(!changed || blank) return;
        ctx.set(day=>({times:{...day.times,[heat]:digits.map(value=>value===null?null:Number(value))}}));ctx.say(`Times saved · ${event.section} Heat ${heat}`);ctx.back();}}>Save times</button></DockedFooter>
  </>;
}
function DeleteScreen({race,forGood,ctx}:{race:RaceId;forGood?:boolean;ctx:Ctx}) {
  const [good,setGood]=useState(!!forGood);
  return <Confirm ctx={ctx} title="Delete race" meta={`${event.name} · ${event.section} · ${raceName(race)}`} q={<>Delete <em>{raceName(race)}?</em></>}
    help={forGood?'It is already in Deleted races. Deleting it for good cannot be undone. Notes stay.':'Its results stop counting. You can restore it from Deleted races.'}
    button={good?`Delete ${raceName(race)} for good`:`Delete ${raceName(race)}`} danger comment
    onConfirm={()=>{if(typeof race==='number') ctx.set(day=>({deleted:good?Object.fromEntries(Object.entries(day.deleted).filter(([heat])=>Number(heat)!==race)):{...day.deleted,[race]:'11:31'}}));
      ctx.say(good?`${raceName(race)} deleted for good`:`${raceName(race)} deleted · in Deleted races`);ctx.backTo('event');}}>
    {!forGood && <div className="proto-choices" role="radiogroup" aria-label="How to delete">
      <button type="button" role="radio" aria-checked={!good} className="rz-choice proto-choice" aria-pressed={!good} onClick={()=>setGood(false)}><span><b>Move to Deleted races</b><small>You can restore it later.</small></span></button>
      <button type="button" role="radio" aria-checked={good} className="rz-choice proto-choice" aria-pressed={good} onClick={()=>setGood(true)}><span><b>Delete for good</b><small>Cannot be undone. Notes stay.</small></span></button></div>}
  </Confirm>;
}
function Disqualify({num,ctx}:{num:number;ctx:Ctx}) {
  const [reason,setReason]=useState('');const runner=runnerOf(num),place=placeInRace(ctx.day,runner);
  return <Confirm ctx={ctx} title="Disqualify" meta={`${event.name} · ${event.section} · Heat ${runner.heat} · ${place?`${ordinal(place)} in race`:'Did not finish'}`} q={<>Why is <em>{num}</em> disqualified?</>}
    help="Their result stops counting. It stays on the leaderboard, crossed out." button={`Disqualify ${num}`} danger comment reason={reason?'':'Choose a reason.'}
    onConfirm={()=>{ctx.set(day=>({dq:{...day.dq,[num]:reason}}));ctx.say(`${num} disqualified · ${reason}`);ctx.backTo('event');}}>
    <div className="rz-choices" role="radiogroup" aria-label="Reason">{disqualificationReasons.map(item=><button key={item} type="button" role="radio" aria-checked={item===reason} className="rz-choice" aria-pressed={item===reason} onClick={()=>setReason(item)}>{item}</button>)}</div>
  </Confirm>;
}

// ---------- Day setup ----------
function ThisDay({ctx,onSave}:{ctx:Ctx;onSave?:boolean}) {
  const {day}=ctx;
  const pick=(field:'region'|'day',value:string)=>{ctx.set(()=>({[field]:value}));if(!onSave) ctx.say(`${field==='region'?'Region':'Day'} saved · ${field==='day'?`Day ${value}`:value}`);};
  return <section className="rz-codecard proto-thisday" aria-label="This day"><h2 className="rz-codecard__label">This day</h2>
    <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="proto-year">Year</label><input className="rz-field__input" id="proto-year" inputMode="numeric" value={day.year} onChange={event=>ctx.set(()=>({year:event.target.value.replace(/\D/g,'').slice(0,4)}))}/></div>
    <fieldset><legend className="rz-field__label">Region</legend><div className="rz-choices proto-row3">{['North','South','National'].map(item=><button key={item} type="button" className="rz-choice" aria-pressed={day.region===item} onClick={()=>pick('region',item)}>{item}</button>)}</div></fieldset>
    <fieldset><legend className="rz-field__label">Day</legend><div className="rz-choices proto-row5">{['1','2','3','4','5'].map(item=><button key={item} type="button" className="rz-choice" aria-pressed={day.day===item} onClick={()=>pick('day',item)}>{item}</button>)}</div></fieldset>
    <p className="rz-codecard__text">Goes on the Day export. Any lead can change it.</p></section>;
}
function Codes({ctx}:{ctx:Ctx}) {
  return <>
    <section className="rz-codecard"><h2 className="rz-codecard__label">Olympics password</h2><p className="rz-codecard__value">lantern42</p><p className="rz-codecard__text">Volunteers type this once on their phone. It stays the same when a new day starts.</p>
      <button type="button" className="rz-btn rz-btn--small" onClick={()=>ctx.say('Would open Change Olympics password (a screen that asks first)')}>Change Olympics password</button></section>
    <section className="rz-codecard"><h2 className="rz-codecard__label">Lead code</h2><p className="rz-codecard__value">{ctx.day.leadCode}</p><p className="rz-codecard__text">Give this only to zone leads.</p>
      <button type="button" className="rz-btn rz-btn--small" onClick={()=>ctx.menu({k:'ask',ask:{kind:'lead-code'}})}>Make a new lead code</button>
      {ctx.inline?.k==='ask' && ctx.inline.ask.kind==='lead-code' && <InlineAsk ask={ctx.inline.ask} ctx={ctx}/>}</section>
  </>;
}
function Export({ctx}:{ctx:Ctx}) {
  const missing=[!ctx.day.region && 'Region',!ctx.day.day && 'Day'].filter(Boolean).join(' and ');
  return <section className="rz-codecard" aria-label="Day export"><h2 className="rz-codecard__label">Day export</h2><p className="rz-codecard__text">Excel file of today's results for the scoring workbook. {ctx.day.exported?'Last downloaded 11:40, includes every change so far.':'Not downloaded yet.'}</p>
    {missing && <Callout message={`Set the ${missing} under This day first.`}/>}
    <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={!!missing || undefined} onClick={()=>{if(missing) return;ctx.set(()=>({exported:true}));ctx.say(`Downloaded · msf-running-${ctx.day.region.toLowerCase()}-day-${ctx.day.day}-2026-11-07.xlsx`);}}>Download day export</button></section>;
}
function NewDay({ctx}:{ctx:Ctx}) {
  const [typed,setTyped]=useState('');
  return <section className="rz-codecard proto-danger" aria-label="Start a new day"><h2 className="rz-codecard__label">Start a new day</h2><p className="rz-codecard__text">Clears today's races. Download the day export first.</p>
    <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="proto-newday">Type NEW DAY to confirm</label><input className="rz-field__input" id="proto-newday" autoCapitalize="characters" autoComplete="off" value={typed} onChange={event=>setTyped(event.target.value)}/></div>
    <button type="button" className="rz-btn rz-btn--danger rz-btn--block" aria-disabled={typed!=='NEW DAY' || undefined} onClick={()=>{if(typed==='NEW DAY') ctx.say('Prototype: would clear today and open Day setup');}}>Start a new day</button></section>;
}
const dayRows=(ctx:Ctx)=>[
  {label:'This day',meta:ctx.day.region && ctx.day.day?`${ctx.day.region} · Day ${ctx.day.day} · ${ctx.day.year}`:'Region and Day not set',warn:!ctx.day.day,view:{k:'this-day'} as View},
  {label:'Codes',meta:`Olympics password · lead code ${ctx.day.leadCode}`,view:{k:'codes'} as View},
  {label:'Phones',meta:`${ctx.day.phones.length} people signed in today`,view:{k:'phones'} as View},
  {label:'Events',meta:`${ctx.day.events.length} events · ${ctx.day.events.filter(item=>!item.on).length} switched off`,view:{k:'events'} as View},
  {label:'Day export',meta:ctx.day.exported?'Downloaded 11:40':'Not downloaded yet',view:{k:'export'} as View},
  {label:'Start a new day',meta:"Clears today's races",danger:true,view:{k:'new-day'} as View}];
function DayA({ctx}:{ctx:Ctx}) {
  return <><Bar title="Day setup" ctx={ctx}/><main className="rz-main proto-main">
    <ThisDay ctx={ctx}/><Codes ctx={ctx}/>
    <ul className="rz-list">{dayRows(ctx).slice(2,4).map(row=><li key={row.label}><button type="button" className="rz-listrow" onClick={()=>ctx.push(row.view)}><span className="rz-listrow__main"><span className="rz-listrow__label">{row.label}</span><span className="rz-listrow__meta">{row.meta}</span></span><Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul>
    <Export ctx={ctx}/><NewDay ctx={ctx}/>
  </main></>;
}
function DayB({ctx}:{ctx:Ctx}) {
  return <><Bar title="Day setup" ctx={ctx}/><main className="rz-main proto-main"><ul className="rz-list">{dayRows(ctx).map(row=><li key={row.label}>
    <button type="button" className={`rz-listrow${row.warn?' rz-listrow--warn':''}${row.danger?' proto-listrow--danger':''}`} onClick={()=>ctx.push(row.view)}><span className="rz-listrow__main"><span className="rz-listrow__label">{row.label}</span><span className="rz-listrow__meta">{row.meta}</span></span><Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul></main></>;
}
function DayC({ctx}:{ctx:Ctx}) {
  return <><Bar title="Day setup" ctx={ctx}/><main className="rz-main proto-main">
    <ThisDay ctx={ctx}/><Codes ctx={ctx}/>
    <h2 className="rz-section">Signed in today</h2><PhoneRows ctx={ctx}/>
    <h2 className="rz-section">Events</h2><EventRows ctx={ctx}/>
    <Export ctx={ctx}/><NewDay ctx={ctx}/>
  </main></>;
}
function PhoneRows({ctx}:{ctx:Ctx}) {
  return <ul className="proto-cards">{ctx.day.phones.map(phone=><li key={phone.id} className="rz-codecard proto-card">
    <p className="proto-card__title">{phone.name}{phone.you?' (you)':''}</p><p className="rz-codecard__text">{phone.level}{phone.owner?' · Owner':''}</p>
    {!phone.you && <div className="proto-card__actions">
      {!phone.owner && <button type="button" className="rz-btn rz-btn--small" onClick={()=>{ctx.set(day=>({phones:day.phones.map(item=>item.id===phone.id?{...item,level:item.level==='Lead'?'Volunteer':'Lead'}:item)}));ctx.say(`${phone.name} is a ${phone.level==='Lead'?'volunteer':'lead'} now · today only`);}}>{phone.level==='Lead'?'Make volunteer':'Make lead'}</button>}
      <button type="button" className="rz-btn rz-btn--small proto-btn--dangerlink" onClick={()=>ctx.menu({k:'ask',ask:{kind:'remove',id:phone.id}})}>Remove</button></div>}
    {ctx.inline?.k==='ask' && ctx.inline.ask.kind==='remove' && ctx.inline.ask.id===phone.id && <InlineAsk ask={ctx.inline.ask} ctx={ctx}/>}
  </li>)}</ul>;
}
function EventRows({ctx}:{ctx:Ctx}) {
  const [renaming,setRenaming]=useState<string|null>(null),[name,setName]=useState('');
  return <><ul className="proto-cards">{ctx.day.events.map(item=><li key={item.code} className={`rz-codecard proto-card${item.on?'':' proto-card--off'}`}>
    <p className="proto-card__title">{item.code} · {item.name}</p><p className="rz-codecard__text">{item.section} · {item.type} · {item.format}{item.on?'':' · Switched off'}</p>
    {ctx.variant==='C' && renaming===item.code?<div className="proto-inline"><div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="proto-rename">New name for {item.code}</label><input className="rz-field__input" id="proto-rename" autoFocus value={name} onChange={event=>setName(event.target.value)}/></div>
      <div className="proto-inline__actions"><button type="button" className="rz-btn rz-btn--small rz-btn--primary" onClick={()=>{ctx.set(day=>({events:day.events.map(other=>other.code===item.code?{...other,name}:other)}));setRenaming(null);ctx.say(`Name saved · ${item.code} ${name}`);}}>Save name</button><button type="button" className="rz-btn rz-btn--small" onClick={()=>setRenaming(null)}>Cancel</button></div></div>
    :<div className="proto-card__actions"><button type="button" className="rz-btn rz-btn--small" onClick={()=>{if(ctx.variant==='C') {setName(item.name);setRenaming(item.code);} else ctx.push({k:'rename',code:item.code});}}>Rename</button>
      <button type="button" className="rz-btn rz-btn--small" onClick={()=>{ctx.set(day=>({events:day.events.map(other=>other.code===item.code?{...other,on:!other.on}:other)}));ctx.say(`${item.code} switched ${item.on?'off':'on'}`);}}>{item.on?'Switch off':'Switch on'}</button></div>}
  </li>)}</ul><button type="button" className="rz-btn rz-btn--block" onClick={()=>ctx.say('Would open Add an event (a screen: code, name, section, Races or Hurdles, format)')}><Icon name="plus"/>Add an event</button></>;
}
function Rename({code,ctx}:{code:string;ctx:Ctx}) {
  const item=ctx.day.events.find(other=>other.code===code)!;const [name,setName]=useState(item.name);
  return <><Bar title={`Rename ${code}`} ctx={ctx}/><main className="rz-main proto-main"><Prompt meta={`${code} · ${item.section}`} q={<>New name for <em>{code}?</em></>} help="Races, Results and the Day export show the new name."/>
    <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="proto-name">Event name</label><input className="rz-field__input" id="proto-name" value={name} onChange={event=>setName(event.target.value)}/></div></main>
    <DockedFooter>{(!name.trim() || name===item.name) && <p className="rz-footer__reason">Change the name to save.</p>}<button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={!name.trim() || name===item.name || undefined}
      onClick={()=>{if(!name.trim() || name===item.name) return;ctx.set(day=>({events:day.events.map(other=>other.code===code?{...other,name}:other)}));ctx.say(`Name saved · ${code} ${name}`);ctx.back();}}>Save name</button></DockedFooter></>;
}

// ---------- Risky actions ask first ----------
function askText(ask:Ask,ctx:Ctx) {
  if(ask.kind==='remove') {const phone=ctx.day.phones.find(item=>item.id===ask.id)!;return {
    title:`Remove ${phone.name}?`,text:`Their phone goes back to Join and drops anything it has not saved. They can join again with the Olympics password.`,
    yes:`Remove ${phone.name}`,no:`Keep ${phone.name}`,run:()=>{ctx.set(day=>({phones:day.phones.filter(item=>item.id!==ask.id)}));ctx.say(`${phone.name} removed · signed out`);}};}
  return {title:'Make a new lead code?',text:'Other leads go back to being volunteers until they type the new code. You and the owner keep lead access.',yes:'Make a new lead code',no:`Keep ${ctx.day.leadCode}`,
    run:()=>{ctx.set(()=>({leadCode:'7390'}));ctx.say('New lead code · 7390');}};
}
function AskSheet({ask,ctx}:{ask:Ask;ctx:Ctx}) {
  const text=askText(ask,ctx);
  return <Sheet title={text.title} onClose={ctx.close}><p className="rz-sheet__text">{text.text}</p><div className="rz-sheet__actions">
    <button type="button" className="rz-btn rz-btn--danger rz-btn--block" onClick={()=>{text.run();ctx.close();}}>{text.yes}</button>
    <button type="button" className="rz-btn rz-btn--block" onClick={ctx.close}>{text.no}</button></div></Sheet>;
}
function AskScreen({ask,ctx}:{ask:Ask;ctx:Ctx}) {
  const text=askText(ask,ctx);
  return <><Bar title={ask.kind==='remove'?'Remove':'Lead code'} ctx={ctx}/><main className="rz-main proto-main"><Prompt q={text.title} help={text.text}/></main>
    <DockedFooter><div className="rz-footer__pair"><button type="button" className="rz-btn" onClick={ctx.back}>{text.no}</button><button type="button" className="rz-btn rz-btn--danger" onClick={()=>{text.run();ctx.back();}}>{text.yes}</button></div></DockedFooter></>;
}
function InlineAsk({ask,ctx}:{ask:Ask;ctx:Ctx}) {
  const text=askText(ask,ctx);
  return <div className="proto-inline proto-inline--ask"><p className="proto-inline__q">{text.title}</p><p className="proto-inline__note">{text.text}</p>
    <div className="proto-inline__actions"><button type="button" className="rz-btn rz-btn--small rz-btn--danger" onClick={()=>{text.run();ctx.close();}}>{text.yes}</button><button type="button" className="rz-btn rz-btn--small" onClick={ctx.close}>{text.no}</button></div></div>;
}
