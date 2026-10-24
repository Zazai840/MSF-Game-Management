import type { FastifyInstance } from 'fastify';
import { isRunner } from '../../src/shared/races.js';
import type { RaceScreenRead } from '../../src/shared/race-screen.js';
/**
 * The one way server tests set races up: on the race screen, as the phone whose token is given, through the same
 * writes a volunteer's taps make. Each write takes over its job first, then sends the whole column at the version
 * it sees, and fails the test unless the server accepts it. Wristbands name the runners.
 */
export function raceSetup(app:FastifyInstance) {
  async function post(token:string,url:string,body:object) {
    const response=await app.inject({method:'POST',url,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},payload:JSON.stringify(body)});
    if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
    return response.json() as RaceScreenRead;
  }
  const write=(token:string,code:string,what:string,body:object)=>post(token,`/api/race-screen/${code}/${what}`,body);
  // Take over: the phone gets the job whoever had it, as a person would who was asked to do it.
  const hold=async(token:string,code:string,job:string)=>(await write(token,code,'take-over',{job})).race;
  const id=(race:RaceScreenRead['race'],wristband:number)=>race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id;
  /** Checks these runners in to the event's current race (the whole list), creating it when it is the empty next race. */
  async function checkIn(token:string,code:string,runners:number[],keptWarnings:number[]=[]) {
    const race=await hold(token,code,'check-in');
    return (await write(token,code,'check-in',{raceId:race.id,version:race.parts.runners.version,runners:runners.map(wristband=>({wristband})),keptWarnings})).race;
  }
  /** Writes the finishing order: every runner in `order`, `didNotFinish` or `didNotRun`; `added` are runners not on the list. */
  async function order(token:string,code:string,placed:number[],{didNotFinish=[],didNotRun=[],added=[],keptWarnings=[]}:{didNotFinish?:number[];didNotRun?:number[];added?:number[];keptWarnings?:number[]}={}) {
    const race=await hold(token,code,'order');
    // A runner added at the finish has no entry until this write makes one, so the server is told it twice: added, then placed.
    const first=added.length?(await write(token,code,'order',{raceId:race.id,version:race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added,keptWarnings})).race:race;
    return (await write(token,code,'order',{raceId:first.id,version:first.parts.finish.version,order:placed.map(wristband=>id(first,wristband)),didNotFinish:didNotFinish.map(wristband=>id(first,wristband)),didNotRun:didNotRun.map(wristband=>id(first,wristband)),added:[]})).race;
  }
  /** Writes the times by place, in hundredths; `keptWrong` are the places (0-based) whose wrong time the timer kept. */
  async function times(token:string,code:string,places:number[],keptWrong:number[]=[]) {
    const race=await hold(token,code,'times');
    return (await write(token,code,'times',{raceId:race.id,version:race.parts.times.version,places,keptWrong})).race;
  }
  /** The event's race screen as that phone sees it now. */
  async function screen(token:string,code:string) {
    const response=await app.inject({url:`/api/race-screen/${code}`,headers:{authorization:`Bearer ${token}`}});
    if(response.statusCode!==200) throw new Error(`${code} answered ${response.statusCode}: ${response.body}`);
    return response.json() as RaceScreenRead;
  }
  /** Presses Submit Race on the event's current race. */
  async function submit(token:string,code:string) {
    return write(token,code,'submit',{raceId:(await screen(token,code)).race.id});
  }
  /**
   * A saved race, as one phone doing every job: checks the runners in, places them in that order (the last ones
   * Did not finish when there are fewer times than runners), types the times, then presses Submit Race.
   */
  async function record(token:string,code:string,runners:number[],places:number[],{keptWarnings=[],keptWrong=[]}:{keptWarnings?:number[];keptWrong?:number[]}={}) {
    await checkIn(token,code,runners,keptWarnings);
    await order(token,code,runners.slice(0,places.length),{didNotFinish:runners.slice(places.length)});
    const race=await times(token,code,places,keptWrong);
    await submit(token,code);
    return race;
  }
  return {screen,checkIn,order,times,submit,record,write};
}
