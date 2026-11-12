import type { LeadRaceRead } from '../../shared/lead-results.js';
import { raceRefusal,raceStatus } from '../../shared/race-status.js';
import { raceName } from '../../shared/race-flow.js';
import { Sheet } from '../races/parts.js';
import type { RaceAction,RaceCorrection,View } from '../shell/addresses.js';
/** A race not saved yet, in Race actions and on its race page: where its steps are finished. */
export const notSavedLine=(race:LeadRaceRead['race'],where:'page'|'screen')=>`${raceName(race)} is not saved yet. ${where==='page'?'Open it to finish its steps.':'Finish its steps on this screen first.'}`;
/**
 * Race actions, the one sheet a race page's button with words opens ("Correct or delete Heat 1", `where="page"`): the
 * corrections, Re-run, then a red Delete set apart; on a deleted race Restore and a red Delete for good; on a race not
 * saved yet, where its steps are finished and Delete. Each action opens its own screen under the race page. "⋯" on
 * the Race screen opens the sheet too (`where="screen"`), only ever on a race not saved yet (a saved race is its race
 * page): its Delete opens under the Race screen.
 */
export function RaceActions({read,where,onOpen,onClose,onRace}:{read:LeadRaceRead;where:'page'|'screen';onOpen:(view:View)=>void;onClose:()=>void;onRace?:()=>void}) {
  const {race}=read,name=raceName(race),status=raceStatus(race),allowed=(action:Parameters<typeof raceRefusal>[1])=>raceRefusal(race,action)===null;
  const code=race.event.code;
  const screen=(action:RaceAction)=>onOpen({kind:'race-action',code,raceId:race.id,action});
  const correct=(action:RaceCorrection)=>onOpen({kind:'correction',code,raceId:race.id,action});
  const button=(label:string,onClick:()=>void,kind='')=><button type="button" className={`rz-btn rz-btn--block${kind}`} onClick={onClick}>{label}</button>;
  const remove=(label:string)=>button(label,()=>onOpen({kind:'race-action',...(where==='page'?{code}:{}),raceId:race.id,action:'delete'}),' rz-btn--danger rz-sheet__apart');
  return <Sheet title={`${name} · actions`} onClose={onClose}>
    {status==='in progress' && <p className="rz-sheet__text">{notSavedLine(race,where)}</p>}
    <div className="rz-sheet__actions">
      {!allowed('delete')?<>{allowed('restore') && button(`Restore ${name}`,()=>screen('restore'),' rz-btn--primary')}{remove('Delete for good')}</>
        :!allowed('correct')?<>{where==='page' && onRace && button(`Open ${name}`,onRace)}{remove(`Delete ${name}`)}</>
        :<>
          {race.kind!=='final' && button('Correct times',()=>correct('correct-times'))}
          {race.parts.finish.value && button('Correct finishing order',()=>correct('correct-finishing-order'))}
          {race.event.relay?button('Correct teams',()=>correct('correct-teams')):button('Correct runner list',()=>correct('correct-runner-list'))}
          {button('Re-run race',()=>screen('re-run'))}
          {remove(`Delete ${name}`)}
        </>}
    </div>
  </Sheet>;
}
