const prefix = 'msf:';
let epoch=0;
let resetPending=false;
/** What a phone keeps when a session ends: the Olympics password pass and the profiles made on it. */
const kept=[`${prefix}pass`,`${prefix}profiles`];
/** What each 401 reason leaves on the phone. With no known reason, everything goes. */
const keptAfter:Record<string,string[]>={'new-day':kept,'password-changed':[`${prefix}profiles`],'signed-out':[`${prefix}profiles`],moved:kept};
// The session marker goes last: other tabs act on its storage event, so by then the rest is already gone.
const erase=(keep:string[]=[])=>{
  for(const key of Object.keys(localStorage)) if(key.startsWith(prefix) && !keep.includes(key) && key!==`${prefix}session`) localStorage.removeItem(key);
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
export interface Waiting {secret:string;name:string}
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
  /** A That's me request waiting for a lead, kept until it is approved, declined or cancelled. */
  waiting:():Waiting|null=>{try {return JSON.parse(localStorage.getItem(`${prefix}waiting`)||'null');} catch {return null;}},
  rememberWaiting:(waiting:Waiting|null)=>waiting?localStorage.setItem(`${prefix}waiting`,JSON.stringify(waiting)):localStorage.removeItem(`${prefix}waiting`),
  /** A new session drops the old one's drafts but keeps the pass and profiles. */
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
  /** Sign out: the pass, session and drafts go, the profiles stay, and every tab goes to the password screen. */
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
  if (!response.ok) {
    const result = await response.json().catch(()=>({message:'Could not connect - please try again'}));
    current(captured);
    if (response.status === 401) {
      phoneStorage.clear(result.reason);
      window.dispatchEvent(new Event('msf:removed'));
    }
    throw new ApiFailure(response.status, result.message || 'Could not connect - please try again', result);
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
  // pending responses before sending, while retaining drafts until confirmed.
  if(resetPending) throw new StaleRequest();
  epoch++;resetPending=true;
  try {
    const {phone}=await api<{phone:{dayId:string}}>('day/start-new',{confirmation});
    resetPending=false;phoneStorage.newDay(phone.dayId);
  } finally {resetPending=false;}
}
