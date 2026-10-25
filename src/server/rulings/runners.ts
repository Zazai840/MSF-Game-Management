import { isOpenEligibilityWarning } from '../../shared/runner-rulings.js';
import { correctPart } from '../races/versions.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions,Refusal } from '../access/permissions.js';
import { wristbandWarnings } from '../../shared/wristband-checks.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { wristbandRaces } from '../races/warnings.js';
import { readRace,listRaces } from '../races/records.js';
import { entryName,isTeamEntry,raceLabel,runnersOf } from '../../shared/races.js';
import { correctTeam } from '../relays/teams.js';
import { readEventResults } from '../results/read.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import { resultHolder,resultName } from '../../shared/results-rules.js';
import { readRulings,reopenEntryChecks,rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
import type { Phone } from '../../shared/domain.js';
import type { CheckedBy } from '../../shared/rulings.js';
/** The lead's name and the check's time are snapshots, kept on the check itself so they never depend on an audit note's wording. */
const checkedBy=(lead:Phone,at:string,note:string|null):CheckedBy=>({name:lead.name,at,...(note?{note}:{})});
export function runnerRulingRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('POST','/api/lead/races/:raceId/runners/:entryId/mark-added-checked','Lead',async(request,_reply,phone)=>{
    const {comment}=rulingDetails(request.body,false);
    return rulingChange(pool,phone,async(client,current)=>{
      const {raceId,entryId}=request.params as {raceId:string;entryId:string};
      const race=await readRace(client,current.dayId,raceId);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      const runner=race.parts.runners.value?.find(runner=>runner.id===entryId);
      if(!runner) throw new Refusal(404,'Runner not found in this race');
      const previous=(await readRulings(client,current.dayId)).find(ruling=>ruling.raceId===raceId && ruling.entryId===entryId);
      if(!runner.addedAtFinish || previous?.addedAtFinishChecked) throw new Refusal(409,'There is no unchecked addition at the finish');
      const at=await writeAuditNote(client,current,race.event.id,{action:'mark-added-checked',comment,message:`${current.name} checked ${entryName(runner)} added at the finish (${raceLabel(race)})${comment?` - ${comment}`:''}`,touches:[{raceId,entryId}]});
      await client.query('INSERT INTO runner_rulings(race_id,entry_id,added_at_finish_checked,added_at_finish_checked_by) VALUES($1,$2,true,$3) ON CONFLICT(race_id,entry_id) DO UPDATE SET added_at_finish_checked=true,added_at_finish_checked_by=EXCLUDED.added_at_finish_checked_by',[raceId,entryId,JSON.stringify(checkedBy(current,at,comment))]);
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  action('POST','/api/lead/races/:raceId/runners/:entryId/mark-warning-checked','Lead',async(request,_reply,phone)=>{
    const {comment}=rulingDetails(request.body,false);
    return rulingChange(pool,phone,async(client,current)=>{
      const {raceId,entryId}=request.params as {raceId:string;entryId:string};
      const race=await readRace(client,current.dayId,raceId);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      const runner=race.parts.runners.value?.find(runner=>runner.id===entryId);
      if(!runner) throw new Refusal(404,'Runner not found in this race');
      const previous=(await readRulings(client,current.dayId)).find(ruling=>ruling.raceId===raceId && ruling.entryId===entryId);
      // The row's open warnings as To check shows them: on a relay these include the ones worked out from the team lists.
      const row=(await readEventResults(client,current.dayId,race.event.code)).results.actionableRunners.find(row=>row.raceId===raceId && row.entryId===entryId);
      const warnings=(row?.flags||[]).filter(isOpenEligibilityWarning).map(flag=>({kind:flag.warningKind!,message:flag.message}));
      if(!warnings.length) throw new Refusal(409,'There is no open eligibility warning to check');
      const at=await writeAuditNote(client,current,race.event.id,{action:'mark-warning-checked',comment,message:`${current.name} checked the warning for ${entryName(runner)} (${raceLabel(race)}): ${warnings.map(warning=>warning.message).join('; ')}${comment?` - ${comment}`:''}`,touches:[{raceId,entryId}]});
      const checks=[...(previous?.warningChecks||[]),...warnings.map(warning=>({...warning,checkedBy:checkedBy(current,at,comment)}))];
      await client.query('INSERT INTO runner_rulings(race_id,entry_id,warning_checks) VALUES($1,$2,$3) ON CONFLICT(race_id,entry_id) DO UPDATE SET warning_checks=EXCLUDED.warning_checks',[raceId,entryId,JSON.stringify(checks)]);
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
      const entry=race.parts.runners.value?.find(runner=>runner.id===entryId);
      if(entry && isTeamEntry(entry)) {
        // A child of a team: the leg given, checked and written as a team write is.
        const leg=value.leg as number;
        if(!Number.isInteger(leg) || leg<0 || leg>3) throw new Refusal(400,'Choose a child in this team');
        const was=entry.legs[leg].wristband,wristband=value.wristband as number;
        if(value.expectedWristband!==was) throw new Refusal(409,'Runner number has changed - open actions again');
        if(wristband===was) throw new Refusal(409,'Enter the corrected wristband number');
        const wristbands=entry.legs.map((old,at)=>at===leg?wristband:old.wristband);
        const corrected=await correctTeam(client,current,race,entry,wristbands,[...wristbands.filter((_,at)=>at!==leg),...(value.keepWarnings===true?[wristband]:[])]);
        const runners=race.parts.runners.value!.map(other=>other.id===entryId?corrected:other);
        await correctPart(client,current,race,'runners',runners,runners);
        await reopenEntryChecks(client,raceId,entryId);
        await writeAuditNote(client,current,race.event.id,{action:'correct-number',comment,message:`${current.name} corrected ${was} to ${wristband} in Team ${entry.team.number} (${raceLabel(race)})${comment?`: ${comment}`:''}`,touches:[{raceId,entryId}]});
        return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
      }
      const runner=entry;
      if(!runner) throw new Refusal(404,'Runner not found in this race');
      if(value.expectedWristband!==runner.wristband) throw new Refusal(409,'Runner number has changed - open actions again');
      if(value.wristband===runner.wristband) throw new Refusal(409,'Enter the corrected wristband number');
      const numbers=runnersOf(race.parts.runners.value).map(entry=>entry.id===entryId?value.wristband:entry.wristband);
      const duplicate=runnerListRefusal(numbers);if(duplicate) throw new Refusal(400,duplicate);
      const wristband=value.wristband as number;
      const warnings=wristbandWarnings(wristband,race.event.section,await wristbandRaces(client,current.dayId,race.event.id),{currentRaceId:raceId,skipAlreadyRan:race.kind==='final'}).map(warning=>({...warning,kept:value.keepWarnings===true}));
      const runners=race.parts.runners.value!.map(entry=>entry.id===entryId?{...entry,wristband,warnings}:entry);
      await correctPart(client,current,race,'runners',runners,runners);
      await reopenEntryChecks(client,raceId,entryId);
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
      // A child's results are matched by wristband, a team's by team.
      const holder=resultHolder(resultEntry(race,runner));
      const rulings=await readRulings(client,current.dayId);
      const rulingFor=(raceId:string,entryId:string)=>rulings.find(ruling=>ruling.raceId===raceId && ruling.entryId===entryId);
      if(race.kind==='final' || rulingFor(raceId,entryId)?.disqualification) throw new Refusal(409,'This result cannot be chosen');
      const matches=(await listRaces(client,current.dayId)).filter(other=>other.event.id===race.event.id && other.kind!=='final').flatMap(other=>(other.parts.runners.value||[]).filter(entry=>resultHolder(resultEntry(other,entry))===holder && !rulingFor(other.id,entry.id)?.disqualification).map(entry=>({race:other,entry})));
      if(matches.length<2) throw new Refusal(409,'This number has no other result to choose between');
      if(matches.every(match=>!!rulingFor(match.race.id,match.entry.id)?.notCounted===(match.race.id!==raceId || match.entry.id!==entryId))) throw new Refusal(409,'This is already the counted result');
      for(const match of matches) {
        const excluded=match.race.id!==raceId || match.entry.id!==entryId;
        await client.query('INSERT INTO runner_rulings(race_id,entry_id,not_counted) VALUES($1,$2,$3) ON CONFLICT(race_id,entry_id) DO UPDATE SET not_counted=EXCLUDED.not_counted',[match.race.id,match.entry.id,excluded]);
      }
      const others=matches.filter(match=>match.race.id!==raceId || match.entry.id!==entryId).map(match=>raceLabel(match.race));
      await writeAuditNote(client,current,race.event.id,{action:'count-result',comment,message:`${current.name} counted ${resultName(resultEntry(race,runner))} from ${raceLabel(race)}; ${others.join(', ')} not counted${comment?` - ${comment}`:''}`,touches:matches.map(match=>({raceId:match.race.id,entryId:match.entry.id}))});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
}
