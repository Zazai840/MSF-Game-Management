import type { Level } from './domain.js';
import { raceName,stepLabels,type Step } from './race-flow.js';
import type { Stage } from './stages.js';
/** A race as a toast names it: Heat N or Final ("Heat 1"). */
interface ToastRace { kind:'heat'|'final'|'race'; number:number }
/** One lead save; `who` is a runner's wristband or a relay team ("Team 3"). */
export type ToastSave=
  |{kind:'corrected';part:'times'|'order'|'runners'|'teams'}
  |{kind:'re-run'|'tie-saved'|'stage-complete'|'downloaded'}
  |{kind:'restored';race:ToastRace}
  |{kind:'deleted';race:ToastRace;forGood:boolean}
  |{kind:'disqualified';who:string;reason:string}
  |{kind:'counts-again'|'warning-checked'|'addition-checked'|'number-saved'|'result-counts'|'called-up';who:string}
  |{kind:'team-added';team:number}
  |{kind:'reopened';stage:Stage}
  |{kind:'this-day';field:'Year'|'Region'|'Day';value:string}
  |{kind:'lead-code';code:string}
  |{kind:'role';name:string;role:Level}
  |{kind:'removed';name:string}
  |{kind:'switched';code:string;on:boolean}
  |{kind:'renamed'|'event-added';code:string};
// A correction names a step's part as the step itself is named; the runner list and the teams have their own words.
const parts={times:stepLabels.times,order:stepLabels.positions,runners:'Runner list',teams:'Teams'};
const reopened:Record<Stage,string>={final:'Final',heats:'Heats',event:'Event','no-final':'Results'};
/** The one line the toast shows after a lead save (the owner's short lines in spec #309). */
export function toastLine(save:ToastSave):string {
  switch(save.kind) {
    case 'corrected': return `${parts[save.part]} saved`;
    case 're-run': return 'Re-run made';
    case 'deleted': return `${raceName(save.race)} ${save.forGood?'deleted for good':'moved to Deleted races'}`;
    case 'restored': return `${raceName(save.race)} restored`;
    case 'disqualified': return `${save.who} disqualified · ${save.reason}`;
    case 'counts-again': return `${save.who} counts again`;
    case 'warning-checked': return `Warning checked · ${save.who}`;
    case 'addition-checked': return `Addition checked · ${save.who}`;
    case 'number-saved': return `Number saved · ${save.who}`;
    case 'result-counts': return `Result counts · ${save.who}`;
    case 'called-up': return `${save.who} called up`;
    case 'team-added': return `Team ${save.team} added`;
    case 'tie-saved': return 'Tie saved';
    // "+ Final" on Races completes heats, so every stage completed here confirms the medals.
    case 'stage-complete': return 'Medals confirmed';
    case 'reopened': return `${reopened[save.stage]} reopened`;
    case 'this-day': return `${save.field} saved · ${save.value}`;
    case 'lead-code': return `New lead code · ${save.code}`;
    case 'role': return `${save.name} is a ${save.role==='Lead'?'lead':'volunteer'} now`;
    case 'removed': return `${save.name} removed`;
    case 'renamed': return `Name saved · ${save.code}`;
    case 'switched': return `${save.code} switched ${save.on?'on':'off'}`;
    case 'event-added': return `Event added · ${save.code}`;
    case 'downloaded': return 'Downloaded';
  }
}
/** The toast's line after a race step is marked done ("Times saved"), shown with Undo. */
export const stepSavedLine=(step:Step)=>`${stepLabels[step]} saved`;
/** The toast's warning when someone else changed the saved step since: "Tom Barker changed this", or "Someone ..." when nobody is named. */
export const changedSinceLine=(by:string|null)=>`${by??'Someone'} changed this`;
