/**
 * PROTOTYPE - throwaway, never merged (wayfinder map #231, ticket #243: what do the tie sheet and the "Confirm the medals"
 * check sheet look like in the Running Zone design?). Client only, at /prototype/lead-sheets: an in-memory 200m · Boy Cubs
 * (timed, 3 heats, no final) on the real Running Zone parts, no server. Races home shows the event under "Action required"
 * with "Confirm the medals". Two things must be settled first: a tie at 30.00 (1009 in Heat 1, 1011 in Heat 2) that decides
 * 2nd and 3rd, and Heat 3, still in progress. One warning is worth a look. Three looks, switched by the pink pill (or ?variant=A|B|C):
 *   A - Bottom sheets: both stay design-system Sheets (× close, scrim tap). The tie sheet works in two steps in one sheet.
 *       The fix line is plain text above Confirm, worded as decided in #241.
 *   B - Full screens: both become screens (the design system says a form longer than one field is a screen), with a docked
 *       Confirm / Save tie. Things to settle are IssueCards; the medal places are the navy scoreboard and each row opens its heat.
 *   C - One checklist: Confirm the medals is one screen of numbered steps; the tie is settled in place (no tie sheet at all),
 *       and each medal place has its own Fix button.
 */
import { useEffect,useId,useState,type ReactNode } from 'react';
import { ordinal } from '../../shared/ordinal.js';
import { SortableList } from '../flow/SortableList.js';
import { Callout,DockedFooter,HomeBar,Icon,RaceBar,RoleChip,Screen,Sheet,Star } from '../races/parts.js';
import './LeadSheets.prototype.css';

type Variant='A'|'B'|'C';
const variants:Variant[]=['A','B','C'];
const variantNames:Record<Variant,string>={A:'Bottom sheets',B:'Full screens',C:'One checklist'};
type Outcome='no-run-off'|'run-off'|'decided';
const outcomeLabels:Record<Outcome,string>={'no-run-off':'No run-off needed','run-off':'Run-off held','decided':'Decided without a run-off'};
interface Runner { num:number; heat:number; time:string }
const fastest:Runner={num:1004,heat:2,time:'28.91'};
const tied:Runner[]=[{num:1009,heat:1,time:'30.00'},{num:1011,heat:2,time:'30.00'}];
const event={name:'200m',section:'Boy Cubs',code:'E2'};
const fixLine='A place is wrong? Close this, open the race and choose Correct times.';
interface Tie { outcome:Outcome; order:number[]; comment:string }
interface Day { tie:Tie|null; heat3:boolean; warningSeen:boolean; confirmed:boolean }
const freshDay=():Day=>({tie:null,heat3:false,warningSeen:false,confirmed:false});
type View={kind:'races'}|{kind:'check'}|{kind:'tie';from:'check'|'races'};
interface Toast { text:string; action?:{label:string;run:()=>void} }

const byNum=(num:number)=>[fastest,...tied].find(runner=>runner.num===num)!;
/** No run-off keeps the listed order; a run-off or a decision puts the tied runners in the order the lead dragged. */
const medals=(day:Day):Runner[]=>[fastest,...(day.tie && day.tie.outcome!=='no-run-off'?day.tie.order.map(byNum):tied)];
interface Settle { id:'tie'|'heat3'; title:string; body:string; open:string }
const toSettle=(day:Day):Settle[]=>[
  ...(day.tie?[]:[{id:'tie' as const,title:'A tie decides 2nd and 3rd',body:'1009 (Heat 1) and 1011 (Heat 2) both ran 30.00.',open:'Settle tie'}]),
  ...(day.heat3?[]:[{id:'heat3' as const,title:'Heat 3 is not saved',body:'2 checked in. Finish its steps or delete it.',open:'Open Heat 3'}])];
const warning={title:'A runner was added at the finish',body:'1010 in Heat 1 was not checked in. The finish line added them.',open:'Open Heat 1'};
const reason=(count:number)=>count?`Settle ${count===1?'1 thing':`${count} things`} first.`:'';

