import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiFailure, phoneStorage, type HeldProfile } from '../api.js';
import type { Phone } from '../../shared/domain.js';
import { AppHeader, initials } from '../shell/AppHeader.js';
import { ActionBar } from '../flow/ActionBar.js';
import './access.css';
interface SignedIn { token:string; phone:Phone; pass?:string; profile?:{id:string;name:string;secret?:string} }
/** Lead sign-in numbered a name taken on another phone: `taken` is that name, `name` the one signed in. */
export interface Renamed { taken:string; name:string }
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
export function SignIn({onSignedIn}:{onSignedIn:(renamed?:Renamed)=>void}) {
  const [screen,setScreen]=useState<Screen>(phoneStorage.pass() ? 'profiles' : 'password');
  const [owner,setOwner]=useState({password:'',dayRunning:true});
  const done=(result:SignedIn,renamed?:Renamed)=>{signedIn(result);onSignedIn(renamed);};
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
const roleTag=(level?:string|null)=>level==='Lead' ? <span className="badge">Lead</span> : level==='Scoring team' ? <span className="badge badge-scoring">Scoring team</span> : null;
const tidy=(name:string)=>name.trim().replace(/\s+/g,' ').toLowerCase();
type Open=''|'create-profile'|'lead-sign-in';
/** One of the profile screen's sections that open in place below the list; one is open at a time. */
function Section({id,title,open,onToggle,onSubmit,children}:{id:Exclude<Open,''>;title:string;open:Open;onToggle:()=>void;onSubmit:(event:FormEvent)=>void;children:ReactNode}) {
  return <div className="sign-in-section">
    <button type="button" className="sign-in-toggle" aria-expanded={open===id} aria-controls={id} onClick={onToggle}>
      {title}<span aria-hidden="true">{open===id ? '−' : '+'}</span>
    </button>
    {open===id && <form id={id} onSubmit={onSubmit}>{children}</form>}
  </div>;
}
/** "Who's using this phone?": the profiles made on this phone with today's role, one tap to sign in, and Create profile and Lead sign-in opening in place. */
function ProfileScreen({onSignedIn,onPasswordChanged}:{onSignedIn:(result:SignedIn,renamed?:Renamed)=>void;onPasswordChanged:()=>void}) {
  const [profiles]=useState(phoneStorage.profiles);
  const [levels,setLevels]=useState<Record<string,string|null>>({});
  const [open,setOpen]=useState<Open>(profiles.length===0 ? 'create-profile' : '');
  const [name,setName]=useState('');
  const [lead,setLead]=useState({name:'',code:''});
  const tap=useSubmit(),create=useSubmit(),leadIn=useSubmit();
  const refused=(error:unknown)=>{if(error instanceof ApiFailure && error.body.reason==='password-changed') onPasswordChanged();};
  const pass=phoneStorage.pass();
  const held=()=>profiles.map(({id,secret})=>({id,secret}));
  useEffect(()=>{
    if(!profiles.length) return;
    let live=true;
    // The tags are a nicety: a failed read leaves the rows untagged.
    api<{profiles:{id:string;level?:string|null}[]}>('phone-profiles',{pass,profiles:held()})
      .then(result=>{if(live) setLevels(Object.fromEntries(result.profiles.map(({id,level})=>[id,level??null])));},error=>{if(live) refused(error);});
    return ()=>{live=false;};
  },[]);
  const toggle=(id:Exclude<Open,''>)=>()=>{setOpen(open===id ? '' : id);create.setError('');leadIn.setError('');};
  const signIn=(profile:HeldProfile)=>void tap.submit(async()=>onSignedIn(await api<SignedIn>('sign-in',{pass,profileId:profile.id,secret:profile.secret})),refused);
  const createProfile=(event:FormEvent)=>{event.preventDefault();void create.submit(async()=>onSignedIn(await api<SignedIn>('profiles',{pass,name})),refused);};
  const leadSignIn=(event:FormEvent)=>{event.preventDefault();void leadIn.submit(async()=>{
    const result=await api<SignedIn&{profile:{name:string}}>('lead-sign-in',{pass,name:lead.name,code:lead.code,profiles:held()});
    // A name taken on another phone comes back numbered, spelled as the existing profile is ("Sam Patel 2").
    const final=result.profile.name;
    onSignedIn(result,tidy(final)===tidy(lead.name) ? undefined : {taken:final.replace(/ \d+$/,''),name:final});
  },refused);};
  const submitting=open==='create-profile' ? create : leadIn;
  return <section className="sign-in"><h1>Who's using this phone?</h1>
    {profiles.length>0 && <><p className="sign-in-lede">Tap your name.</p>
      <div className="profile-rows">{profiles.map(profile=><button key={profile.id} className="profile-row" disabled={tap.busy} onClick={()=>signIn(profile)}>
        <span className="avatar" aria-hidden="true">{initials(profile.name)}</span><span className="profile-text"><span className="profile-name">{profile.name}</span>{roleTag(levels[profile.id])}</span>{chevron}
      </button>)}</div>
      {tap.error && <p role="alert">{tap.error}</p>}</>}
    <Section id="create-profile" title="New here? Create profile" open={open} onToggle={toggle('create-profile')} onSubmit={createProfile}>
      <label>Full name<input autoComplete="name" maxLength={80} value={name} onChange={event=>setName(event.target.value)} required /></label>
      {create.error && <p role="alert">{create.error}</p>}
    </Section>
    <Section id="lead-sign-in" title="Lead today? Sign in" open={open} onToggle={toggle('lead-sign-in')} onSubmit={leadSignIn}>
      <label>Full name<input autoComplete="name" maxLength={80} value={lead.name} onChange={event=>setLead({...lead,name:event.target.value})} required /></label>
      <label>Today's lead code<input autoComplete="off" autoCapitalize="characters" value={lead.code} onChange={event=>setLead({...lead,code:event.target.value})} required /></label>
      {leadIn.error && <p role="alert">{leadIn.error}</p>}
    </Section>
    {open && <ActionBar><button form={open} disabled={submitting.busy}>{open==='create-profile' ? (create.busy ? 'Creating…' : 'Create profile') : (leadIn.busy ? 'Signing in…' : 'Sign in as lead')}</button></ActionBar>}
  </section>;
}
