import type { Runner,TeamEntry } from './races.js';
import type { RunnerRuling } from './rulings.js';
import type { ResultFlag,WarningKind } from './results-rules.js';
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
 * A relay team's children's kept wristband warnings. A kept "also in another relay's team" is left out: whether a
 * child is in two relays is worked out from the team lists when To check is read, kept or not.
 */
export function teamWarningFlags(entry:TeamEntry,ruling:RunnerRuling|undefined):ResultFlag[] {
  return entry.legs.flatMap(leg=>leg.warnings.filter(warning=>warning.kind!=='other-relay').map(warning=>({kind:'warning' as const,message:warning.message,warningKind:warning.kind,checked:settled(warning,ruling)})));
}
