/*
 * PROTOTYPE - throwaway, never merged (branch prototype/tap-to-edit-wristband, map ticket #183).
 * Question: how does a Start line volunteer change or remove a typed wristband by tapping it?
 * Three variants of the Start line step (plus Today), switchable from the floating pill at the top, on the real race
 * screen (`npm run prototype`). Development builds only. Writes go to the local scratch database `msf_prototype_wipe_me`.
 *   A  The big field takes it: tap a chip, its number moves into the big field to retype; Cancel / Remove / Save.
 *   B  The chip opens in place: the chip itself becomes a small field; Remove beside it; Cancel / Save.
 *   C  Runner list: no chips; every number is a field in a numbered list; x on a row removes it.
 * Left out: the usual-heat-size note, the docked-above-keyboard fix (#181), a final's Here / Absent.
 */
import { useEffect,useLayoutEffect,useRef,useState,type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { raceName } from '../../shared/race-flow.js';
import { runnersOf } from '../../shared/races.js';
import { plainWristbandWarning } from '../../shared/wristband-checks.js';
import { digitsOnly } from '../flow/NumberEntry.js';
import { useWristbandEntry } from '../race/WristbandEntry.js';
import { Callout,Icon } from './parts.js';
import { DigitsField,KeepFocus,StartLine,type StepProps } from './Steps.js';
import { useStepWrites } from './writes.js';
import './StartLine.prototype.css';

type Entry={id?:string;wristband:number};
const keyOf=(item:Entry)=>item.id??`new-${item.wristband}`;

/** The check-in writes every variant shares: add a number, change one in place (its entry, so its place, kept), remove one. */
function useCheckIn({read,flow}:StepProps) {
  const {race,group}=read,event=group.event,runners=runnersOf(race.parts.runners.value);
  const writes=useStepWrites<{runners:Entry[];keptWarnings:number[]}>(flow.write,'check-in','runners',race.id,race.parts.runners.version);
  const entries:Entry[]=writes.pending?.runners||runners.map(({id,wristband})=>({id,wristband}));
  const [editing,setEditing]=useState<string|null>(null);
  const target=entries.find(item=>keyOf(item)===editing)||null;
  const add=useWristbandEntry(event,race.id,entries.map(item=>item.wristband),(wristband,kept)=>writes.send({runners:[...entries,{wristband}],keptWarnings:kept?[wristband]:[]}));
  const edit=useWristbandEntry(event,race.id,entries.filter(item=>item!==target).map(item=>item.wristband),async(wristband,kept)=>{
    const sent=await writes.send({runners:entries.map(item=>item===target?{...item,wristband}:item),keptWarnings:kept?[wristband]:[]});
    if(sent) setEditing(null);
    return sent;
  });
  const cancel=()=>{edit.fix();setEditing(null);};
  return {race,event,runners,entries,writes,add,edit,editing,target,
    warned:(item:Entry)=>!!runners.find(other=>other.id===item.id)?.warnings?.length,
    start:(item:Entry)=>{edit.fix();edit.type(String(item.wristband));setEditing(keyOf(item));},
    cancel,
    /** An unchanged number just closes the change; anything else is checked like a new number. */
    save:()=>{if(target && Number(edit.current)===target.wristband) cancel();else void edit.next();},
    remove:(item:Entry)=>{if(keyOf(item)===editing) cancel();void writes.send({runners:entries.filter(other=>other!==item),keptWarnings:[]});}};
}
type CheckIn=ReturnType<typeof useCheckIn>;
/** As DigitsField does: the keyboard closes while a warning waits, and comes back to the field on Fix number. */
function useHeldFocus(input:RefObject<HTMLInputElement|null>,held:boolean) {
  const was=useRef(held);
  useLayoutEffect(()=>{if(held) input.current?.blur();else if(was.current) input.current?.focus();was.current=held;},[held]);
}
/** Fix number / Keep for whichever entry (new or change) is held. */
const Held=({c,on}:{c:CheckIn;on:CheckIn['add']})=>on.held?<Callout message={on.refused||on.pending.map(warning=>plainWristbandWarning(warning,Number(on.current),c.event.section)).join(' ')}
  actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={on.fix}>Fix number</button>{!on.refused && <button type="button" className="rz-btn" onClick={()=>void on.keep()}>Keep</button>}</>}/>:null;