function firstVariant():Variant {
  const asked=new URLSearchParams(location.search).get('variant');
  return variants.includes(asked as Variant)?asked as Variant:'A';
}
export function LeadSheetsPrototype() {
  const [variant,setVariant]=useState<Variant>(firstVariant);
  const [day,setDay]=useState<Day>(freshDay);
  const [view,setView]=useState<View>({kind:'races'});
  const [toast,setToast]=useState<Toast|null>(null);
  function restart() {setDay(freshDay());setView({kind:'races'});setToast(null);}
  function cycle(step:number) {
    const next=variants[(variants.indexOf(variant)+step+variants.length)%variants.length]!;
    const params=new URLSearchParams(location.search);params.set('variant',next);history.replaceState(null,'',`${location.pathname}?${params}`);
    setVariant(next);restart();
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;if(event.key==='ArrowLeft') cycle(-1);if(event.key==='ArrowRight') cycle(1);};
    addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);
  });
  useEffect(()=>{if(!toast) return;const timer=setTimeout(()=>setToast(null),6000);return ()=>clearTimeout(timer);},[toast]);
  const ctx:Ctx={day,variant,
    say:(text,action)=>setToast({text,action}),
    /** Leaving the prototype: say where the real app would go. Heat 3 can be pretended saved so Confirm can be tried. */
    away:target=>setToast(target==='heat3'?{text:'Would open Heat 3 on Check-in.',action:{label:'Pretend saved',run:()=>{setDay(current=>({...current,heat3:true}));setToast(null);}}}:{text:`Would open ${target}.`}),
    openTie:from=>setView({kind:'tie',from}),
    saveTie:tie=>{setDay(current=>({...current,tie}));setToast({text:`Tie saved · ${outcomeLabels[tie.outcome]}`});setView(view.kind==='tie' && view.from==='races'?{kind:'races'}:{kind:'check'});},
    seen:()=>setDay(current=>({...current,warningSeen:true})),
    confirm:()=>{setDay(current=>({...current,confirmed:true}));setView({kind:'races'});setToast({text:`Medals confirmed · ${event.name} ${event.section}`});},
    close:()=>setView(view.kind==='tie' && view.from==='check'?{kind:'check'}:{kind:'races'}),
    openCheck:()=>setView({kind:'check'})};
  const state=`Tie: ${day.tie?outcomeLabels[day.tie.outcome]:'open'} · Heat 3: ${day.heat3?'saved':'in progress'} · Medals: ${day.confirmed?'confirmed':'not yet'}`;
  // A's sheets lie over Races; B's and C's are screens of their own.
  const screen=variant==='A' || view.kind==='races';
  return <Screen screen="Lead sheets prototype">
    <div className="proto-switcher" aria-label="Prototype variant"><div className="proto-switcher__pill"><button type="button" aria-label="Previous variant" onClick={()=>cycle(-1)}>‹</button>
      <span>{variant} · {variantNames[variant]}</span><button type="button" aria-label="Next variant" onClick={()=>cycle(1)}>›</button>
      <button type="button" className="proto-switcher__reset" aria-label="Start again" onClick={restart}>↺</button></div>
      <p className="proto-state">{state}</p></div>
    {screen && <RacesHost ctx={ctx}/>}
    {variant==='A' && view.kind==='check' && <CheckSheetA ctx={ctx}/>}
    {variant==='A' && view.kind==='tie' && <TieSheetA ctx={ctx}/>}
    {variant==='B' && view.kind==='check' && <CheckScreenB ctx={ctx}/>}
    {variant==='B' && view.kind==='tie' && <TieScreenB ctx={ctx}/>}
    {variant==='C' && view.kind!=='races' && <ChecklistC ctx={ctx} tieFirst={view.kind==='tie'}/>}
    {toast && <div className="rz-toast" role="status"><span className="rz-toast__msg">{toast.text}</span>{toast.action && <button type="button" onClick={toast.action.run}>{toast.action.label}</button>}</div>}
  </Screen>;
}
interface Ctx {
  day:Day; variant:Variant; say:(text:string,action?:Toast['action'])=>void; away:(target:string)=>void;
  openTie:(from:'check'|'races')=>void; saveTie:(tie:Tie)=>void; seen:()=>void; confirm:()=>void; close:()=>void; openCheck:()=>void;
}

