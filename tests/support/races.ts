import type { FastifyInstance } from 'fastify';
import { isRunner } from '../../src/shared/races.js';
import { stepsOf,type RaceFlowRead,type RacesRead } from '../../src/shared/race-flow.js';
/** What the helpers answer: the race worked on, with its event (and in the race flow, its group and steps). */
type Worked=Pick<RaceFlowRead,'race'> & Partial<RaceFlowRead> & {event?:RaceFlowRead['group']['event']};
/**
 * The one way server tests set races up, as the phone whose token is given, through the same writes a volunteer's
 * taps make, failing the test unless the server accepts each. Wristbands name the runners.
 *
 * An individual event is worked in the race flow (ADR 0003), on the race the event is at: its final once it has one,
 * else its latest race not saved, else a new next heat. Submit marks every step done, which saves the race. Relays
 * have their own helpers (`relayFlowSetup`).
 */
export function raceSetup(app:FastifyInstance) {
  async function post<T>(token:string,url:string,body:object) {
    const response=await app.inject({method:'POST',url,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},payload:JSON.stringify(body)});
    if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
    return response.json() as T;
  }
  async function get<T>(token:string,url:string) {
    const response=await app.inject({url,headers:{authorization:`Bearer ${token}`}});
    if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
    return response.json() as T;
  }
  const group=async(token:string,code:string)=>(await get<RacesRead>(token,'/api/races')).groups.find(item=>item.event.code===code);
  /** The race an individual event is at, or null when it has none to work (a new heat is made on the first write). */
  async function at(token:string,code:string) {
    const own=await group(token,code);
    if(!own) return {own,race:null};
    const race=own.races.find(item=>item.kind==='final') ?? own.races.filter(item=>item.state!=='saved').at(-1);
    return {own,race:race?await get<RaceFlowRead>(token,`/api/races/${race.id}`):null};
  }
  /** The race an individual event is at, making its next heat when it has none. */
  async function worked(token:string,code:string) {
    const {own,race}=await at(token,code);
    if(!own) throw new Error(`${code} is switched off`);
    return race??await post<RaceFlowRead>(token,'/api/races',{eventCode:code,kind:'heat',number:own.nextHeat});
  }
  const id=(race:RaceFlowRead['race'],wristband:number)=>race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id;
  /** Checks these runners in to the event's race (the whole list), making its next heat when it has none. */
  async function checkIn(token:string,code:string,runners:number[],keptWarnings:number[]=[]) {
    const read=await worked(token,code),raceId=read.race.id;
    return (await post<RaceFlowRead>(token,`/api/races/${raceId}/check-in`,{raceId,version:read.race.parts.runners.version,runners:runners.map(wristband=>({wristband})),keptWarnings})).race;
  }
  /** A final's check-in by wristband: those marked Here (by default the whole line-up) and those marked Absent. */
  async function attend(token:string,code:string,here?:number[],absent:number[]=[]) {
    const read=await worked(token,code),raceId=read.race.id,entries=read.race.final!.entries;
    const ids=(marked:number[])=>entries.filter(entry=>marked.includes(entry.wristband!)).map(entry=>entry.finalEntryId);
    const present=here?ids(here):entries.filter(entry=>!absent.includes(entry.wristband!)).map(entry=>entry.finalEntryId);
    return (await post<RaceFlowRead>(token,`/api/races/${raceId}/absent`,{raceId,version:read.race.parts.runners.version,here:present,absent:ids(absent)})).race;
  }
  /** Writes the finishing order: every runner in `order`, `didNotFinish` or `didNotRun`; `added` are runners not on the list. */
  async function order(token:string,code:string,placed:number[],{didNotFinish=[],didNotRun=[],added=[],keptWarnings=[]}:{didNotFinish?:number[];didNotRun?:number[];added?:number[];keptWarnings?:number[]}={}) {
    const read=await worked(token,code),raceId=read.race.id,url=`/api/races/${raceId}/order`;
    // A runner added at the finish has no entry until this write makes one, so the server is told it twice: added, then placed.
    const first=added.length?(await post<RaceFlowRead>(token,url,{raceId,version:read.race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added,keptWarnings})).race:read.race;
    return (await post<RaceFlowRead>(token,url,{raceId,version:first.parts.finish.version,order:placed.map(wristband=>id(first,wristband)),didNotFinish:didNotFinish.map(wristband=>id(first,wristband)),didNotRun:didNotRun.map(wristband=>id(first,wristband)),added:[]})).race;
  }
  /** Writes the times by place, in hundredths; `keptWrong` are the places (0-based) whose wrong time the timer kept. */
  async function times(token:string,code:string,places:number[],keptWrong:number[]=[]) {
    const read=await worked(token,code),raceId=read.race.id;
    return (await post<RaceFlowRead>(token,`/api/races/${raceId}/times`,{raceId,version:read.race.parts.times.version,places,keptWrong})).race;
  }
  /** The event's race as that phone sees it now: an empty next heat (id null) when it has none yet. */
  async function screen(token:string,code:string):Promise<Worked> {
    const {own,race}=await at(token,code);
    if(!own) throw new Error(`${code} is switched off`);
    if(race) return {...race,event:race.group.event};
    const empty={version:0,value:null};
    return {event:own.event,race:{id:null,kind:own.event.format==='timed'?'race':'heat',number:own.nextHeat,state:'in progress',parts:{runners:empty,finish:empty,times:empty}} as unknown as RaceFlowRead['race']};
  }
  /** Marks every step of the event's race done, which saves it once nothing blocks it. */
  async function submit(token:string,code:string) {
    let read=await worked(token,code);
    for(const step of stepsOf(read.race)) if(read.steps[step]?.state!=='done') read=await post<RaceFlowRead>(token,`/api/races/${read.race.id}/steps/${step}/done`,{});
    return read;
  }
  /**
   * A saved race, as one phone doing every step: checks the runners in, places them in that order (the last ones
   * Did not finish when there are fewer times than runners), types the times, then marks every step done.
   */
  async function record(token:string,code:string,runners:number[],places:number[],{keptWarnings=[],keptWrong=[]}:{keptWarnings?:number[];keptWrong?:number[]}={}) {
    await checkIn(token,code,runners,keptWarnings);
    await order(token,code,runners.slice(0,places.length),{didNotFinish:runners.slice(places.length)});
    const race=await times(token,code,places,keptWrong);
    await submit(token,code);
    return race;
  }
  return {screen,checkIn,attend,order,times,submit,record};
}
