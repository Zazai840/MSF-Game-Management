import type { ReactNode } from 'react';
import type { DayEvent } from '../../shared/day.js';
import { plainWristbandWarning } from '../../shared/wristband-checks.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { useWristbandEntry } from '../races/wristband-entry.js';

/**
 * One wristband typed on the phone's number pad, with check-in's warnings: a number already in the race is refused
 * (Fix number only), and any other warning waits for Fix number or Keep. `onSave` sends it; once the server has it the
 * input clears for the next number, and one that could not be sent stays to send again.
 */
export function WristbandEntry({event,raceId,taken,busy,label='Wristband number',onSave,extraAction}:{event:DayEvent;raceId:string|null;
  /** The wristbands already in this race. */
  taken:number[];busy:boolean;label?:string;onSave:(wristband:number,kept:boolean)=>Promise<unknown>;extraAction?:ReactNode}) {
  const entry=useWristbandEntry(event,raceId,taken,onSave),{current,held,refused,pending,error,checking}=entry;
  return <>
    {error && <p role="alert">{error}</p>}
    <NumberEntry inline label={label} placeholder="e.g. 205" value={current} held={held} busy={busy || checking} extraAction={extraAction} onChange={entry.type} onNext={()=>void entry.next()}/>
    {held && <div className="warning-box" role="alert">
      {refused?<p>{refused}</p>:pending.map(warning=><p key={warning.kind}>{plainWristbandWarning(warning,Number(current),event.section)}</p>)}
      <div className="warning-actions"><button onClick={entry.fix}>Fix number</button>{!refused && <button className="button-secondary" disabled={busy} onClick={()=>void entry.keep()}>Keep</button>}</div>
    </div>}
  </>;
}