/** Races home as a lead sees it today: the event under "Action required", with Confirm the medals on its card. */
function RacesHost({ctx}:{ctx:Ctx}) {
  const {day}=ctx;
  return <>
    <HomeBar><RoleChip role="lead" onOpen={()=>{}}/></HomeBar>
    <main className="rz-main">
      <h2 className="rz-section">{day.confirmed?'Done':'Action required'}</h2>
      <article className="rz-racecard" aria-label={`${event.name} · ${event.section}`}>
        <div className="rz-racecard__head"><h3 className="rz-racecard__title">{event.name} · {event.section}</h3><span className="rz-code-tag">{event.code}</span></div>
        <p className="rz-racecard__status">{day.confirmed?'Medals confirmed':`3 heats · ${toSettle(day).length?`${toSettle(day).length} to settle`:'medals ready to confirm'}`}</p>
        {!day.confirmed && <button type="button" className="rz-btn rz-btn--primary rz-btn--block" onClick={ctx.openCheck}>Confirm the medals</button>}
        <ol className="rz-heats" aria-label="Heats">{[1,2,3].map(heat=><li key={heat}><span className={`rz-heat rz-heat--${heat<3 || day.heat3?'done':'waiting'}`}>Heat {heat}{(heat<3 || day.heat3) && <Icon name="check"/>}</span></li>)}</ol>
      </article>
      {!day.tie && <p className="proto-note">The tie also opens on its own, as from a TIE tag in Results: <button type="button" className="rz-btn rz-btn--small" onClick={()=>ctx.openTie('races')}>Open the tie</button></p>}
    </main>
  </>;
}

/** The three medal places with a star; the tied two carry a TIE tag until the tie is settled. `onRow` makes each a button. */
function Medals({day,onRow,fix}:{day:Day;onRow?:(runner:Runner)=>void;fix?:(runner:Runner)=>void}) {
  return <ol className="proto-medals" aria-label="Medal places">{medals(day).map((runner,index)=>{
    const body=<><span className="proto-medal__star"><Star/><b>{index+1}</b></span><span className="proto-medal__who"><span className="proto-medal__num">{runner.num}</span>
      <span className="proto-medal__meta">{!day.tie && runner.time==='30.00' && <span className="rz-tag rz-tag--tie">Tie</span>}Heat {runner.heat} · {runner.time}</span></span></>;
    return <li key={runner.num} className="proto-medal-li">{onRow?<button type="button" className="proto-medal" aria-label={`${ordinal(index+1)}: ${runner.num}. Open Heat ${runner.heat}`} onClick={()=>onRow(runner)}>{body}<Icon name="chevron-right"/></button>
      :<div className="proto-medal">{body}{fix && <button type="button" className="rz-btn rz-btn--small" aria-label={`Fix ${ordinal(index+1)}: ${runner.num}`} onClick={()=>fix(runner)}><Icon name="pencil"/>Fix</button>}</div>}</li>;
  })}</ol>;
}

