import type { FastifyInstance } from 'fastify';
import type { HomeSnapshot,RaceScreenRead } from '../../src/shared/race-screen.js';
import type { RaceFlowRead,RacesRead } from '../../src/shared/race-flow.js';
/**
 * The one way server tests set relays up: as the phone whose token is given, through the same writes a volunteer's
 * taps make. Teams are named by their number; each helper fails the test unless the server accepts the write.
 */
export function relaySetup(app:FastifyInstance) {
  async function post<T>(token:string,url:string,body:object) {
    const response=await app.inject({method:'POST',url,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},payload:JSON.stringify(body)});
    if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
    return response.json() as T;
  }
  /** The relay's race screen as that phone sees it now. */
  async function screen(token:string,code:string) {
    const response=await app.inject({url:`/api/race-screen/${code}`,headers:{authorization:`Bearer ${token}`}});
    if(response.statusCode!==200) throw new Error(`${code} answered ${response.statusCode}: ${response.body}`);
    return response.json() as RaceScreenRead;
  }
  /** Adds a team to the relay's team list, as the Teams screen's Done does (taking the teams hold), keeping every warning. */
  async function team(token:string,code:string,legs:Array<number|null>) {
    await post<HomeSnapshot>(token,`/api/teams/${code}/take-over`,{});
    return post<HomeSnapshot>(token,`/api/teams/${code}/done`,{legs,keptWarnings:legs.filter(leg=>leg!==null)});
  }
  /** A check-in tap on the race the phone sees now: `what` is tick, take-off or here. */
  async function tap(token:string,code:string,what:'tick'|'take-off'|'here',number:number,body:object={}) {
    const seen=await screen(token,code),teamId=seen.teams!.find(item=>item.number===number)!.id;
    return post<RaceScreenRead>(token,`/api/race-screen/${code}/${what}`,{raceId:seen.race.id,teamId,...body});
  }
  /** Ticks Team `number` into the relay's current heat. */
  const tick=(token:string,code:string,number:number)=>tap(token,code,'tick',number);
  /** Takes Team `number` off the relay's current heat. */
  const takeOff=(token:string,code:string,number:number)=>tap(token,code,'take-off',number);
  /** Marks the child on leg `leg` (0 for the 1st) of Team `number` here, or not here. */
  const here=(token:string,code:string,number:number,leg:number,isHere=true)=>tap(token,code,'here',number,{leg,here:isHere});
  /**
   * Saves the relay's current heat as one phone doing the order and the times: the teams placed in the order given
   * (by number), each timed in hundredths, then Submit Race.
   */
  async function save(token:string,code:string,placed:number[],times:number[]) {
    const race=(await post<RaceScreenRead>(token,`/api/race-screen/${code}/take-over`,{job:'order'})).race;
    const id=(number:number)=>race.parts.runners.value!.find(entry=>'team' in entry && entry.team.number===number)!.id;
    await post(token,`/api/race-screen/${code}/order`,{raceId:race.id,version:race.parts.finish.version,order:placed.map(id),didNotFinish:[],didNotRun:[],added:[]});
    const timed=(await post<RaceScreenRead>(token,`/api/race-screen/${code}/take-over`,{job:'times'})).race;
    await post(token,`/api/race-screen/${code}/times`,{raceId:timed.id,version:timed.parts.times.version,places:times,keptWrong:[]});
    return post<RaceScreenRead>(token,`/api/race-screen/${code}/submit`,{raceId:race.id});
  }
  return {screen,team,tick,takeOff,here,save,post};
}
/**
 * Relays in the race flow, as the phone whose token is given: the Start line taps, step writes and done marks a
 * volunteer's taps make, on the race the relay is at (its final once it has one, else its latest race not saved, else
 * a new next heat). Teams are typed on the team list with `team`, and named by their number.
 */
