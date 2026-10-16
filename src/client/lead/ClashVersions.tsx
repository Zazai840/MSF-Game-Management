import { useState } from 'react';
import { partLabel,type LeadRaceRead,type PartSave,type RacePartName } from '../../shared/race-clashes.js';
import type { FinishingOrder,Runner } from '../../shared/races.js';
import type { RaceTimes } from '../../shared/time-entry.js';
import { formatTime } from '../../shared/time-entry.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { api } from '../api.js';
import { clockWithSeconds } from '../../shared/clock.js';
function SavedAnswer({save}:{save:PartSave}) {
  if(save.value===null) return <p>Not recorded</p>;
  if(save.part==='runners') return <p>Runners: {(save.value as Runner[]).map(runner=>runner.wristband).join(' · ')}</p>;
  if(save.part==='times') return <ol>{(save.value as RaceTimes).places.map((time,index)=><li key={index}>{time===null?'No finisher':formatTime(time)}</li>)}</ol>;
  const finish=save.value as FinishingOrder;
  const number=(id:string)=>save.runners.find(runner=>runner.id===id)?.wristband??'Unknown runner';
  return <><ol>{finish.order.map(id=><li key={id}>{number(id)}</li>)}</ol>{finish.didNotFinish.map(id=><p key={id}>{number(id)} · Did not finish</p>)}{save.runnersBefore.filter(runner=>!save.runners.some(kept=>kept.id===runner.id)).map(runner=><p key={runner.id}>{runner.wristband} · Didn't run</p>)}<p>Runners kept in this version: {save.runners.map(runner=>`${runner.wristband}${runner.addedAtFinish?' (added at the finish)':''}`).join(' · ')}</p></>;
}
export function ClashVersions({read,onSaved,onChanged}:{read:LeadRaceRead;onSaved:(next:EventResultsRead)=>void;onChanged:()=>Promise<void>}) {
  const [chosen,setChosen]=useState<Partial<Record<RacePartName,string>>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(part:RacePartName) {
    setBusy(true);setError('');
    try {const next=await api<EventResultsRead>(`lead/races/${read.race.id}/clashes/${part}`,{candidateId:chosen[part]});onSaved(next);setChosen({});await onChanged();}
    catch(error) {setError(error instanceof Error?error.message:'Could not connect - try again');}
    finally {setBusy(false);}
  }
  if(!read.clashes.length) return null;
  return <section className="clash-versions"><h3>Two versions - zone lead to check</h3><p>Choose which saved answer stands. The other versions stay in the record.</p>{error && <p role="alert">{error}</p>}
    {read.clashes.map(clash=><fieldset key={clash.part} disabled={busy}><legend>{partLabel(clash.part)}</legend>{clash.candidates.map(candidate=><article className="saved-version" key={candidate.id}>
      <label><input type="radio" name={`version-${clash.part}`} aria-label={`${partLabel(clash.part)} by ${candidate.author||'Not recorded'}`} checked={chosen[clash.part]===candidate.id} onChange={()=>setChosen({...chosen,[clash.part]:candidate.id})}/><strong>{candidate.author||'Not recorded'}</strong></label>
      <p><time dateTime={candidate.at}>{clockWithSeconds(candidate.at)}</time></p><SavedAnswer save={candidate}/>
    </article>)}<button disabled={busy || !clash.candidates.some(candidate=>candidate.id===chosen[clash.part])} onClick={()=>void save(clash.part)}>{busy?'Saving…':`Use chosen ${partLabel(clash.part)} version`}</button></fieldset>)}
  </section>;
}
