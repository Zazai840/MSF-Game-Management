import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions,Refusal } from '../access/permissions.js';
import { wristbandWarnings } from '../../shared/wristband-checks.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { wristbandRaces } from '../races/warnings.js';
import { readRace,listRaces } from '../races/records.js';
import { raceLabel } from '../../shared/races.js';
import { readEventResults } from '../results/read.js';
import { readRulings,rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
export function runnerRulingRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('POST','/api/lead/races/:raceId/runners/:entryId/mark-warning-checked','Lead',async(request,_reply,phone)=>{
    const {comment}=rulingDetails(request.body,false);
    return rulingChange(pool,phone,async(client,current)=>{
      const {raceId,entryId}=request.params as {raceId:string;entryId:string};
      const race=await readRace(client,current.dayId,raceId);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      const runner=race.parts.runners.value?.find(runner=>runner.id===entryId);
      if(!runner) throw new Refusal(404,'Runner not found in this race');
      const previous=(await readRulings(client,current.dayId)).find(ruling=>ruling.raceId===raceId && ruling.entryId===entryId);
      const warnings=(runner.warnings||[]).filter(warning=>warning.kind!=='already-ran' && !previous?.warningChecks?.some(check=>check.kind===warning.kind && check.message===warning.message));
      if(!warnings.length) throw new Refusal(409,'There is no open eligibility warning to check');
      const checks=[...(previous?.warningChecks||[]),...warnings.map(({kind,message})=>({kind,message}))];
      await client.query('INSERT INTO runner_rulings(race_id,entry_id,warning_checks) VALUES($1,$2,$3) ON CONFLICT(race_id,entry_id) DO UPDATE SET warning_checks=EXCLUDED.warning_checks',[raceId,entryId,JSON.stringify(checks)]);
      await writeAuditNote(client,current,race.event.id,{action:'mark-warning-checked',comment,message:`${current.name} checked the warning for ${runner.wristband} (${raceLabel(race)}): ${warnings.map(warning=>warning.message).join('; ')}${comment?` — ${comment}`:''}`,touches:[{raceId,entryId}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  action('POST','/api/lead/races/:raceId/runners/:entryId/correct-number','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false);
    const refusal=runnerListRefusal([value.wristband]);
    if(refusal) throw new Refusal(400,refusal);
    if(!Number.isSafeInteger(value.expectedWristband) || Number(value.expectedWristband)<0) throw new Refusal(400,'Open the runner before correcting their number');
    if(value.keepWarnings!==undefined && typeof value.keepWarnings!=='boolean') throw new Refusal(400,'Choose Fix number or Keep');
    return rulingChange(pool,phone,async(client,current)=>{
      const {raceId,entryId}=request.params as {raceId:string;entryId:string};
      const race=await readRace(client,current.dayId,raceId);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      const runner=race.parts.runners.value?.find(runner=>runner.id===entryId);
      if(!runner) throw new Refusal(404,'Runner not found in this race');
      if(value.expectedWristband!==runner.wristband) throw new Refusal(409,'Runner number has changed - open actions again');
      if(value.wristband===runner.wristband) throw new Refusal(409,'Enter the corrected wristband number');
      const numbers=race.parts.runners.value!.map(entry=>entry.id===entryId?value.wristband:entry.wristband);
      const duplicate=runnerListRefusal(numbers);if(duplicate) throw new Refusal(400,duplicate);
      const wristband=value.wristband as number;
      const warnings=wristbandWarnings(wristband,race.event.section,await wristbandRaces(client,current.dayId,race.event.id),{currentRaceId:raceId,skipAlreadyRan:race.kind==='final'}).map(warning=>({...warning,kept:value.keepWarnings===true}));
      const runners=race.parts.runners.value!.map(entry=>entry.id===entryId?{...entry,wristband,warnings}:entry);
      await client.query('UPDATE race_parts SET value=$1,version=version+1,saved_at=now(),saved_by=$2 WHERE race_id=$3 AND part=$4',[JSON.stringify(runners),current.id,raceId,'runners']);
      await client.query('INSERT INTO runner_rulings(race_id,entry_id,warning_checks,not_counted) VALUES($1,$2,$3,false) ON CONFLICT(race_id,entry_id) DO UPDATE SET warning_checks=EXCLUDED.warning_checks,not_counted=false',[raceId,entryId,'[]']);
      await writeAuditNote(client,current,race.event.id,{action:'correct-number',comment,message:`${current.name} corrected ${runner.wristband} to ${wristband} (${raceLabel(race)})${comment?`: ${comment}`:''}`,touches:[{raceId,entryId}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  action('POST','/api/lead/races/:raceId/runners/:entryId/count-result','Lead',async(request,_reply,phone)=>{
    const {comment}=rulingDetails(request.body,false);
    return rulingChange(pool,phone,async(client,current)=>{
      const {raceId,entryId}=request.params as {raceId:string;entryId:string};
      const race=await readRace(client,current.dayId,raceId);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      const runner=race.parts.runners.value?.find(runner=>runner.id===entryId);
      if(!runner) throw new Refusal(404,'Runner not found in this race');
      const rulings=await readRulings(client,current.dayId);
      const rulingFor=(raceId:string,entryId:string)=>rulings.find(ruling=>ruling.raceId===raceId && ruling.entryId===entryId);
      if(race.kind==='final' || rulingFor(raceId,entryId)?.disqualification) throw new Refusal(409,'This result cannot be chosen');
      const matches=(await listRaces(client,current.dayId)).filter(other=>other.event.id===race.event.id && other.kind!=='final').flatMap(other=>(other.parts.runners.value||[]).filter(entry=>entry.wristband===runner.wristband && !rulingFor(other.id,entry.id)?.disqualification).map(entry=>({race:other,entry})));
      if(matches.length<2) throw new Refusal(409,'This number has no other result to choose between');
      if(matches.every(match=>!!rulingFor(match.race.id,match.entry.id)?.notCounted===(match.race.id!==raceId || match.entry.id!==entryId))) throw new Refusal(409,'This is already the counted result');
      for(const match of matches) {
        const excluded=match.race.id!==raceId || match.entry.id!==entryId;
        await client.query('INSERT INTO runner_rulings(race_id,entry_id,not_counted) VALUES($1,$2,$3) ON CONFLICT(race_id,entry_id) DO UPDATE SET not_counted=EXCLUDED.not_counted',[match.race.id,match.entry.id,excluded]);
      }
      const others=matches.filter(match=>match.race.id!==raceId || match.entry.id!==entryId).map(match=>raceLabel(match.race));
      await writeAuditNote(client,current,race.event.id,{action:'count-result',comment,message:`${current.name} counted ${runner.wristband} from ${raceLabel(race)}; ${others.join(', ')} not counted${comment?` — ${comment}`:''}`,touches:matches.map(match=>({raceId:match.race.id,entryId:match.entry.id}))});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
}
