import type { FastifyInstance } from 'fastify';
import type { RaceFlowRead,RacesRead } from '../../src/shared/race-flow.js';
/**
 * The one way server tests set relays up, as the phone whose token is given: the Start line taps, step writes and done marks a
 * volunteer's taps make, on the race the relay is at (its final once it has one, else its latest race not saved, else
 * a new next heat). Teams are typed on the team list with `team`, as the teams sheet's Save does, and named by their number.
 * Each helper fails the test unless the server accepts the write.
 */
export function relayFlowSetup(app:FastifyInstance) {
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
  /** Adds a team to the relay's team list, as the teams sheet's New team does, keeping every warning. */
  const team=async(token:string,code:string,legs:Array<number|null>)=>
    post<RacesRead>(token,`/api/relays/${(await group(token,code)).event.id}/teams`,{legs,keptWarnings:legs.filter(leg=>leg!==null)});
  /** The relay's team list, as the races list carries it. */
  const teams=async(token:string,code:string)=>(await group(token,code)).teams!;
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
