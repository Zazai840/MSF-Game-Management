import { useEffect } from 'react';
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
  |{kind:'race-page';code:string;raceId:string}|{kind:'day'}|{kind:'signed-in-today'}|{kind:'events'};
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
  }
}
/** Where the back arrow goes on a screen reached with no history (a reload of a typed address): one level up. */
export function parentOf(view:View):View {
  switch(view.kind) {
    case 'race-page': return {kind:'event',code:view.code,tab:'races'};
    case 'event': return {kind:'results'};
    case 'signed-in-today': case 'events': return {kind:'day'};
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
