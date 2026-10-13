import type { Runner } from './races.js';
import type { RunnerRuling } from './rulings.js';
import type { ResultFlag } from './results-rules.js';
/** Already-ran is settled by correcting, excluding or disqualifying, never Mark checked. */
export function isOpenEligibilityWarning(flag:ResultFlag):boolean {
  return flag.kind==='warning' && flag.warningKind!=='already-ran' && !flag.checked;
}
export function runnerWarningFlags(runner:Runner,ruling:RunnerRuling|undefined,repeated:boolean):ResultFlag[] {
  return (runner.warnings||[]).map(warning=>({kind:'warning',message:warning.message,warningKind:warning.kind,checked:warning.kind==='already-ran'?!repeated:ruling?.disqualification?.reason==='Wrong section or age' || !!ruling?.warningChecks?.some(check=>check.kind===warning.kind && check.message===warning.message)}));
}
