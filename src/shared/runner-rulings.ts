import type { Runner,TeamEntry } from './races.js';
import type { RunnerRuling } from './rulings.js';
import type { ResultFlag,ResultsRace,ResultWarning } from './results-rules.js';
import { clock } from './clock.js';
/** Already-ran is settled by correcting, excluding or disqualifying, never Mark checked. */
export function isOpenEligibilityWarning(flag:ResultFlag):boolean {
  return flag.kind==='warning' && flag.warningKind!=='already-ran' && !flag.checked;
}
type Settlement=Pick<ResultFlag,'checked'|'checkedBy'|'settledByDisqualification'>;
const byDisqualification:Settlement={checked:true,settledByDisqualification:true};
/** A warning a lead has settled: by Mark checked on that very warning (naming who, when one was recorded), or by disqualifying for wrong section or age. */
function settled(warning:ResultWarning,ruling:RunnerRuling|undefined):Settlement {
  const check=ruling?.warningChecks?.find(check=>check.kind===warning.kind && check.message===warning.message);
  if(check) return {checked:true,...(check.checkedBy?{checkedBy:check.checkedBy}:{})};
  return ruling?.disqualification?.reason==='Wrong section or age'?byDisqualification:{checked:false};
}
/** Who settled a flag, in a lead's words: "Checked by Sam Patel", "Checked" with no name recorded, or nothing while open. */
const checker=(flag:ResultFlag)=>flag.checkedBy?`Checked by ${flag.checkedBy.name}`:flag.checked?'Checked':null;
/** A result's flags a lead reads as warnings, on its race page row and in the Day export's Warning column: all but a settled tie, which is a status. */
export const warningFlags=(flags:readonly ResultFlag[])=>flags.filter(flag=>flag.kind!=='tie-settled');
/** A flag as a lead reads it beside a name and in the Day export's Warning column: "Checked by Sam Patel: <message>", "Checked: <message>" with no name recorded, or the message alone. */
export function flagText(flag:ResultFlag):string {
  const by=checker(flag);
  return by?`${by}: ${flag.message}`:flag.message;
}
/**
 * How a flag was settled, as its line in a result's Notes says it: "Checked by Sam Patel · 10:42 - <note>", "Checked",
 * "Settled by disqualification" or "Not checked yet". An already-ran warning is never Mark checked: it reads
 * "Not settled yet: choose which result counts" until "Settled: only one result counts".
 */
export function signOffText(flag:ResultFlag):string {
  if(flag.settledByDisqualification) return 'Settled by disqualification';
  if(flag.warningKind==='already-ran') return flag.checked?'Settled: only one result counts':'Not settled yet: choose which result counts';
  const by=checker(flag),{checkedBy}=flag;
  return !by?'Not checked yet':checkedBy?`${by} · ${clock(checkedBy.at)}${checkedBy.note?` - ${checkedBy.note}`:''}`:by;
}
export function runnerWarningFlags(runner:Runner,ruling:RunnerRuling|undefined,repeated:boolean):ResultFlag[] {
  return (runner.warnings||[]).map(warning=>({kind:'warning',message:warning.message,warningKind:warning.kind,...(warning.kind==='already-ran'?{checked:!repeated}:settled(warning,ruling))}));
}
/** A relay team's warnings in one race: its children's kept wristband warnings and whether it ran short in a saved race. */
export function teamWarningFlags(race:Pick<ResultsRace,'saved'>,entry:TeamEntry,ruling:RunnerRuling|undefined):ResultFlag[] {
  const flag=(warning:ResultWarning):ResultFlag=>({kind:'warning',message:warning.message,warningKind:warning.kind,...settled(warning,ruling)});
  const kept=entry.legs.flatMap(leg=>leg.warnings.map(flag));
  // Settled by Mark checked or by any disqualification. A team added at the finish has its children with a wristband marked here.
  const here=entry.legs.filter(leg=>leg.here).length,ranShort={kind:'ran-short' as const,message:`Team ${entry.team.number} ran with ${here} of 4 children marked here.`};
  const short=race.saved && here<4?[flag(ranShort)].map(item=>item.checked || !ruling?.disqualification?item:{...item,...byDisqualification}):[];
  return [...kept,...short];
}