const Errors=({c,flow}:{c:CheckIn;flow:StepProps['flow']})=><>
  {flow.error && <p className="rz-error" role="alert">{flow.error}</p>}
  {c.add.error && <p className="rz-error" role="alert">{c.add.error}</p>}
  {c.edit.error && <p className="rz-error" role="alert">{c.edit.error}</p>}
</>;
const Prompt=({c,question}:{c:CheckIn;question:string})=><div className="rz-prompt rz-prompt--compact">
  <p className="rz-prompt__meta">{raceName(c.race)} · {c.entries.length} {c.entries.length===1?'runner':'runners'} so far</p>
  <h2 className="rz-prompt__q">{question}</h2>
</div>;
const NewFooter=({c,onDone}:{c:CheckIn;onDone:StepProps['onDone']})=><footer className="rz-footer rz-footer--sticky"><div className="rz-footer__pair">
  <button type="button" className="rz-btn" disabled={!c.entries.length || c.writes.sending} onClick={()=>onDone('runners')}>That's everyone</button>
  <KeepFocus className="rz-btn rz-btn--primary" disabled={!c.add.current || c.add.held || c.add.checking} onClick={()=>void c.add.next()}>{c.add.checking?'Checking…':'Next'}</KeepFocus>
</div></footer>;

/** A: tapping a chip moves its number into the big field, selected so typing replaces it. The half-typed new number waits. */
function VariantA(props:StepProps) {
  const c=useCheckIn(props),{target}=c,on=target?c.edit:c.add;
  return <>
    <main className="rz-main">
      <Prompt c={c} question={target?`Change wristband ${target.wristband}`:`Runner ${c.entries.length+1}: wristband number?`}/>
      <Errors c={c} flow={props.flow}/>
      {c.entries.length>0 && <ul className="rz-chips" aria-label="Wristbands entered">{c.entries.map(item=>{
        const editing=item===target;
        return <li key={keyOf(item)}><button type="button" className={`rz-chip${c.warned(item)?' rz-chip--warn':''}${editing?' proto-chip--editing':''}`} aria-pressed={editing}
          aria-label={editing?`Changing ${item.wristband}`:`Change ${item.wristband}`} onMouseDown={event=>event.preventDefault()} onClick={()=>editing?c.cancel():c.start(item)}>
          {item.wristband} <Icon name="pencil"/></button></li>;
      })}</ul>}
      <DigitsField id="wristband" label={target?`New number for ${target.wristband}`:'Wristband number'} value={on.current} held={on.held} onReopen={on.reopen} busy={on.checking || c.writes.sending} warn={on.held}
        onChange={on.type} onEnter={target?c.save:()=>void c.add.next()} selectKey={c.editing??'new'}
        hint={target?'Type the right number and tap Save, or Remove to take this runner off.':c.entries.length?'Tap a number above to change it.':undefined}/>
      <Held c={c} on={on}/>
    </main>
    {target?<footer className="rz-footer rz-footer--sticky"><div className="rz-footer__trio">
      <KeepFocus className="rz-btn" onClick={c.cancel}>Cancel</KeepFocus>
      <KeepFocus className="rz-btn proto-btn--remove" onClick={()=>c.remove(target)}>Remove</KeepFocus>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!c.edit.current || c.edit.held || c.edit.checking} onClick={c.save}>{c.edit.checking?'Checking…':'Save'}</KeepFocus>
    </div></footer>:<NewFooter c={c} onDone={props.onDone}/>}
  </>;
}

