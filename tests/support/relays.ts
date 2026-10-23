import type { FastifyInstance } from 'fastify';
import type { HomeSnapshot,RaceScreenRead } from '../../src/shared/race-screen.js';
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
  return {screen,team,tick,takeOff,here,post};
}
