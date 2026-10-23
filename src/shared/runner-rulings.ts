import type { Runner,TeamEntry } from './races.js';
import type { RunnerRuling } from './rulings.js';
import type { EventState,ResultFlag,ResultsRace,WarningKind } from './results-rules.js';
import { listed } from './to-check.js';
/** Already-ran is settled by correcting, excluding or disqualifying, never Mark checked. */
export function isOpenEligibilityWarning(flag:ResultFlag):boolean {
  return flag.kind==='warning' && flag.warningKind!=='already-ran' && !flag.checked;
}
/** A warning a lead has settled: by Mark checked on that very warning, or by disqualifying for wrong section or age. */
const settled=(warning:{kind:WarningKind;message:string},ruling:RunnerRuling|undefined)=>ruling?.disqualification?.reason==='Wrong section or age' || !!ruling?.warningChecks?.some(check=>check.kind===warning.kind && check.message===warning.message);
export function runnerWarningFlags(runner:Runner,ruling:RunnerRuling|undefined,repeated:boolean):ResultFlag[] {
  return (runner.warnings||[]).map(warning=>({kind:'warning',message:warning.message,warningKind:warning.kind,checked:warning.kind==='already-ran'?!repeated:settled(warning,ruling)}));
}
/**
 * A relay team's warnings in one race: its children's kept wristband warnings, each child also on another relay's
 * team list ("2134 is in Girl Cubs Team 3 and Girl Scouts Team 2.") and whether it ran short in a saved race. A child
 * in two relays is worked out from the team lists, kept or not, so a kept "also in another relay's team" is left out.
 */
export function teamWarningFlags(state:Pick<EventState,'event'|'relays'>,race:Pick<ResultsRace,'saved'>,entry:TeamEntry,ruling:RunnerRuling|undefined):ResultFlag[] {
  const flag=(warning:{kind:WarningKind;message:string}):ResultFlag=>({kind:'warning',message:warning.message,warningKind:warning.kind,checked:settled(warning,ruling)});
  const kept=entry.legs.flatMap(leg=>leg.warnings.filter(warning=>warning.kind!=='other-relay').map(flag));
  const twoRelays=entry.legs.flatMap(({wristband})=>{
    const others=(state.relays||[]).filter(relay=>relay.code!==state.event.code).flatMap(relay=>relay.teams.filter(team=>team.legs.some(leg=>leg.wristband===wristband)).map(team=>`${relay.section} Team ${team.number}`));
    return wristband!==null && others.length?[flag({kind:'other-relay',message:`${wristband} is in ${listed([`${state.event.section} Team ${entry.team.number}`,...others])}.`})]:[];
  });
  // A team that ran with fewer than four children marked here (one added at the finish was never checked in), settled by Mark checked or any disqualification.
  const here=entry.legs.filter(leg=>leg.here).length,ranShort={kind:'ran-short' as const,message:`Team ${entry.team.number} ran with ${here} of 4 children marked here.`};
  const short=race.saved && !entry.addedAtFinish && here<4?[{...flag(ranShort),checked:!!ruling?.disqualification || settled(ranShort,ruling)}]:[];
  return [...kept,...twoRelays,...short];
}
