import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiFailure, phoneStorage, type HeldProfile, type Waiting } from '../api.js';
import type { Phone } from '../../shared/domain.js';
import type { Role } from '../../shared/race-flow.js';
import { AppHeader } from '../shell/AppHeader.js';
import { Callout,HomeBar,Icon,Screen as RzScreen } from '../races/parts.js';
import { JobChoice } from '../races/RoleSheet.js';
import { ActionBar } from '../flow/ActionBar.js';
import { useSubmit } from '../flow/useSubmit.js';
import './access.css';
interface SignedIn { token:string; phone:Phone; pass?:string; profile?:{id:string;name:string;secret?:string} }
/** Lead sign-in numbered a name taken on another phone: `taken` is that name, `name` the one signed in. */
export interface Renamed { taken:string; name:string }
type Screen = 'join'|'waiting';
const screenNames:Record<Screen,string>={join:'Join',waiting:'Waiting for a lead'};
const declined='A lead did not approve this - add your middle name or initial.';
function signedIn({token,phone,pass,profile}:SignedIn) {
  if(pass) phoneStorage.rememberPass(pass);
  if(profile) phoneStorage.rememberProfile(profile);
  phoneStorage.signIn(token,phone.profileId);
}
/**
 * Signing in: the race flow's Join (one form: the day code, your full name and your job), or the That's me wait.
 * A phone that has joined before lists its names to tap.
 */
export function SignIn({onSignedIn}:{onSignedIn:(renamed?:Renamed)=>void}) {
  const [screen,setScreen]=useState<Screen>(phoneStorage.pass() && phoneStorage.waiting() ? 'waiting' : 'join');
  // Where Join picks up after That's me: the name typed and, after a decline, why.
  const [back,setBack]=useState({name:'',notice:''});
  const done=(result:SignedIn,renamed?:Renamed)=>{signedIn(result);onSignedIn(renamed);};
  const leaveWaiting=(notice='')=>{const name=phoneStorage.waiting()?.name||'';phoneStorage.rememberWaiting(null);setBack({name,notice});setScreen('join');};
  if(screen==='join') return <Join key={back.name+back.notice} {...back} onSignedIn={done} onWaiting={()=>setScreen('waiting')}/>;
  return <><AppHeader screen={screenNames[screen]} /><main><WaitingScreen onSignedIn={done} onLeave={leaveWaiting} /></main></>;
}
const tidyFullName=(name:string)=>name.trim().replace(/\s+/g,' ').toLowerCase();
interface Joined extends SignedIn { kind:'volunteer'|'lead'|'owner'; pass:string; profile:{id:string;name:string;secret?:string} }
/**
 * Join (race-flow.md screen 1): the day code, your full name and your job. The code is the Olympics password, or
 * today's lead code to join as Zone lead (which skips the job), or the owner password. A name this phone has joined
 * with before signs in again; one held on another phone offers That's me. Names this phone holds are listed to tap.
 */