/** B: the tapped chip becomes a small field where it sits, with Remove beside it. The big field stays for the next runner. */
function VariantB(props:StepProps) {
  const c=useCheckIn(props),{target}=c;
  const inline=useRef<HTMLInputElement>(null);
  useHeldFocus(inline,c.edit.held);
  // Focus moves in the same tap, so the phone's keyboard stays up.
  const open=(item:Parameters<CheckIn['start']>[0])=>{flushSync(()=>c.start(item));inline.current?.focus();inline.current?.select();};
  return <>
    <main className="rz-main">
      <Prompt c={c} question={target?`Change wristband ${target.wristband}`:`Runner ${c.entries.length+1}: wristband number?`}/>
      <Errors c={c} flow={props.flow}/>
      {c.entries.length>0 && <ul className="rz-chips" aria-label="Wristbands entered">{c.entries.map(item=>item===target
        ?<li key={keyOf(item)} className="proto-inline">
          <input ref={inline} className={`proto-inline__input${c.edit.held?' proto-inline__input--warn':''}`} aria-label={`New number for ${item.wristband}`} type="text" inputMode="numeric" pattern="[0-9]*"
            enterKeyHint="done" autoComplete="off" value={c.edit.current} readOnly={c.edit.checking || c.edit.held} onChange={event=>c.edit.type(digitsOnly(event.target.value))}
            onKeyDown={event=>{if(event.key==='Enter') {event.preventDefault();c.save();}}}/>
          <KeepFocus className="rz-btn rz-btn--pill proto-btn--remove" onClick={()=>c.remove(item)}>Remove</KeepFocus>
        </li>
        :<li key={keyOf(item)}><button type="button" className={`rz-chip${c.warned(item)?' rz-chip--warn':''}`} aria-label={`Change ${item.wristband}`}
          onMouseDown={event=>event.preventDefault()} onClick={()=>open(item)}>{item.wristband} <Icon name="pencil"/></button></li>)}</ul>}
      <Held c={c} on={c.edit}/>
      <div className={target?'proto-dim':undefined}>
        <DigitsField id="wristband" label="Wristband number" value={c.add.current} held={c.add.held} onReopen={c.add.reopen} busy={c.add.checking || c.writes.sending} warn={c.add.held}
          onChange={c.add.type} onEnter={()=>void c.add.next()} hint={c.entries.length && !target?'Tap a number above to change it.':undefined}/>
      </div>
      <Held c={c} on={c.add}/>
    </main>
    {target?<footer className="rz-footer rz-footer--sticky"><div className="rz-footer__pair">
      <KeepFocus className="rz-btn" onClick={c.cancel}>Cancel</KeepFocus>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!c.edit.current || c.edit.held || c.edit.checking} onClick={c.save}>{c.edit.checking?'Checking…':'Save'}</KeepFocus>
    </div></footer>:<NewFooter c={c} onDone={props.onDone}/>}
  </>;
}

