import type { Level } from './domain.js';
import { raceName } from './race-flow.js';
import type { Stage } from './stages.js';
/** A race as a toast names it: its event's section and Heat N or Final ("Girl Cubs Heat 1"). */
interface ToastRace { section:string; kind:'heat'|'final'|'race'; number:number }
/** An event as a toast names it ("200m Boy Cubs"). */
interface ToastEvent { name:string; section:string }
/** One lead save; `who` is a runner's wristband or a relay team ("Team 3"). */
export type ToastSave=
  |{kind:'corrected';part:'times'|'order'|'runners'|'teams';race:ToastRace}
  |{kind:'re-run'|'restored';race:ToastRace}
  |{kind:'deleted';race:ToastRace;forGood:boolean}
  |{kind:'disqualified';who:string;reason:string}
  |{kind:'counts-again'|'warning-checked'|'addition-checked';who:string}
  |{kind:'number-saved'|'result-counts'|'called-up';who:string;race:ToastRace}
  |{kind:'team-added';team:number;race:ToastRace}
  |{kind:'tie-saved';event:ToastEvent}
  |{kind:'stage-complete'|'reopened';stage:Stage;event:ToastEvent}
  |{kind:'this-day';field:'Year'|'Region'|'Day';value:string}
  |{kind:'lead-code';code:string}
  |{kind:'role';name:string;role:Level}
  |{kind:'removed';name:string}
  |{kind:'renamed';code:string;name:string}
  |{kind:'switched';code:string;on:boolean}
  |{kind:'event-added';code:string}
  |{kind:'event-list-confirmed'}
  |{kind:'downloaded';file:string};
const parts={times:'Times',order:'Finishing order',runners:'Runner list',teams:'Teams'};
const reopened:Record<Stage,string>={final:'Final',heats:'Heats',event:'Event','no-final':'Results'};
const raceLine=(race:ToastRace)=>`${race.section} ${raceName(race)}`,eventLine=(event:ToastEvent)=>`${event.name} ${event.section}`;
/** The one line the toast shows after a lead save (the owner's list in spec #250). */
export function toastLine(save:ToastSave):string {
  switch(save.kind) {
    case 'corrected': return `${parts[save.part]} saved · ${raceLine(save.race)}`;
    case 're-run': return `Re-run made · ${raceLine(save.race)}`;
    case 'deleted': return `${raceName(save.race)} ${save.forGood?'deleted for good':'moved to Deleted races'} · ${save.race.section}`;
    case 'restored': return `${raceName(save.race)} restored · ${save.race.section}`;
    case 'disqualified': return `${save.who} disqualified · ${save.reason}`;
    case 'counts-again': return `${save.who} counts again`;
    case 'warning-checked': return `Warning checked · ${save.who}`;
    case 'addition-checked': return `Addition checked · ${save.who}`;
    case 'number-saved': return `Number saved · ${save.who} in ${raceName(save.race)}`;
    case 'result-counts': return `Result counts · ${save.who} ${raceName(save.race)}`;
    case 'called-up': return `${save.who} called up · ${raceLine(save.race)}`;
    case 'team-added': return `Team ${save.team} added · ${raceLine(save.race)}`;
    case 'tie-saved': return `Tie saved · ${eventLine(save.event)}`;
    // Heats complete makes the final's line-up; every other stage confirms the medals.
    case 'stage-complete': return `${save.stage==='heats'?'Heats complete':'Medals confirmed'} · ${eventLine(save.event)}`;
    case 'reopened': return `${reopened[save.stage]} reopened · ${eventLine(save.event)}`;
    case 'this-day': return `${save.field} saved · ${save.value}`;
    case 'lead-code': return `New lead code · ${save.code}`;
    case 'role': return `${save.name} is a ${save.role==='Lead'?'lead':'volunteer'} now · today only`;
    case 'removed': return `${save.name} removed · signed out`;
    case 'renamed': return `Name saved · ${save.code} ${save.name}`;
    case 'switched': return `${save.code} switched ${save.on?'on':'off'}`;
    case 'event-added': return `Event added · ${save.code}`;
    case 'event-list-confirmed': return 'Event list confirmed';
    case 'downloaded': return `Downloaded · ${save.file}`;
  }
}
