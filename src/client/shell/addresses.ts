import { useEffect,useRef } from 'react';
import type { Step } from '../../shared/race-flow.js';
/** An event's tabs, part of its address so Back from a race page returns to the tab it was opened from. */
export const eventTabs=['heats','final','races','notes'] as const;
export type EventTab=typeof eventTabs[number];
/**
 * Every screen with its own address (spec #250 "Navigation"). Races and the race screen are the race flow; the rest are
 * the lead's screens. To add a screen: add its kind here, its address in viewAt and addressOf, its natural parent in
 * parentOf, then render it in App with a LeadBar naming it.
 */
export type View={kind:'races'}|{kind:'race';id:string;step?:Step}|{kind:'results'}|{kind:'event';code:string;tab:EventTab}
  |{kind:'race-page';code:string;raceId:string}|{kind:'day'}|{kind:'signed-in-today'}|{kind:'events'}|{kind:'olympics-password'}
  |{kind:'rename-event';code:string}|{kind:'new-event'};
const part=encodeURIComponent;
/** The screen an address opens; an address the app does not know opens Races. */
export function viewAt(path:string):View {
  const [first,...rest]=path.split('/').filter(Boolean).map(decodeURIComponent);
  const [a,b,c]=rest;
  if(first==='races' && rest.length===1) return {kind:'race',id:a!};
  if(first==='results') {
    if(!rest.length) return {kind:'results'};
    if(rest.length===1) return {kind:'event',code:a!,tab:'heats'};
    if(rest.length===2 && eventTabs.includes(b as EventTab)) return {kind:'event',code:a!,tab:b as EventTab};
    if(rest.length===3 && b==='races') return {kind:'race-page',code:a!,raceId:c!};
  }
  if(first==='day') {
    if(!rest.length) return {kind:'day'};
    if(rest.length===1 && a==='signed-in-today') return {kind:'signed-in-today'};
    if(rest.length===1 && a==='events') return {kind:'events'};
    if(rest.length===1 && a==='olympics-password') return {kind:'olympics-password'};
    if(rest.length===2 && a==='events' && b==='new') return {kind:'new-event'};
    if(rest.length===3 && a==='events' && c==='rename') return {kind:'rename-event',code:b!};
  }
  return {kind:'races'};
}
export function addressOf(view:View):string {
  switch(view.kind) {
    case 'races': return '/';
    case 'race': return `/races/${part(view.id)}`;
    case 'results': return '/results';
    case 'event': return `/results/${part(view.code)}/${view.tab}`;
    case 'race-page': return `/results/${part(view.code)}/races/${part(view.raceId)}`;
    case 'day': return '/day';
    case 'signed-in-today': return '/day/signed-in-today';
    case 'events': return '/day/events';
    case 'olympics-password': return '/day/olympics-password';
    case 'rename-event': return `/day/events/${part(view.code)}/rename`;
    case 'new-event': return '/day/events/new';
  }
}
/** Where the back arrow goes on a screen reached with no history (a reload of a typed address): one level up. */
export function parentOf(view:View):View {
  switch(view.kind) {
    case 'race-page': return {kind:'event',code:view.code,tab:'races'};
    case 'event': return {kind:'results'};
    case 'signed-in-today': case 'events': case 'olympics-password': return {kind:'day'};
    case 'rename-event': case 'new-event': return {kind:'events'};
    default: return {kind:'races'};
  }
}
/** What a history entry carries: the name of the screen it was opened from, for the back arrow's label. */
export interface Entry { back:string }
let shown='Races';
/** The name of the screen showing now ("Results", "Heat 2"): what the next screen's back arrow will name. */
export const shownName=()=>shown;
/** Names the screen showing now; every screen another screen can be opened from calls it. */
export function useScreenName(name:string) {
  useEffect(()=>{shown=name;},[name]);
}
/** The back arrow's label carried by this history entry, or null when the screen was reached with no history. */
export const entryBack=()=>(history.state as Entry|null)?.back??null;
/**
 * An open sheet's history entry (spec #250 "Bottom sheets"): opening a sheet pushes one at the same address, so the
 * phone's Back closes the sheet and leaves the screen behind it. A sheet closed any other way takes its entry back off.
 */
interface OpenSheet { id:string; path:string; close:()=>void }
const sheets:OpenSheet[]=[];
// `leaving`: a closed sheet's entry, to come off once this commit is done unless a sheet opened in its place takes it.
// `taken`: a sheet entry a screen move took over, which its sheet leaves alone. `ignore`: Backs the app made itself.
let leaving:string|null=null,taken:string|null=null,ignore=0,opened=0;
const entryOfSheet=()=>(history.state as {sheet?:string}|null)?.sheet;
export function useSheetEntry(onClose:()=>void) {
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    // A count, not crypto.randomUUID: Safari 15.0-15.3 has none. Unique enough across reloads with the time in it.
    const sheet={id:`${Date.now()}-${++opened}`,path:location.pathname,close:()=>close.current()};
    if(leaving && entryOfSheet()===leaving) {leaving=null;history.replaceState({...history.state,sheet:sheet.id},'');}
    else history.pushState({...history.state,sheet:sheet.id},'');
    sheets.push(sheet);
    return ()=>{
      const at=sheets.indexOf(sheet);if(at>=0) sheets.splice(at,1);
      if(entryOfSheet()!==sheet.id || taken===sheet.id) return;
      leaving=sheet.id;
      queueMicrotask(()=>{if(leaving!==sheet.id) return;leaving=null;ignore++;history.back();});
    };
  },[]);
}
/**
 * For the app's history listener: true when this Back was a sheet's, so the screen stays. The phone's Back closes the
 * top sheet; a sheet closed another way ignores the Back that took its entry off.
 */
export function sheetBack():boolean {
  if(ignore) {ignore--;return true;}
  const top=sheets.pop();
  top?.close();
  return top?.path===location.pathname;
}
/** A screen move with a sheet's entry showing: true, and the move takes that entry's place or goes back past it. */
export function onSheetEntry() {
  const id=entryOfSheet();
  if(id) taken=id;
  return !!id;
}
