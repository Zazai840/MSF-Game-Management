import type { Runner,TeamEntry } from './races.js';
import type { RunnerRuling } from './rulings.js';
import type { EventState,ResultFlag,ResultsRace,WarningKind } from './results-rules.js';
import { listed } from './to-check.js';
/** Already-ran is settled by correcting, excluding or disqualifying, never Mark checked. */
export function isOpenEligibilityWarning(flag:ResultFlag):boolean {
  return flag.kind==='warning' && flag.warningKind!=='already-ran' && !flag.checked;
}
type Settlement=Pick<ResultFlag,'checked'|'checkedBy'|'settledByDisqualification'>;
const byDisqualification:Settlement={checked:true,settledByDisqualification:true};
/** A warning a lead has settled: by Mark checked on that very warning (naming who, when one was recorded), or by disqualifying for wrong section or age. */
function settled(warning:{kind:WarningKind;message:string},ruling:RunnerRuling|undefined):Settlement {
  const check=ruling?.warningChecks?.find(check=>check.kind===warning.kind && check.message===warning.message);
  if(check) return {checked:true,...(check.checkedBy?{checkedBy:check.checkedBy}:{})};
  return ruling?.disqualification?.reason==='Wrong section or age'?byDisqualification:{checked:false};
}
/** A flag as a lead reads it beside a name and in the Day export's Warning column: "Checked by Sam Patel: <message>", "Checked: <message>" with no name recorded, or the message alone. */
export function flagText(flag:ResultFlag):string {
  return flag.checkedBy?`Checked by ${flag.checkedBy.name}: ${flag.message}`:flag.checked?`Checked: ${flag.message}`:flag.message;
}
export function runnerWarningFlags(runner:Runner,ruling:RunnerRuling|undefined,repeated:boolean):ResultFlag[] {
  return (runner.warnings||[]).map(warning=>({kind:'warning',message:warning.message,warningKind:warning.kind,...(warning.kind==='already-ran'?{checked:!repeated}:settled(warning,ruling))}));
}
/**
 * A relay team's warnings in one race: its children's kept wristband warnings, each child also on another relay's
 * team list ("2134 is in Girl Cubs Team 3 and Girl Scouts Team 2.") and whether it ran short in a saved race. A child
 * in two relays is worked out from the team lists, kept or not, so a kept "also in another relay's team" is left out.
 */
export function teamWarningFlags(state:Pick<EventState,'event'|'relays'>,race:Pick<ResultsRace,'saved'>,entry:TeamEntry,ruling:RunnerRuling|undefined):ResultFlag[] {
  const flag=(warning:{kind:WarningKind;message:string}):ResultFlag=>({kind:'warning',message:warning.message,warningKind:warning.kind,...settled(warning,ruling)});
  const kept=entry.legs.flatMap(leg=>leg.warnings.filter(warning=>warning.kind!=='other-relay').map(flag));
  const twoRelays=entry.legs.flatMap(({wristband})=>{
    const others=(state.relays||[]).filter(relay=>relay.code!==state.event.code).flatMap(relay=>relay.teams.filter(team=>team.legs.some(leg=>leg.wristband===wristband)).map(team=>`${relay.section} Team ${team.number}`));
    return wristband!==null && others.length?[flag({kind:'other-relay',message:`${wristband} is in ${listed([`${state.event.section} Team ${entry.team.number}`,...others])}.`})]:[];
  });
  // Settled by Mark checked or by any disqualification. A team added at the finish has its children with a wristband marked here.
  const here=entry.legs.filter(leg=>leg.here).length,ranShort={kind:'ran-short' as const,message:`Team ${entry.team.number} ran with ${here} of 4 children marked here.`};
  const short=race.saved && here<4?[flag(ranShort)].map(item=>item.checked || !ruling?.disqualification?item:{...item,...byDisqualification}):[];
  return [...kept,...twoRelays,...short];
}
