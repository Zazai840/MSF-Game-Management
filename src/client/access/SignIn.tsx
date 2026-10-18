import { useState, type FormEvent } from 'react';
import { api, ApiFailure, phoneStorage, type HeldProfile } from '../api.js';
import type { Phone } from '../../shared/domain.js';
import { AppHeader, initials } from '../shell/AppHeader.js';
import { ActionBar } from '../flow/ActionBar.js';
import './access.css';
interface SignedIn { token:string; phone:Phone; pass?:string; profile?:{id:string;name:string;secret?:string} }
type Screen = 'password'|'owner'|'profiles';
const screenNames:Record<Screen,string>={password:'Olympics password',owner:'Owner sign-in',profiles:'Profiles'};
const failure=(error:unknown)=>error instanceof Error ? error.message : 'Could not connect - please try again';
/** Runs one sign-in request, keeping the busy state and the refusal for the form that sent it. */
function useSubmit() {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(send:()=>Promise<void>,onRefused?:(error:unknown)=>void) {
    setBusy(true);setError('');
    try {await send();}
    catch(error) {setError(failure(error));onRefused?.(error);}
    finally {setBusy(false);}
  }
  return {busy,error,submit,setError};
}
function signedIn({token,pass,profile}:SignedIn) {
  if(pass) phoneStorage.rememberPass(pass);
  if(profile) phoneStorage.rememberProfile(profile);
  phoneStorage.signIn(token);
}
/** Signing in, as in version D of the onboarding prototype: the Olympics password once per phone, then a profile. */
export function SignIn({onSignedIn}:{onSignedIn:()=>void}) {
  const [screen,setScreen]=useState<Screen>(phoneStorage.pass() ? 'profiles' : 'password');
  const [owner,setOwner]=useState({password:'',dayRunning:true});
  const done=(result:SignedIn)=>{signedIn(result);onSignedIn();};
  return <><AppHeader screen={screenNames[screen]} /><main>
    {screen==='password' ? <PasswordScreen onOlympics={pass=>{phoneStorage.rememberPass(pass);setScreen('profiles');}} onOwner={(password,dayRunning)=>{setOwner({password,dayRunning});setScreen('owner');}} />
      : screen==='owner' ? <OwnerScreen {...owner} onSignedIn={done} onBack={()=>setScreen('password')} />
      : <ProfileScreen onSignedIn={done} onPasswordChanged={()=>setScreen('password')} />}
  </main></>;
}
function PasswordScreen({onOlympics,onOwner}:{onOlympics:(pass:string)=>void;onOwner:(password:string,dayRunning:boolean)=>void}) {
  const [password,setPassword]=useState('');
  const {busy,error,submit}=useSubmit();
  const check=(event:FormEvent)=>{event.preventDefault();void submit(async()=>{
    const result=await api<{kind:'olympics';pass:string}|{kind:'owner';dayRunning:boolean}>('password',{password});
    if(result.kind==='olympics') onOlympics(result.pass);else onOwner(password,result.dayRunning);
  });};
  return <section className="sign-in"><h1>Welcome to the Running Zone</h1>
    <p className="sign-in-lede">Type the Olympics password. You only need it once on this phone.</p>
    <form id="olympics-password" onSubmit={check}>
      <label>Olympics password<input type="password" autoComplete="off" value={password} onChange={event=>setPassword(event.target.value)} required /></label>
      {error && <p role="alert">{error}</p>}
    </form>
    <ActionBar><button form="olympics-password" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button></ActionBar>
  </section>;
}
function OwnerScreen({password,dayRunning,onSignedIn,onBack}:{password:string;dayRunning:boolean;onSignedIn:(result:SignedIn)=>void;onBack:()=>void}) {
  const [name,setName]=useState('');
  const {busy,error,submit}=useSubmit();
  const signIn=(event:FormEvent)=>{event.preventDefault();void submit(async()=>onSignedIn(await api<SignedIn>('owner-sign-in',{password,name,profiles:phoneStorage.profiles().map(({id,secret})=>({id,secret}))})));};
  return <section className="sign-in"><h1>What's your full name?</h1>
    <p className="sign-in-lede">You'll sign in as the scoring team.</p>
    {!dayRunning && <p className="calm-note">No Olympics day is running. Signing in starts today's day.</p>}
    <form id="owner-sign-in" onSubmit={signIn}>
      <label>Full name<input autoComplete="name" maxLength={80} value={name} onChange={event=>setName(event.target.value)} required /></label>
      {error && <p role="alert">{error}</p>}
    </form>
    <button type="button" className="button-quiet sign-in-back" onClick={onBack}>Back</button>
    <ActionBar><button form="owner-sign-in" disabled={busy}>{busy ? 'Signing in…' : dayRunning ? 'Sign in' : 'Start the day and sign in'}</button></ActionBar>
  </section>;
}
const chevron=<svg className="profile-chevron" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>;
/** "Who's using this phone?": the profiles made on this phone, one tap to sign in, and Create profile opening in place. */
function ProfileScreen({onSignedIn,onPasswordChanged}:{onSignedIn:(result:SignedIn)=>void;onPasswordChanged:()=>void}) {
  const [profiles,setProfiles]=useState(phoneStorage.profiles);
  const [creating,setCreating]=useState(profiles.length===0);
  const [editing,setEditing]=useState(false);
  const [removing,setRemoving]=useState<HeldProfile|null>(null);
  const [name,setName]=useState('');
  const tap=useSubmit(),create=useSubmit();
  const refused=(error:unknown)=>{if(error instanceof ApiFailure && error.body.reason==='password-changed') onPasswordChanged();};
  const pass=phoneStorage.pass();
  const signIn=(profile:HeldProfile)=>void tap.submit(async()=>onSignedIn(await api<SignedIn>('sign-in',{pass,profileId:profile.id,secret:profile.secret})),refused);
  const forget=(profile:HeldProfile)=>{
    phoneStorage.forgetProfile(profile.id);
    const left=phoneStorage.profiles();
    setProfiles(left);setRemoving(null);
    if(left.length===0) {setEditing(false);setCreating(true);}
  };
  const createProfile=(event:FormEvent)=>{event.preventDefault();void create.submit(async()=>onSignedIn(await api<SignedIn>('profiles',{pass,name})),refused);};
  return <section className="sign-in"><h1>Who's using this phone?</h1>
    {phoneStorage.newDayLine() && <p className="calm-note">A new Olympics day has started. Tap your name to sign in.</p>}
    {profiles.length>0 && <><div className="profile-list-head"><p className="sign-in-lede">{editing ? "Tidy this phone's list." : 'Tap your name.'}</p>
        <button type="button" className="button-quiet" onClick={()=>{setEditing(!editing);setRemoving(null);}}>{editing ? 'Done' : 'Edit list'}</button></div>
      <div className="profile-rows">{profiles.map(profile=>!editing ? <button key={profile.id} className="profile-row" disabled={tap.busy} onClick={()=>signIn(profile)}>
        <span className="avatar" aria-hidden="true">{initials(profile.name)}</span><span className="profile-name">{profile.name}</span>{chevron}
      </button> : removing?.id===profile.id ? <div key={profile.id} className="profile-row profile-confirm">
        <p>Remove {profile.name} from this phone? Your profile isn't deleted. A lead can put it back on any phone.</p>
        <div className="profile-confirm-actions"><button className="button-small" onClick={()=>forget(profile)}>Remove from this phone</button><button className="button-secondary button-small" onClick={()=>setRemoving(null)}>Keep</button></div>
      </div> : <div key={profile.id} className="profile-row">
        <span className="avatar" aria-hidden="true">{initials(profile.name)}</span><span className="profile-name">{profile.name}</span>
        <button className="button-quiet" aria-label={`Remove ${profile.name}`} onClick={()=>setRemoving(profile)}>Remove</button>
      </div>)}</div>
      {tap.error && <p role="alert">{tap.error}</p>}</>}
    <div className="sign-in-section">
      <button type="button" className="sign-in-toggle" aria-expanded={creating} aria-controls="create-profile" onClick={()=>{setCreating(!creating);create.setError('');}}>
        New here? Create profile<span aria-hidden="true">{creating ? '−' : '+'}</span>
      </button>
      {creating && <form id="create-profile" onSubmit={createProfile}>
        <label>Full name<input autoComplete="name" maxLength={80} value={name} onChange={event=>setName(event.target.value)} required /></label>
        {create.error && <p role="alert">{create.error}</p>}
      </form>}
    </div>
    {creating && <ActionBar><button form="create-profile" disabled={create.busy}>{create.busy ? 'Creating…' : 'Create profile'}</button></ActionBar>}
  </section>;
}