function Join({name:typed,notice,onSignedIn,onWaiting}:{name:string;notice:string;onSignedIn:(result:SignedIn,renamed?:Renamed)=>void;onWaiting:()=>void}) {
  const [profiles,setProfiles]=useState(phoneStorage.profiles);
  const [editing,setEditing]=useState(false);
  const [code,setCode]=useState(''),[name,setName]=useState(typed),[job,setJob]=useState<Role|null>(null);
  const [taken,setTaken]=useState<string|null>(null);
  const join=useSubmit(notice),tap=useSubmit();
  // A refusal shows under the form: bring it, and its That's me, out from under the docked Join.
  const refusal=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(join.error) refusal.current?.scrollIntoView({block:'center'});},[join.error]);
  const pass=phoneStorage.pass(),held=()=>profiles.map(({id,secret})=>({id,secret}));
  /** Signs in, then keeps the job for today on this phone (a lead is Zone lead): signing in clears the last session's. */
  const enter=(result:SignedIn,role:Role|null,renamed?:Renamed)=>{onSignedIn(result,renamed);if(role) phoneStorage.rememberRole(result.phone.dayId,role);};
  const submit=(event:FormEvent)=>{event.preventDefault();setTaken(null);void join.submit(async()=>{
    const result=await api<Joined>('join',{code,name,profiles:held()});
    const final=result.profile.name,renamed=tidyFullName(final)===tidyFullName(name)?undefined:{taken:final.replace(/ \d+$/,''),name:final};
    enter(result,result.kind==='volunteer'?job:'lead',renamed);
  },error=>{if(error instanceof ApiFailure && error.body.taken) setTaken((error.body as {pass?:string}).pass??null);});};
  const thatsMe=()=>void join.submit(async()=>{phoneStorage.rememberPass(taken!);phoneStorage.rememberWaiting(await api<Waiting>('thats-me',{pass:taken,name}));onWaiting();});
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
        <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="join-code">Day code</label>
          <input className="rz-field__input" id="join-code" type="password" autoComplete="off" autoCapitalize="characters" value={code} onChange={event=>setCode(event.target.value)} required/></div>
        <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="join-name">Full name</label>
          <input className="rz-field__input" id="join-name" autoComplete="name" maxLength={80} value={name} onChange={event=>{setName(event.target.value);setTaken(null);}} required/></div>
        <fieldset style={{border:0,margin:0,padding:0,display:'flex',flexDirection:'column',gap:10}}><legend className="rz-field__label" style={{marginBottom:6,padding:0}}>What's your job today?</legend>
          <JobChoice role={job} label="What's your job today?" onChoose={setJob}/></fieldset>
        <p className="rz-field__hint">You can switch job on any race. Zone lead? Type the lead code instead of the day code.</p>
        {join.error && <div ref={refusal}>{taken?<Callout message={join.error} actions={<><button type="button" className="rz-btn rz-btn--primary" disabled={join.busy} onClick={thatsMe}>That's me</button>
          <button type="button" className="rz-btn" onClick={()=>{setTaken(null);join.setError('');document.getElementById('join-name')?.focus();}}>Change name</button></>}/>
          :<p className="rz-error" role="alert">{join.error}</p>}</div>}
      </form>
    </main>
    <footer className="rz-footer rz-footer--sticky"><button form="join" className="rz-btn rz-btn--display rz-btn--block" disabled={join.busy}>{join.busy?'Joining…':'Join'}</button></footer>
  </RzScreen>;
}
/** After That's me: the name to show a lead, checked on Home's refresh schedule until a lead decides. */
function WaitingScreen({onSignedIn,onLeave}:{onSignedIn:(result:SignedIn)=>void;onLeave:(notice?:string)=>void}) {
  const waiting=phoneStorage.waiting();
  const cancel=useSubmit();
  useEffect(()=>{
    let stopped=false;
    async function check() {
      if(!waiting || document.visibilityState!=='visible') return;
      try {
        const result=await api<{status:'waiting'|'declined'|'cancelled'}|({status:'approved'}&SignedIn)>('thats-me/status',{pass:phoneStorage.pass(),secret:waiting.secret});
        if(stopped) return;
        if(result.status==='approved') onSignedIn(result);
        else if(result.status==='declined') onLeave(declined);
        else if(result.status==='cancelled') onLeave();
      } catch(error) {if(!stopped && error instanceof ApiFailure && error.status<500) onLeave();}
    }
    void check();const timer=window.setInterval(()=>void check(),5000);
    document.addEventListener('visibilitychange',check);
    return ()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',check);};
  },[]);
  if(!waiting) return null;
  const leave=()=>void cancel.submit(async()=>{await api('thats-me/cancel',{secret:waiting.secret}).catch(error=>{if(!(error instanceof ApiFailure && error.status===404)) throw error;});onLeave();});
  return <section className="sign-in"><h1>Waiting for a lead to approve</h1>
    <p className="sign-in-lede">Show this screen to a lead. They will check it's you.</p>
    <p className="waiting-name" data-testid="waiting-name">{waiting.name}</p>
    <p className="waiting-pulse"><span aria-hidden="true"/>Waiting…</p>
    <p className="sign-in-lede">You can't do jobs on this phone until a lead approves.</p>
    {cancel.error && <p role="alert">{cancel.error}</p>}
    <ActionBar><button className="button-secondary" disabled={cancel.busy} onClick={leave}>Cancel</button></ActionBar>
  </section>;
}