/** The tie's choice and, when the order matters, the drag list and comment. Shared by every look; only its frame differs. */
function TieForm({tie,setTie,choices}:{tie:Tie|null;setTie:(tie:Tie)=>void;choices:'chips'|'none'}) {
  const id=useId();
  const choose=(outcome:Outcome)=>setTie({outcome,order:tie?.order??tied.map(runner=>runner.num),comment:tie?.comment??''});
  return <>
    {choices==='chips' && <div className="proto-choices" role="group" aria-label="How was the tie decided?">
      {(Object.keys(outcomeLabels) as Outcome[]).map(outcome=><button key={outcome} type="button" aria-pressed={tie?.outcome===outcome} className="rz-choice" onClick={()=>choose(outcome)}>{outcomeLabels[outcome]}</button>)}
    </div>}
    {tie && tie.outcome!=='no-run-off' && <>
      <h3 className="rz-section">Order, 2nd first</h3>
      <p className="proto-help">Drag a handle to move a runner. Both keep their time of 30.00.</p>
      <SortableList label="Tie order" items={tie.order} itemKey={num=>num} itemName={String}
        look={{list:'rz-orderrows',row:'rz-orderrow',handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:name=>`Move ${name}`}}
        onReorder={order=>setTie({...tie,order})}
        renderItem={(num,place)=><><span className="rz-orderrow__place">{ordinal(place+1)}</span><span className="rz-orderrow__num">{num} <small className="proto-heat">Heat {byNum(num).heat}</small></span></>}/>
    </>}
    {tie && <div className="rz-field rz-field--text proto-comment">
      <label className="rz-field__label" htmlFor={id}>{tie.outcome==='decided'?'Comment (needed)':'Comment (optional)'}</label>
      <textarea className="rz-field__input" id={id} maxLength={1000} placeholder={tie.outcome==='decided'?'For example: photo finish':undefined} value={tie.comment} onChange={event=>setTie({...tie,comment:event.target.value})}/>
    </div>}
  </>;
}
const tieReady=(tie:Tie|null)=>!!tie && (tie.outcome!=='decided' || tie.comment.trim().length>0);
const tieReason=(tie:Tie|null)=>!tie?'Choose how the tie was decided.':!tieReady(tie)?'Write why it was decided this way.':'';