export function relayFlowSetup(app:FastifyInstance) {
  const {post,team}=relaySetup(app);
  async function get<T>(token:string,url:string) {
    const response=await app.inject({url,headers:{authorization:`Bearer ${token}`}});
    if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
    return response.json() as T;
  }
  const group=async(token:string,code:string)=>(await get<RacesRead>(token,'/api/races')).groups.find(item=>item.event.code===code)!;
  /** The race the relay is at, or null when it has none to work. */
  async function race(token:string,code:string) {
    const own=await group(token,code),at=own.races.find(item=>item.kind==='final') ?? own.races.filter(item=>item.state!=='saved').at(-1);
    return at?get<RaceFlowRead>(token,`/api/races/${at.id}`):null;
  }
  /** The race the relay is at, making its next heat when it has none. */
  async function worked(token:string,code:string) {
    return await race(token,code) ?? post<RaceFlowRead>(token,'/api/races',{eventCode:code,kind:'heat',number:(await group(token,code)).nextHeat});
  }
  /** The relay's team list, as any of its races' reads carries it. */
  async function teams(token:string,code:string) {
    const any=(await group(token,code)).races[0];
    if(!any) throw new Error(`${code} has no race yet`);
    return (await get<RaceFlowRead>(token,`/api/races/${any.id}`)).teams!;
  }
  /** A Start line tap on Team `number`: tick, take-off or here. */
  async function tap(token:string,code:string,what:'tick'|'take-off'|'here',number:number,body:object={}) {
    const read=await worked(token,code),teamId=read.teams!.find(item=>item.number===number)!.id;
    return post<RaceFlowRead>(token,`/api/races/${read.race.id}/teams/${teamId}/${what}`,body);
  }
  const tick=(token:string,code:string,number:number)=>tap(token,code,'tick',number);
  const takeOff=(token:string,code:string,number:number)=>tap(token,code,'take-off',number);
  /** Marks the child on leg `leg` (0 for the 1st) of Team `number` here, or not here. */
  const here=(token:string,code:string,number:number,leg:number,isHere=true)=>tap(token,code,'here',number,{leg,here:isHere});
  /** A final's Here / Absent: every seeded team Here but the `absent` ones (by number). */
  async function attend(token:string,code:string,absent:number[]=[]) {
    const read=await worked(token,code),entries=read.race.final!.entries;
    const marked=(isAbsent:boolean)=>entries.filter(entry=>absent.includes(entry.team!.number)===isAbsent).map(entry=>entry.finalEntryId);
    return post<RaceFlowRead>(token,`/api/races/${read.race.id}/absent`,{raceId:read.race.id,version:read.race.parts.runners.version,here:marked(false),absent:marked(true)});
  }
  /**
   * Saves the relay's race as one phone doing every step: That's everyone, the teams placed in the order given (by
   * number), on a heat each timed in hundredths by place, each step marked done. Answers the saved race.
   */
  async function save(token:string,code:string,placed:number[],times:number[]=[]) {
    let read=await worked(token,code);
    const raceId=read.race.id,url=(what:string)=>`/api/races/${raceId}/${what}`;
    const id=(number:number)=>read.race.parts.runners.value!.find(entry=>'team' in entry && entry.team.number===number)!.id;
    read=await post<RaceFlowRead>(token,url('steps/runners/done'),{});
    read=await post<RaceFlowRead>(token,url('order'),{raceId,version:read.race.parts.finish.version,order:placed.map(id),didNotFinish:[],didNotRun:[],added:[]});
    read=await post<RaceFlowRead>(token,url('steps/positions/done'),{});
    if(read.race.kind!=='final') {
      read=await post<RaceFlowRead>(token,url('times'),{raceId,version:read.race.parts.times.version,places:times,keptWrong:[]});
      read=await post<RaceFlowRead>(token,url('steps/times/done'),{});
    }
    if(read.race.state!=='saved') throw new Error(`${code} ${read.race.kind} ${read.race.number} did not save`);
    return read;
  }
  return {team,race,worked,teams,tick,takeOff,here,attend,save,post};
}
