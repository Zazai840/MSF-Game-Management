import { raceFinishedLine,raceName } from './race-flow.js';
import { inProgressLine,type RaceRead } from './races.js';
/**
 * A race's lifecycle. It is in progress until it saves itself (every step done and nothing blocking), then saved. A
 * lead's Delete moves either to Deleted races, and Restore brings it back as it was; a re-run replaces a saved race
 * for good. Deleting for good removes the race altogether, so it has no state.
 */
export const raceStatuses=['in progress','saved','deleted','replaced'] as const;
export type RaceStatus=typeof raceStatuses[number];
type Stored=Pick<RaceRead,'state'|'deleted'> & {deleteReason?:string|null};
export const raceStatus=(race:Stored):RaceStatus=>race.deleted?(race.deleteReason==='re-run'?'replaced':'deleted'):race.state;
/**
 * What can be done to a race: a volunteer opens it, writes a step (or marks it done) and undoes their own done mark; a
 * lead rules on one of its entries, corrects it, re-runs it, deletes it (to Deleted races, or for good) and restores it.
 */
export const raceActions=['open','step','undo','rule','correct','re-run','delete','restore','delete for good'] as const;
export type RaceAction=typeof raceActions[number];
type Named=Pick<RaceRead,'kind'|'number'>;
const lines={
  deleted:(race:Named)=>`A lead deleted ${raceName(race)}`,
  saved:(race:Named)=>`${raceName(race)} is saved - ask a lead to change it`,
  inDeleted:()=>'This race is in Deleted races',
  alreadyDeleted:()=>'This race is already in Deleted races',
  inEvent:()=>'This race is already in the event',
  replaced:()=>'This race was replaced by a re-run and cannot be restored'
};
/** The one table: each action, and the states that refuse it with their words. A state not named allows the action. */
const refusals:Record<RaceAction,Partial<Record<RaceStatus,(race:Named)=>string>>>={
  open:{deleted:lines.deleted,replaced:lines.deleted},
  step:{saved:lines.saved,deleted:lines.deleted,replaced:lines.deleted},
  undo:{deleted:lines.deleted,replaced:lines.deleted},
  rule:{deleted:lines.inDeleted,replaced:lines.inDeleted},
  correct:{'in progress':inProgressLine,deleted:lines.inDeleted,replaced:lines.inDeleted},
  're-run':{'in progress':inProgressLine,deleted:lines.inDeleted,replaced:lines.inDeleted},
  delete:{deleted:lines.alreadyDeleted,replaced:lines.alreadyDeleted},
  restore:{'in progress':lines.inEvent,saved:lines.inEvent,replaced:lines.replaced},
  'delete for good':{}
};
/**
 * Why an action is refused on a race as it stands, or null when it may go ahead: the one rule the server's routes
 * refuse by and the screens offer their buttons by. A complete stage also closes a race in the event to its steps and
 * their undo; a lead's actions are not held by it.
 */
export function raceRefusal(race:Stored & Named & Pick<RaceRead,'stageComplete'> & {event:Pick<RaceRead['event'],'section'>},action:RaceAction):string|null {
  if((action==='step' || action==='undo') && !race.deleted && race.stageComplete) return raceFinishedLine(race);
  return refusals[action][raceStatus(race)]?.(race)??null;
}
