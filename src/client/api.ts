import { roles,type Role } from '../shared/race-flow.js';
import { onThisBuild } from './shell/updates.js';
const prefix = 'msf:';
let epoch=0;
let resetPending=false;
/** What a phone keeps when a session ends: the Olympics password pass and the profiles made on it. */
const kept=[`${prefix}pass`,`${prefix}profiles`];
/** What each 401 reason leaves on the phone. With no known reason, everything goes. */
const keptAfter:Record<string,string[]>={'new-day':kept,'password-changed':[`${prefix}profiles`],'signed-out':[`${prefix}profiles`],moved:kept};
/** Home's last tab belongs to the phone, not the session, so it outlasts sign-ins. */
const homeTabKey=`${prefix}home-tab`;
export type HomeTab='races'|'hurdles'|'relays';
const homeTabs:HomeTab[]=['races','hurdles','relays'];
// The session marker goes last: other tabs act on its storage event, so by then the rest is already gone.
const erase=(keep:string[]=[])=>{
  for(const key of Object.keys(localStorage)) if(key.startsWith(prefix) && !keep.includes(key) && key!==`${prefix}session` && key!==homeTabKey) localStorage.removeItem(key);
  localStorage.removeItem(`${prefix}session`);
};
const token=()=>localStorage.getItem(`${prefix}token`);
export interface HeldProfile {id:string;name:string;secret:string}
function profiles():HeldProfile[] {
  try {return JSON.parse(localStorage.getItem(`${prefix}profiles`)||'[]');} catch {return [];}
}
const dayId=()=>localStorage.getItem(`${prefix}day`);
/** The profile signed in now, so a "moved" 401 knows which profile to forget. */
const signedInProfile=()=>localStorage.getItem(`${prefix}profile`);
const forgetProfile=(id:string)=>localStorage.setItem(`${prefix}profiles`,JSON.stringify(profiles().filter(entry=>entry.id!==id)));
const sessionId=()=>`${epoch}:${token()}:${localStorage.getItem(`${prefix}session`)}`;
function newSession() {
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}
function changed(newDay:boolean) {
  epoch++;
  window.dispatchEvent(new CustomEvent('msf:session',{detail:{newDay}}));
}
export const phoneStorage = {
  token,dayId,session:sessionId,profiles,
  rememberDay:(id:string)=>localStorage.setItem(`${prefix}day`,id),
  pass:()=>localStorage.getItem(`${prefix}pass`),
  rememberPass:(pass:string)=>localStorage.setItem(`${prefix}pass`,pass),
  /** Keeps a profile made on (or signed in from) this phone. A secret only comes back when it is new (That's me issues one), so it replaces the held one. */
  rememberProfile:(profile:{id:string;name:string;secret?:string})=>{
    if(!profile.secret) return;
    const held=profiles(),entry={id:profile.id,name:profile.name,secret:profile.secret};
    localStorage.setItem(`${prefix}profiles`,JSON.stringify(held.some(other=>other.id===entry.id)?held.map(other=>other.id===entry.id?entry:other):[...held,entry]));
  },
  /** Edit list: forgets a profile on this phone only; the profile stays on the server. */
  forgetProfile,
  /** The Home tab this phone used last: Races on a phone that never switched, or when storage fails. */
  homeTab:():HomeTab=>{try {const tab=localStorage.getItem(homeTabKey) as HomeTab;return homeTabs.includes(tab)?tab:'races';} catch {return 'races';}},
  rememberHomeTab:(tab:HomeTab)=>{try {localStorage.setItem(homeTabKey,tab);} catch {/* the tab still switches; it is just not remembered */}},
  /** The job chosen for today on this phone (Start line, Finish line, Timer or Zone lead), or null before it is chosen. */
  role:(day:string):Role|null=>{try {const held=JSON.parse(localStorage.getItem(`${prefix}role`)||'null');return held?.day===day && roles.includes(held.role)?held.role:null;} catch {return null;}},
  rememberRole:(day:string,role:Role)=>{try {localStorage.setItem(`${prefix}role`,JSON.stringify({day,role}));} catch {/* the job still switches; it is just not remembered */}},
  /** The races where this person has seen the usual-heat-size warning: it shows once per race. */
  warnedSize:(raceId:string)=>{try {return (JSON.parse(localStorage.getItem(`${prefix}warned-size`)||'[]') as string[]).includes(raceId);} catch {return false;}},
  rememberWarnedSize:(raceId:string)=>{try {const held=JSON.parse(localStorage.getItem(`${prefix}warned-size`)||'[]') as string[];localStorage.setItem(`${prefix}warned-size`,JSON.stringify([...held.slice(-50),raceId]));} catch {/* it may show again */}},
  /** A new session drops what the old one kept but keeps the pass and profiles. */
  signIn:(signedInToken:string,profileId:string|null)=>{
    erase(kept);localStorage.setItem(`${prefix}token`,signedInToken);
    if(profileId) localStorage.setItem(`${prefix}profile`,profileId);
    localStorage.setItem(`${prefix}session`,newSession());changed(false);
  },
  newDay:(id:string)=>{
    const retained=token(),profile=signedInProfile();erase(kept);
    if(retained) localStorage.setItem(`${prefix}token`,retained);
    if(profile) localStorage.setItem(`${prefix}profile`,profile);
    localStorage.setItem(`${prefix}day`,id);localStorage.setItem(`${prefix}session`,newSession());changed(true);
  },
  /** Whether the profile screen says a new Olympics day has started; signing in drops it with the rest of the old session. */
  newDayLine:()=>localStorage.getItem(`${prefix}new-day`)!==null,
  /** The server ended the session (a 401): clears exactly what its reason calls for. */
  clear:(reason='')=>{
    const profile=signedInProfile();
    erase(Object.hasOwn(keptAfter,reason)?keptAfter[reason]:[]);
    if(reason==='new-day') localStorage.setItem(`${prefix}new-day`,'1');
    if(reason==='moved' && profile) forgetProfile(profile);
    epoch++;
  },
  /** Log out: the pass, session and drafts go, the listed names stay, and every tab goes to Join. */
  signOut:()=>{erase(keptAfter['signed-out']);changed(false);}
};
// Tabs share this app's storage. A changed session marker also invalidates
// outstanding work when the retained bearer token stays the same after reset.
window.addEventListener('storage',event=>{
  if(event.key===`${prefix}session` || event.key===null) changed(Boolean(token() && dayId()));
});
export class ApiFailure extends Error { constructor(public status: number, message: string, public body: {reason?:string;taken?:boolean} = {}) { super(message); } }
export class StaleRequest extends Error {constructor(){super('Please refresh');}}
const sessions=new WeakMap<Response,string>();
function current(captured:string) {if(captured!==sessionId()) throw new StaleRequest();}
/** JSON and binary calls share authentication, removal and session lifetime. */
export async function apiResponse(path:string,body?:unknown,signal?:AbortSignal):Promise<Response> {
  if(resetPending && path!=='day/start-new') throw new StaleRequest();
  const captured=sessionId(),sessionToken=token();
  let response:Response;
  try {
    response=await fetch(`/api/${path}`, {
      method:body === undefined ? 'GET':'POST', signal,
      headers:{...(sessionToken ? {authorization:`Bearer ${sessionToken}`} : {}), ...(body === undefined ? {} : {'content-type':'application/json'})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
  } catch(error) {current(captured);throw error;}
  current(captured);
  onThisBuild(response.headers.get('x-build-id'));
  if (!response.ok) {
    const result:{message?:string;reason?:string;taken?:boolean}|null = await response.json().catch(()=>null);
    current(captured);
    // A 401 whose reason was never read (the screen let go of the request, or the link dropped) clears nothing:
    // erasing as if no reason were given would drop the listed names. The phone's next request is told again.
    if (response.status === 401 && result) {
      phoneStorage.clear(result.reason);
      window.dispatchEvent(new Event('msf:removed'));
    }
    throw new ApiFailure(response.status, result?.message || 'Could not connect - please try again', result ?? {});
  }
  sessions.set(response,captured);
  return response;
}
export async function api<T>(path:string,body?:unknown):Promise<T> {
  const response=await apiResponse(path,body),captured=sessions.get(response)!;
  const result=await response.json();current(captured);return result as T;
}
export async function apiDownload(path:string):Promise<{blob:Blob;filename:string}> {
  const response=await apiResponse(path,{}),captured=sessions.get(response)!;
  const blob=await response.blob();current(captured);
  return {blob,filename:response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'day-export.xlsx'};
}
export async function startNewDay(confirmation:string) {
  // A lost reply still means the server may have committed. Invalidate already
  // pending responses before sending, while keeping the session until confirmed.
  if(resetPending) throw new StaleRequest();
  epoch++;resetPending=true;
  try {
    const {phone}=await api<{phone:{dayId:string}}>('day/start-new',{confirmation});
    resetPending=false;phoneStorage.newDay(phone.dayId);
  } finally {resetPending=false;}
}
