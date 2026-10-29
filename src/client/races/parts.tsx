import { useEffect,useId,useRef,type ReactNode } from 'react';
import { chipLabel,chipName,chipState,finalConfirm,roleLabels,roleSteps,stepLabels,stepsOf,type RaceGroup,type RaceSummary,type Role,type Step,type StepStatus } from '../../shared/race-flow.js';
import { initials,reportLink,useTestBuild } from '../shell/AppHeader.js';

/** The design system's line icons (components/Icon/README.md). */
const paths={
  flag:<><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></>,
  list:<><path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6h1M4 12h1M4 18h1"/></>,
  stopwatch:<><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/></>,
  dashboard:<><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></>,
  check:<path d="M5 12.5l4.5 4.5L19 7.5"/>,
  warning:<><path d="M12 3.5L2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><path d="M12 17.5v.01"/></>,
  close:<path d="M7 7l10 10M17 7L7 17"/>,
  plus:<path d="M12 5v14M5 12h14"/>,
  pencil:<><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/><path d="M14 7l3 3"/></>,
  drag:<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="3.4"/>,
  more:<path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3.6"/>,
  eye:<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  'chevron-left':<path d="M15 6l-6 6 6 6"/>,
  'chevron-right':<path d="M9 6l6 6-6 6"/>,
  'chevron-down':<path d="M6 9l6 6 6-6"/>
};
export type IconName=keyof typeof paths;
export const Icon=({name,className=''}:{name:IconName;className?:string})=><svg className={`rz-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
/** The 8-point star, the design system's medal shape. */
export const Star=()=><svg className="rz-star" viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="7" width="26" height="26" rx="3"/><rect x="7" y="7" width="26" height="26" rx="3" transform="rotate(45 20 20)"/></svg>;
/** The star texture on navy; each needs its own pattern id. */
function Pattern() {
  const id=`rz-star-${useId().replace(/:/g,'')}`;
  return <svg className="rz-pattern" aria-hidden="true"><defs><pattern id={id} width="44" height="44" patternUnits="userSpaceOnUse"><g>
    <rect x="12" y="12" width="20" height="20"/><rect x="12" y="12" width="20" height="20" transform="rotate(45 22 22)"/><path d="M0 22H8M36 22H44M22 0V8M22 36V44"/>
  </g></pattern></defs><rect width="100%" height="100%" fill={`url(#${id})`}/></svg>;
}
export const roleIcons:Record<Role,IconName>={start:'flag',finish:'list',timer:'stopwatch',lead:'dashboard'};
/** What each job does, on Join and in the role sheet. */
export const roleDescriptions:Record<Role,string>={start:'Type wristband numbers before the start',finish:'Tap runners as they cross the line',timer:'Type times from the stopwatch',lead:'See and fix every step. Needs the lead code.'};
/** The screen root: the design system's tokens apply only inside it. A test build shows its commit and Report a bug over every screen. */
export function Screen({screen,fill=true,wide=false,children}:{screen:string;fill?:boolean;wide?:boolean;children:ReactNode}) {
  const testBuild=useTestBuild();
  return <div className={['rz-screen rz-zone-running rz-app',fill?'':'rz-app--top',wide?'rz-app--wide':''].filter(Boolean).join(' ')}>
    {testBuild && <div className="rz-testbuild"><span>Test build · {testBuild.commit.slice(0,7)}</span><a href={reportLink(testBuild,screen)} target="_blank" rel="noreferrer">Report a bug</a></div>}
    {children}
  </div>;
}
/** The pill on the app bar naming your job; it opens Switch job. */
export function RoleChip({role,onOpen}:{role:Role;onOpen:()=>void}) {
  return <button type="button" className={role==='lead'?'rz-rolechip rz-rolechip--lead':'rz-rolechip'} aria-label={`Your job: ${role==='lead'?'Zone lead':roleLabels[role]}. Change job`} onClick={onOpen}>
    <Icon name={roleIcons[role]}/>{roleLabels[role]}<Icon name="chevron-down" className="rz-icon--chevron"/>
  </button>;
}
/** The avatar: your initials. For a lead it opens the menu with Results and Day setup. */
export function Avatar({name,onOpen,label}:{name:string;onOpen:()=>void;label?:string}) {
  return <button type="button" className="rz-avatar" aria-label={label||`${name}, your details`} onClick={onOpen}>{initials(name)}</button>;
}
/** Home's app bar: MSF Olympics, Running Zone, then the role chip and avatar. */
export function HomeBar({children}:{children:ReactNode}) {
  return <header className="rz-appbar rz-appbar--compact rz-appbar--home"><Pattern/>
    <div className="rz-appbar__brand"><span className="rz-appbar__eyebrow" style={{fontSize:12}}>MSF Olympics</span><span className="rz-appbar__name">Running <span>Zone</span></span></div>
    <div className="rz-appbar__end">{children}</div>
  </header>;
}
/** A race's app bar: back to Races, the event group (with its code in the Zone lead role), then the role chip (and for a lead, race actions). */
export function RaceBar({title,code,role,onBack,children}:{title:string;code:string;role:Role;onBack:()=>void;children:ReactNode}) {
  return <header className="rz-appbar rz-appbar--compact rz-appbar--race"><Pattern/>
    <div className="rz-appbar__race"><button type="button" className="rz-backlink" aria-label="Back to Races" onClick={onBack}><Icon name="chevron-left" className="rz-icon--bold"/></button>
      <h1>{title}</h1>{role==='lead' && <span className="rz-code-tag">{code}</span>}</div>
    <div className="rz-appbar__end" style={{gap:2}}>{children}</div>
  </header>;
}
/**
 * One chip per race of an event group, then "+" for the next heat and, for a lead when it applies, "+ Final". States follow the
 * viewer's step, and every chip says its state in words. `current` is the race open now (gold with a ring); on a race
 * screen a race ready for you that is not open gets a ring and a gold dot. A final that would be refused greys "+ Final"
 * with the reason beside it, which opens what it is about.
 */
export function HeatChips({races,role,current,onRace,onAdd,onFinal,finalReason,nextHeat}:{races:readonly RaceSummary[];role:Role;current?:string;nextHeat:number;
  onRace:(id:string)=>void;onAdd?:()=>void;onFinal?:()=>void;finalReason?:{line:string;onOpen:()=>void}}) {
  return <ol className="rz-heats" aria-label="Heats">
    {races.map(race=>{
      const state=chipState(race,role),here=race.id===current;
      const kind=here?'current':state==='done'?'done':state==='ready'?current?'pending':'ready':'waiting';
      return <li key={race.id}><button type="button" className={`rz-heat rz-heat--${kind}`} aria-current={here?'page':undefined}
        aria-label={here?`${chipLabel(race,role)}, this race`:chipLabel(race,role)} onClick={()=>{if(!here) onRace(race.id);}}>
        {chipName(race)}{state==='done' && !here && <Icon name="check"/>}
      </button></li>;
    })}
    {onAdd && <li><button type="button" className="rz-heat rz-heat--add" aria-label={`Add heat ${nextHeat}`} onClick={onAdd}><Icon name="plus"/></button></li>}
    {onFinal && <li><button type="button" className="rz-heat rz-heat--final" aria-label="Create the final from the fastest 6" aria-disabled={finalReason?true:undefined}
      onClick={finalReason?undefined:onFinal}>+ Final</button></li>}
    {onFinal && finalReason && <li><button type="button" className="rz-heat-reason" onClick={finalReason.onOpen}><Icon name="warning"/>{finalReason.line}</button></li>}
  </ol>;
}
/** A step's status in words: "5 checked in", "2 of 8", "Not started". */
export function stepWords(step:Step,status:StepStatus) {
  if(status.state==='not started') return 'Not started';
  if(step==='runners') return `${status.count} ${status.state==='done'?'checked in':'so far'}`;
  return `${status.count} of ${status.expected}`;
}
/**
 * The race's three steps, as tabs when `onSelect` is given. A volunteer's own step is outlined and starts "You ·"; any
 * other step opens read-only. The own status is short ("You · not yet", "You · 2 of 8", "You · done") so each cell
 * stays on one line at 360px. A lead's selected tab is navy. `notes` puts a short warning on a step ("1 to check").
 */
export function StepStrip({race,role,selected,onSelect,notes={},label}:{race:Pick<RaceSummary,'kind'|'steps'>;role:Role;selected?:Step;onSelect?:(step:Step)=>void;
  notes?:Partial<Record<Step,string>>;label:string}) {
  const own=role==='lead'?null:roleSteps[role],shown=stepsOf(race);
  const cell=(step:Step)=>{
    const status=race.steps[step]!,done=status.state==='done',note=notes[step];
    return <>
      <span className="rz-step__label">{stepLabels[step]}{done && <Icon name="check"/>}</span>
      <span className="rz-step__status">{note?<><Icon name="warning"/>{note}</>:step===own?`You · ${status.state==='not started'?'not yet':done?'done':stepWords(step,status)}`:stepWords(step,status)}</span>
    </>;
  };
  if(onSelect) return <div className={shown.length===2?'rz-steps rz-steps--two':'rz-steps'} role="tablist" aria-label={label}>
    {shown.map(step=><button key={step} type="button" role="tab" className={step===own?'rz-step rz-step--mine':'rz-step'} aria-selected={step===selected}
      aria-label={step===own || role==='lead'?undefined:`${stepLabels[step]}, ${stepWords(step,race.steps[step]!)}. View read-only`} onClick={()=>onSelect(step)}>{cell(step)}</button>)}
  </div>;
  return <ul className={shown.length===2?'rz-steps rz-steps--two':'rz-steps'} aria-label={label}>
    {shown.map(step=><li key={step} className={step===own?'rz-step rz-step--mine':'rz-step'}>{cell(step)}</li>)}
  </ul>;
}
/** A bottom sheet over the screen, closed by its close button, Escape or a tap on the scrim. Focus goes into it. */
export function Sheet({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const id=useId(),sheet=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    sheet.current?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape') onClose();};
    addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);
  },[]);
  return <div className="rz-scrim" onClick={event=>{if(event.target===event.currentTarget) onClose();}}>
    <div className="rz-sheet" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={sheet}>
      <div className="rz-sheet__grip" aria-hidden="true"/>
      <div className="rz-sheet__head"><h2 className="rz-sheet__title" id={id}>{title}</h2><button type="button" className="rz-sheet__close" aria-label="Close" onClick={onClose}><Icon name="close"/></button></div>
      {children}
    </div>
  </div>;
}
/** What a lead's "+ Final" opens: the heat count to check against what they saw, before the final ends the heats. */
export function FinalSheet({group,onMake,onClose}:{group:RaceGroup;onMake:()=>void;onClose:()=>void}) {
  const {title,text}=finalConfirm(group);
  return <Sheet title={title} onClose={onClose}>
    <p className="rz-sheet__text">{text}</p>
    <div className="rz-sheet__actions">
      <button type="button" className="rz-btn rz-btn--primary rz-btn--block" onClick={onMake}>Make the final</button>
      <button type="button" className="rz-btn rz-btn--small rz-btn--block" onClick={onClose}>Not yet</button>
    </div>
  </Sheet>;
}
/** The amber warning with its two actions (Fix / Keep); `status` makes it a calm note rather than an alert. */
export function Callout({message,status=false,actions}:{message:ReactNode;status?:boolean;actions?:ReactNode}) {
  return <div className={status?'rz-callout rz-callout--status':'rz-callout'} role={status?'status':'alert'}>
    <p className="rz-callout__msg"><Icon name="warning"/><span>{message}</span></p>
    {actions && <div className="rz-callout__actions">{actions}</div>}
  </div>;
}
