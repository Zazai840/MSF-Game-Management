import type { DayEvent } from './day.js';
import { ordinal } from './ordinal.js';
import { entryName,raceLabel,type FinishingOrder,type RaceEntry,type RaceRead } from './races.js';
import { wrongTimes } from './wrong-times.js';
import { stillToRun,teamCount,type RelayTeam } from './teams.js';
/** An event's current race: its latest race not yet saved or deleted, or else the next one, not stored until its first check-in (id null, empty parts). */
export type CurrentRace=Pick<RaceRead,'kind'|'number'|'state'|'parts'|'final'> & {id:string|null};
/** The three jobs on a race (the glossary's Job). A final has no times. */
export const jobs=['check-in','order','times'] as const;
export type Job=typeof jobs[number];
/** How a job reads in a sentence: "Ali took over check-in", "Take over the times". */
export const jobWords:Record<Job,string>={'check-in':'check-in',order:'the order',times:'the times'};
/** Who holds a job: a signed-in phone (its sign-in id) and its name. */
export interface Holder { id:string; name:string }
/**
 * One snapshot of a race screen, versioned by the day revision. Holds belong to the event, so they carry over to its
 * next race. `asked` are the holders who must press Submit Race (each job's holder, once the job has entries on this
 * race), `pressed` those who have, and `lastSaved` the event's most recently saved race, who saved it and when. A relay
 * also carries its team list, each team with the races holding it, so its check-in needs no other read.
 */
export interface RaceScreenRead { revision:number; event:DayEvent; race:CurrentRace; stageComplete:boolean; holds:Partial<Record<Job,Holder>>;
  asked:Holder[]; pressed:Holder[]; lastSaved:(Pick<RaceRead,'kind'|'number'> & {by:string;at:string})|null; teams?:RelayTeam[] }
/**
 * A switched-on event as Home lists it: what its tile's status line is made of. `started` is the order or times
 * having entries, `waitingOn` the names of those asked to press Submit Race who have not, and `done` its stage complete.
 * A relay also carries its team list and who holds its teams job, which the Teams screen reads.
 */
export interface HomeEvent { code:string; name:string; section:DayEvent['section']; relay:boolean; race:Pick<CurrentRace,'id'|'kind'|'number'|'state'>;
  holds:RaceScreenRead['holds']; started:boolean; waitingOn:string[]; done:boolean; teams?:RelayTeam[]; teamsHolder?:Holder|null }
/** One snapshot of Home, versioned by the day revision: the day's switched-on events in programme order. */
export interface HomeSnapshot { revision:number; events:HomeEvent[] }
/** "Heat 2", "Race 3", or just "Final": an event has one final. */
export const currentRaceLabel=(race:Pick<RaceRead,'kind'|'number'>)=>race.kind==='final'?'Final':raceLabel(race);
/**
 * A tile's status line: "Heat 2", "Heat 2 · Checking in · Sam", "Heat 2 · Order and times · Priya, Jo", "Heat 2 · Waiting on 2 to submit · Sam, Jo" ("Heat 2 · Ready to save" with nobody left to wait on) or "Done".
 * A relay reads "No teams yet", then "Heat 1 · 5 teams to run" (still to run) until a team is ticked, then "Heat 1 · Checking in · 2 teams".
 */
export function homeStatus({relay,race,holds,started,waitingOn,done,teams=[]}:HomeEvent) {
  const final=race.kind==='final',line=(...parts:string[])=>[currentRaceLabel(race),...parts.filter(Boolean)].join(' · ');
  if(done) return 'Done';
  if(relay && !teams.length && race.id===null) return 'No teams yet';
  const holders=[...new Map(jobs.flatMap(job=>holds[job]?[[holds[job].id,holds[job].name] as const]:[])).values()].join(', ');
  if(race.state==='submitted') return waitingOn.length?line(`Waiting on ${waitingOn.length} to submit`,waitingOn.join(', ')):line('Ready to save');
  if(started || holds.order || holds.times) return line(final?'Finishing order':'Order and times',holders);
  if(holds['check-in']) return line(final?'Checking who is here':'Checking in',holders);
  if(relay) {
    const ticked=teams.filter(team=>team.races.some(held=>held.id===race.id)).length;
    return ticked?line('Checking in',teamCount(ticked)):line(`${teamCount(teams.filter(stillToRun).length)} to run`);
  }
  return line();
}
/**
 * Why Submit Race cannot be pressed yet, or null: nobody checked in (on a final, everyone Absent), a runner with no
 * place (nor Did not finish), a placed wristband with no time, a time at a place with no wristband (left when a runner
 * came off the order), or a wrong time neither kept nor retyped. Kept wristband warnings never block it. The phone shows it under the button; the server refuses a press with it.
 */
export function submitBlocker(race:Pick<CurrentRace,'kind'|'parts'>):string|null {
  const runners=race.parts.runners.value||[],finish=race.parts.finish.value;
  if(!runners.length) return race.kind==='final'?'Everyone is marked Absent':'Nobody is checked in yet';
  const unplaced=runners.filter(runner=>!finish?.order.includes(runner.id) && !finish?.didNotFinish.includes(runner.id));
  if(unplaced.length) return unplaced.length===1?`${entryName(unplaced[0])} has no place yet`:`${unplaced.length} runners have no place yet`;
  if(race.kind==='final') return null;
  const times=race.parts.times.value,places=times?.places||[];
  const untimed=finish!.order.findIndex((_,index)=>places[index]==null);
  if(untimed>=0) return `Place ${untimed+1} has no time`;
  // Finishers and times disagree only after a lead's correction, never on a saved race.
  const surplus=places.findIndex((time,index)=>index>=finish!.order.length && time!=null);
  if(surplus>=0) return `${ordinal(surplus+1)} place has a time but no wristband`;
  const wrong=wrongTimes(places).find(item=>!times!.keptWrong?.includes(item.index));
  return wrong?`${ordinal(wrong.index+1)} place's time needs Fix time or Keep`:null;
}
/** Those asked to press Submit Race who have not pressed yet. */
export const waitingOn=(asked:readonly Holder[],pressed:readonly Pick<Holder,'id'>[])=>asked.filter(holder=>!pressed.some(other=>other.id===holder.id));
/** A finishing order keeping only the race's runners: anyone taken off drops out, and later places move up. */
export function onlyRunners(finish:FinishingOrder,runners:readonly RaceEntry[]):FinishingOrder {
  const on=(id:string)=>runners.some(runner=>runner.id===id);
  return {order:finish.order.filter(on),didNotFinish:finish.didNotFinish.filter(on)};
}
/** "Sam", "Sam and Jo", "Sam, Priya and Jo". */
export const andList=(names:readonly string[])=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