/** A: the check sheet as a design-system Sheet. Settle-first items are amber callouts; the fix line is plain text. */
function CheckSheetA({ctx}:{ctx:Ctx}) {
  const settle=toSettle(ctx.day);
  return <Sheet title="Confirm the medals" onClose={ctx.close}>
    <p className="rz-sheet__text">{event.name} · {event.section} · 3 heats. These places go to the Day export.</p>
    {settle.length>0 && <><h3 className="rz-section">Settle first</h3>
      {settle.map(item=><Callout key={item.id} message={<><strong>{item.title}.</strong> {item.body}</>}
        actions={<button type="button" className="rz-btn rz-btn--primary" onClick={()=>item.id==='tie'?ctx.openTie('check'):ctx.away('heat3')}>{item.open}</button>}/>)}</>}
    {!ctx.day.warningSeen && <><h3 className="rz-section">Worth a look</h3>
      <Callout status message={<><strong>{warning.title}.</strong> {warning.body}</>} actions={<><button type="button" className="rz-btn" onClick={()=>ctx.away('Heat 1 on Results')}>{warning.open}</button><button type="button" className="rz-btn" onClick={ctx.seen}>It's fine</button></>}/></>}
    <h3 className="rz-section">Medal places</h3>
    <Medals day={ctx.day}/>
    <p className="proto-fixline"><Icon name="pencil"/>{fixLine}</p>
    <div className="rz-sheet__foot">
      {settle.length>0 && <p className="rz-footer__reason">{reason(settle.length)}</p>}
      <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={settle.length>0 || undefined} onClick={()=>{if(!settle.length) ctx.confirm();}}>Confirm the medals</button>
      <button type="button" className="rz-btn rz-btn--small rz-btn--block" onClick={ctx.close}>Not yet</button>
    </div>
  </Sheet>;
}
/** A: the tie sheet. Step 1 is the three choices as stacked buttons; choosing one moves to step 2 in the same sheet. */
function TieSheetA({ctx}:{ctx:Ctx}) {
  const [tie,setTie]=useState<Tie|null>(ctx.day.tie);
  const [step,setStep]=useState<1|2>(tie?2:1);
  return <Sheet title="Tie at 30.00" onClose={ctx.close}>
    {step===1?<>
      <p className="rz-sheet__text">1009 (Heat 1) and 1011 (Heat 2) have the same time. The tie decides 2nd and 3rd.</p>
      <div className="rz-sheet__actions">{(Object.keys(outcomeLabels) as Outcome[]).map(outcome=><button key={outcome} type="button" className="rz-btn rz-btn--block"
        onClick={()=>{setTie({outcome,order:tie?.order??tied.map(runner=>runner.num),comment:tie?.comment??''});setStep(2);}}>{outcomeLabels[outcome]}</button>)}</div>
      <div className="rz-sheet__foot"><button type="button" className="rz-btn rz-btn--small rz-btn--block" onClick={ctx.close}>Not yet</button></div>
    </>:<>
      <div className="rz-heading-row"><p className="rz-sheet__text"><strong>{outcomeLabels[tie!.outcome]}</strong></p><button type="button" className="rz-btn rz-btn--small" onClick={()=>setStep(1)}>Change</button></div>
      <TieForm tie={tie} setTie={setTie} choices="none"/>
      <div className="rz-sheet__foot">
        {!tieReady(tie) && <p className="rz-footer__reason">{tieReason(tie)}</p>}
        <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={!tieReady(tie) || undefined} onClick={()=>{if(tieReady(tie)) ctx.saveTie(tie!);}}>Save tie</button>
        <button type="button" className="rz-btn rz-btn--small rz-btn--block" onClick={ctx.close}>Not yet</button>
      </div>
    </>}
  </Sheet>;
}

/** B: a full screen with the race bar (back), a prompt, IssueCards to settle, the navy scoreboard of medals and a docked Confirm. */
function CheckScreenB({ctx}:{ctx:Ctx}) {
  const settle=toSettle(ctx.day);
  return <>
    <RaceBar title={`${event.name} · ${event.section}`} code={event.code} role="lead" onBack={ctx.close}><RoleChip role="lead" onOpen={()=>{}}/></RaceBar>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">3 heats · no final</p><h1 className="rz-prompt__q">Confirm the <em>medals</em></h1>
        <p className="rz-prompt__help">Check the places, then confirm. They go to the Day export.</p></div>
      {settle.length>0 && <><h2 className="rz-section">Settle first</h2><ul className="rz-issues">{settle.map(item=><li key={item.id} className="rz-issue">
        <h3 className="rz-issue__title">{item.title}</h3><p className="rz-issue__body">{item.body}</p>
        <button type="button" className="rz-btn rz-btn--primary rz-btn--small" onClick={()=>item.id==='tie'?ctx.openTie('check'):ctx.away('heat3')}>{item.open}</button></li>)}</ul></>}
      {!ctx.day.warningSeen && <><h2 className="rz-section">Worth a look</h2><ul className="rz-issues"><li className="rz-issue">
        <h3 className="rz-issue__title">{warning.title}</h3><p className="rz-issue__body">{warning.body}</p>
        <div className="rz-row"><button type="button" className="rz-btn rz-btn--small" onClick={()=>ctx.away('Heat 1 on Results')}>{warning.open}</button><button type="button" className="rz-btn rz-btn--small" onClick={ctx.seen}>It's fine</button></div></li></ul></>}
      <h2 className="rz-section">Medal places</h2>
      <p className="proto-help">A place is wrong? Tap it to open its heat, then choose Correct times.</p>
      <Medals day={ctx.day} onRow={runner=>ctx.away(`Heat ${runner.heat} on Times, with Correct times`)}/>
    </main>
    <DockedFooter>
      {settle.length>0 && <p className="rz-footer__reason">{reason(settle.length)}</p>}
      <button type="button" className="rz-btn rz-btn--display rz-btn--block" aria-disabled={settle.length>0 || undefined} onClick={()=>{if(!settle.length) ctx.confirm();}}>Confirm the medals</button>
    </DockedFooter>
  </>;
}
/** B: the tie as a full screen: prompt, choices as chips, drag order and comment, docked Save tie. */
function TieScreenB({ctx}:{ctx:Ctx}) {
  const [tie,setTie]=useState<Tie|null>(ctx.day.tie);
  return <>
    <RaceBar title="Tie at 30.00" code={event.code} role="lead" onBack={ctx.close}><RoleChip role="lead" onOpen={()=>{}}/></RaceBar>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{event.name} · {event.section} · decides 2nd and 3rd</p>
        <h1 className="rz-prompt__q">How was the tie <em>decided?</em></h1><p className="rz-prompt__help">1009 (Heat 1) and 1011 (Heat 2) both ran 30.00.</p></div>
      <TieForm tie={tie} setTie={setTie} choices="chips"/>
    </main>
    <DockedFooter>
      {!tieReady(tie) && <p className="rz-footer__reason">{tieReason(tie)}</p>}
      <button type="button" className="rz-btn rz-btn--display rz-btn--block" aria-disabled={!tieReady(tie) || undefined} onClick={()=>{if(tieReady(tie)) ctx.saveTie(tie!);}}>Save tie</button>
    </DockedFooter>
  </>;
}

/** C: one screen of numbered steps. The tie is settled in place (no tie sheet); each medal place has its own Fix. */
function ChecklistC({ctx,tieFirst}:{ctx:Ctx;tieFirst:boolean}) {
  const {day}=ctx;
  const [tie,setTie]=useState<Tie|null>(day.tie);
  const [editingTie,setEditingTie]=useState(!day.tie || tieFirst);
  const settle=toSettle(day);
  const step=(done:boolean,title:string,body:ReactNode,optional=false)=><li className={done?'proto-step proto-step--done':'proto-step'}>
    <span className="proto-step__mark" aria-hidden="true">{done?<Icon name="check"/>:null}</span>
    <div className="proto-step__body"><h2 className="proto-step__title">{title}{optional && <span className="proto-help"> · optional</span>}</h2>{body}</div>
  </li>;
  return <>
    <RaceBar title={`${event.name} · ${event.section}`} code={event.code} role="lead" onBack={ctx.close}><RoleChip role="lead" onOpen={()=>{}}/></RaceBar>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">3 heats · no final</p><h1 className="rz-prompt__q">Confirm the <em>medals</em></h1>
        <p className="rz-prompt__help">Do each step, then confirm.</p></div>
      <ol className="proto-steps">
        {step(!!day.tie && !editingTie,day.tie && !editingTie?`Tie at 30.00: ${outcomeLabels[day.tie.outcome].toLowerCase()}`:'Settle the tie at 30.00',
          editingTie?<><p className="proto-help">1009 (Heat 1) and 1011 (Heat 2) both ran 30.00. It decides 2nd and 3rd.</p>
            <TieForm tie={tie} setTie={setTie} choices="chips"/>
            {!tieReady(tie) && tie && <p className="rz-footer__reason">{tieReason(tie)}</p>}
            {tie && <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={!tieReady(tie) || undefined} onClick={()=>{if(tieReady(tie)) {ctx.saveTie(tie!);setEditingTie(false);}}}>Save tie</button>}</>
          :<button type="button" className="rz-btn rz-btn--small" onClick={()=>setEditingTie(true)}>Change</button>)}
        {step(day.heat3,day.heat3?'Heat 3 saved':'Finish Heat 3',day.heat3?null:<><p className="proto-help">2 checked in, not saved. Finish its steps or delete it.</p>
          <button type="button" className="rz-btn rz-btn--primary rz-btn--small" onClick={()=>ctx.away('heat3')}>Open Heat 3</button></>)}
        {step(day.warningSeen,day.warningSeen?'Warning looked at':'Look at 1 warning',day.warningSeen?null:<><p className="proto-help">{warning.body}</p>
          <div className="rz-row"><button type="button" className="rz-btn rz-btn--small" onClick={()=>ctx.away('Heat 1 on Results')}>{warning.open}</button><button type="button" className="rz-btn rz-btn--small" onClick={ctx.seen}>It's fine</button></div></>,true)}
        {step(false,'Check the medal places',<><p className="proto-help">A place is wrong? Tap Fix beside it.</p>
          <Medals day={day} fix={runner=>ctx.away(`Heat ${runner.heat} on Times, with Correct times on ${runner.num}`)}/></>)}
      </ol>
    </main>
    <DockedFooter>
      {settle.length>0 && <p className="rz-footer__reason">{reason(settle.length)}</p>}
      <button type="button" className="rz-btn rz-btn--display rz-btn--block" aria-disabled={settle.length>0 || undefined} onClick={()=>{if(!settle.length) ctx.confirm();}}>Confirm the medals</button>
    </DockedFooter>
  </>;
}
