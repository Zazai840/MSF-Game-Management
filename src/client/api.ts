const prefix = 'msf:';
let epoch=0;
let resetPending=false;
const erase=()=>{for(const key of Object.keys(localStorage)) if(key.startsWith(prefix)) localStorage.removeItem(key);};
const token=()=>localStorage.getItem(`${prefix}token`);
const dayId=()=>localStorage.getItem(`${prefix}day`);
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
  token,dayId,
  rememberDay:(id:string)=>localStorage.setItem(`${prefix}day`,id),
  join:(joinedToken:string)=>{
    erase();localStorage.setItem(`${prefix}token`,joinedToken);localStorage.setItem(`${prefix}session`,newSession());changed(false);
  },
  newDay:(id:string)=>{
    const retained=token();erase();
    if(retained) localStorage.setItem(`${prefix}token`,retained);
    localStorage.setItem(`${prefix}day`,id);localStorage.setItem(`${prefix}session`,newSession());changed(true);
  },
  clear:()=>{erase();epoch++;}
};
// Tabs share this app's storage. A changed session marker also invalidates
// outstanding work when the retained bearer token stays the same after reset.
window.addEventListener('storage',event=>{
  if(event.key===`${prefix}session` || event.key===null) changed(Boolean(token() && dayId()));
});
export class ApiFailure extends Error { constructor(public status: number, message: string) { super(message); } }
export class StaleRequest extends Error {constructor(){super('Please refresh');}}
const sessions=new WeakMap<Response,string>();
function current(captured:string) {if(captured!==sessionId()) throw new StaleRequest();}
/** JSON and binary calls share authentication, removal and session lifetime. */
export async function apiResponse(path:string,body?:unknown):Promise<Response> {
  if(resetPending && path!=='day/start-new') throw new StaleRequest();
  const captured=sessionId(),joinedToken=token();
  let response:Response;
  try {
    response=await fetch(`/api/${path}`, {
      method:body === undefined ? 'GET':'POST',
      headers:{...(joinedToken ? {authorization:`Bearer ${joinedToken}`} : {}), ...(body === undefined ? {} : {'content-type':'application/json'})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
  } catch(error) {current(captured);throw error;}
  current(captured);
  if (!response.ok) {
    const result = await response.json().catch(()=>({message:'Could not connect - please try again'}));
    current(captured);
    if (response.status === 401) {
      phoneStorage.clear();
      window.dispatchEvent(new Event('msf:removed'));
    }
    throw new ApiFailure(response.status, result.message || 'Could not connect - please try again');
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