/** C: no chips. A numbered list where every number is a field; tap one and type. x removes a row. The last row is the next runner. */
function VariantC(props:StepProps) {
  const c=useCheckIn(props),{target}=c;
  const next=useRef<HTMLInputElement>(null),row=useRef<HTMLInputElement>(null);
  useHeldFocus(row,c.edit.held);useHeldFocus(next,c.add.held);
  useEffect(()=>{next.current?.focus({preventScroll:true});},[]);
  // A saved change hands the keyboard back to the next runner's row.
  const was=useRef(target);
  useLayoutEffect(()=>{if(was.current && !target) next.current?.focus({preventScroll:true});was.current=target;},[target]);
  return <>
    <main className="rz-main">
      <Prompt c={c} question={target?`Change runner ${c.entries.indexOf(target)+1}`:`Runner ${c.entries.length+1}: wristband number?`}/>
      <Errors c={c} flow={props.flow}/>
      <ol className="proto-rows" aria-label="Runners">
        {c.entries.map((item,index)=>{
          const editing=item===target;
          return <li key={keyOf(item)} className={`proto-row${editing?' proto-row--editing':''}${c.warned(item) || editing && c.edit.held?' proto-row--warn':''}`}>
            <label className="proto-row__label" htmlFor={`row-${keyOf(item)}`}>Runner {index+1}</label>
            <input ref={editing?row:undefined} id={`row-${keyOf(item)}`} className="proto-row__input" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" autoComplete="off"
              value={editing?c.edit.current:String(item.wristband)} readOnly={editing && (c.edit.checking || c.edit.held)}
              onFocus={event=>{if(!editing) {c.start(item);event.target.select();}}} onChange={event=>c.edit.type(digitsOnly(event.target.value))}
              onKeyDown={event=>{if(event.key==='Enter') {event.preventDefault();c.save();}}}/>
            <button type="button" className="proto-row__remove" aria-label={`Remove runner ${index+1}, ${item.wristband}`} onMouseDown={event=>event.preventDefault()} onClick={()=>c.remove(item)}><Icon name="close"/></button>
            {editing && <div className="proto-row__callout"><Held c={c} on={c.edit}/></div>}
          </li>;
        })}
        <li className={`proto-row proto-row--new${c.add.held?' proto-row--warn':''}`}>
          <label className="proto-row__label" htmlFor="wristband">Runner {c.entries.length+1}</label>
          <input ref={next} id="wristband" className="proto-row__input" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" placeholder="Wristband"
            value={c.add.current} readOnly={c.add.checking || c.add.held || c.writes.sending} onFocus={()=>{if(target) c.cancel();}} onChange={event=>c.add.type(digitsOnly(event.target.value))}
            onKeyDown={event=>{if(event.key==='Enter') {event.preventDefault();void c.add.next();}}}/>
        </li>
      </ol>
      <Held c={c} on={c.add}/>
      {!target && c.entries.length>0 && <p className="rz-field__hint">Tap any number to change it.</p>}
    </main>
    {target?<footer className="rz-footer rz-footer--sticky"><div className="rz-footer__pair">
      <KeepFocus className="rz-btn" onClick={c.cancel}>Cancel</KeepFocus>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!c.edit.current || c.edit.held || c.edit.checking} onClick={c.save}>{c.edit.checking?'Checking…':'Save change'}</KeepFocus>
    </div></footer>:<NewFooter c={c} onDone={props.onDone}/>}
  </>;
}

const variants={Today:{name:'Today: tap removes',body:StartLine},A:{name:'The big field takes it',body:VariantA},B:{name:'The chip opens in place',body:VariantB},C:{name:'Runner list',body:VariantC}};
type Key=keyof typeof variants;
const keys=Object.keys(variants) as Key[];
const stored='prototype:wristband-variant';
function firstVariant():Key {
  const asked=new URLSearchParams(location.search).get('variant')??localStorage.getItem(stored);
  return keys.includes(asked as Key)?asked as Key:'A';
}
/** The Start line step under the prototype switcher. The app's own navigation drops ?variant=, so the choice is kept on the phone too. */
export function StartLinePrototype(props:StepProps) {
  const [variant,setVariant]=useState<Key>(firstVariant);
  function go(step:number) {
    const next=keys[(keys.indexOf(variant)+step+keys.length)%keys.length]!;
    localStorage.setItem(stored,next);history.replaceState(null,'',`${location.pathname}?variant=${next}`);setVariant(next);
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if((event.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
      if(event.key==='ArrowLeft') go(-1);else if(event.key==='ArrowRight') go(1);
    };
    addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);
  });
  const Body=variants[variant].body;
  return <>
    <Body key={variant} {...props}/>
    <div className="proto-switcher" role="group" aria-label="Prototype variant">
      <button type="button" aria-label="Previous variant" onMouseDown={event=>event.preventDefault()} onClick={()=>go(-1)}>‹</button>
      <span>{variant==='Today'?variants.Today.name:`${variant} · ${variants[variant].name}`}</span>
      <button type="button" aria-label="Next variant" onMouseDown={event=>event.preventDefault()} onClick={()=>go(1)}>›</button>
    </div>
  </>;
}
