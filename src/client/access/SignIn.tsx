import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiFailure, phoneStorage, type HeldProfile } from '../api.js';
import type { Phone } from '../../shared/domain.js';
import type { Role } from '../../shared/race-flow.js';
import { Callout,HomeBar,Icon,Screen as RzScreen } from '../races/parts.js';
import { JobChoice } from '../races/RoleSheet.js';
import { useSubmit } from '../flow/useSubmit.js';
import './access.css';
interface SignedIn { token:string; phone:Phone; pass?:string; profile?:{id:string;name:string;secret?:string} }
function signedIn({token,phone,pass,profile}:SignedIn) {
  if(pass) phoneStorage.rememberPass(pass);
  if(profile) phoneStorage.rememberProfile(profile);
  phoneStorage.signIn(token,phone.profileId);
}
/** Signing in: the race flow's Join (one form: your full name, the Password and your job). A phone that has joined before lists its names to tap. */
export function SignIn({onSignedIn}:{onSignedIn:()=>void}) {
  return <Join onSignedIn={result=>{signedIn(result);onSignedIn();}}/>;
}
interface Joined extends SignedIn { kind:'volunteer'|'lead'|'owner'; pass:string; profile:{id:string;name:string;secret?:string} }
/**
 * Join (race-flow.md screen 1): your full name, the Password and your job. The Password is the Olympics password, or
 * today's lead code to join as Zone lead (which skips the job), or the owner password. A name this phone has joined
 * with before signs in again; one held on another phone asks "Is this you on a new phone?", and That's me moves it
 * here at once (ADR 0006). Names this phone holds are listed to tap.
 */
function Join({onSignedIn}:{onSignedIn:(result:SignedIn)=>void}) {
  const [profiles,setProfiles]=useState(phoneStorage.profiles);
  const [editing,setEditing]=useState(false);
  const [code,setCode]=useState(''),[name,setName]=useState(''),[job,setJob]=useState<Role|null>(null);
  const join=useSubmit(),tap=useSubmit();
  // A refusal shows under the form: bring it out from under the docked Join.
  const refusal=useRef<HTMLDivElement>(null),nameBox=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(join.error) refusal.current?.scrollIntoView({block:'center'});},[join.error]);
  const pass=phoneStorage.pass(),held=()=>profiles.map(({id,secret})=>({id,secret}));
  /** Signs in, then keeps the job for today on this phone (a lead is Zone lead): signing in clears the last session's. */
  const enter=(result:SignedIn,role:Role|null)=>{onSignedIn(result);if(role) phoneStorage.rememberRole(result.phone.dayId,role);};
  // "Choose your job" sits under the job cards, a taken name's question under the Full name box, every other refusal under the Password box.
  const [refused,setRefused]=useState<'job'|'taken'|null>(null),[someoneElse,setSomeoneElse]=useState(false);
  const send=(thatsMe:boolean)=>{setSomeoneElse(false);void join.submit(async()=>{
    const result=await api<Joined>('join',{code,name,job,profiles:held(),...(thatsMe?{thatsMe}:{})});
    enter(result,result.kind==='volunteer'?job:'lead');
  },error=>setRefused(!(error instanceof ApiFailure)?null:error.body.reason==='choose-job'?'job':error.body.taken?'taken':null));};
  const submit=(event:FormEvent)=>{event.preventDefault();send(false);};
  const notMe=()=>{join.setError('');setSomeoneElse(true);nameBox.current?.focus();};
  const signIn=(profile:HeldProfile)=>void tap.submit(async()=>enter(await api<SignedIn>('sign-in',{pass,profileId:profile.id,secret:profile.secret}),null),error=>{
    // The profile went to another phone by That's me: this phone forgets it. A changed password needs the new one typed.
    if(error instanceof ApiFailure && error.body.reason==='moved') {phoneStorage.forgetProfile(profile.id);setProfiles(phoneStorage.profiles());}
  });
  const forget=(profile:HeldProfile)=>{phoneStorage.forgetProfile(profile.id);const left=phoneStorage.profiles();setProfiles(left);if(!left.length) setEditing(false);};
  return <RzScreen screen="Join"><HomeBar>{null}</HomeBar>
    <main className="rz-main rz-main--form">
      {phoneStorage.newDayLine() && <p className="rz-note" role="status">A new Olympics day has started. Tap your name to sign in.</p>}
      {pass && profiles.length>0 && <section style={{display:'flex',flexDirection:'column',gap:8}} aria-label="Joined on this phone before">
        <div className="rz-heading-row"><h2 className="rz-section">Welcome back</h2><button type="button" className="rz-btn rz-btn--small" onClick={()=>setEditing(!editing)}>{editing?'Done':'Edit list'}</button></div>
        <ul className="rz-list">{profiles.map(profile=><li key={profile.id}>{editing
          ?<div className="rz-listrow"><span className="rz-listrow__label">{profile.name}</span><button type="button" className="rz-btn rz-btn--small" aria-label={`Remove ${profile.name} from this phone`} onClick={()=>forget(profile)}>Remove</button></div>
          :<button type="button" className="rz-listrow" disabled={tap.busy} onClick={()=>signIn(profile)}><span className="rz-listrow__main"><span className="rz-listrow__label">{profile.name}</span><span className="rz-listrow__meta">Tap to sign in</span></span><Icon name="chevron-right"/></button>}
        </li>)}</ul>
        {editing && <p className="rz-field__hint">Removing a name only takes it off this phone. A lead can put it back on any phone.</p>}
        {tap.error && <p className="rz-error" role="alert">{tap.error}</p>}
      </section>}
      <h1 className="rz-screen-title">{pass && profiles.length?'Someone else? Join':'Join the Running Zone'}</h1>
      <form id="join" onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
        <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="join-name">Full name</label>
          <input ref={nameBox} className="rz-field__input" id="join-name" autoComplete="name" enterKeyHint="go" maxLength={80} value={name} onChange={event=>{setName(event.target.value);if(refused==='taken') join.setError('');}} required/>
          {someoneElse && <p className="rz-field__hint">Add a middle name or initial, for example Sara K Ahmed.</p>}</div>
        {join.error && refused==='taken' && <div ref={refusal}><Callout message={join.error} actions={<>
          <button type="button" className="rz-btn rz-btn--primary" disabled={join.busy} onClick={()=>send(true)}>That's me</button>
          <button type="button" className="rz-btn" onClick={notMe}>No, I'm someone else</button></>}/></div>}
        {/* Shown as typed, so a typo is seen before Join; no capitals or corrections, since the password may be lower case. */}
        <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="join-code">Password</label>
          <input className="rz-field__input" id="join-code" type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" value={code} onChange={event=>setCode(event.target.value)} required/></div>
        {join.error && !refused && <div ref={refusal}><Callout message={join.error}/></div>}
        <fieldset style={{border:0,margin:0,padding:0,display:'flex',flexDirection:'column',gap:10}}><legend className="rz-field__label" style={{marginBottom:6,padding:0}}>What's your job today?</legend>
          <JobChoice role={job} label="What's your job today?" onChoose={next=>{setJob(next);if(refused==='job') join.setError('');}}/></fieldset>
        {join.error && refused==='job' && <div ref={refusal}><Callout message={join.error}/></div>}
        <p className="rz-field__hint">You can switch job on any race. Zone lead? Type your lead code as the password.</p>
      </form>
    </main>
    <footer className="rz-footer rz-footer--sticky"><button form="join" className="rz-btn rz-btn--display rz-btn--block" disabled={join.busy}>{join.busy?'Joining…':'Join'}</button></footer>
  </RzScreen>;
}
