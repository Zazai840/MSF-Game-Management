import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { disqualificationReasons,type Disqualification } from '../../shared/rulings.js';
import { raceLabel } from '../../shared/races.js';
import { actions,Refusal } from '../access/permissions.js';
import { readRace } from '../races/records.js';
import { readEventResults } from '../results/read.js';
import { rulingDetails } from './validation.js';
import { rulingChange,writeAuditNote } from './records.js';
export function rulingRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  for(const lifting of [false,true]) {
    const command=lifting?'lift-disqualification':'disqualify';
    action('POST',`/api/lead/races/:raceId/runners/:entryId/${command}`,'Lead',async(request,_reply,phone)=>{
      const {value,comment}=rulingDetails(request.body,lifting);
      const reason=disqualificationReasons.find(reason=>reason===value.reason);
      if(!lifting && !reason) throw new Refusal(400,'Choose a disqualification reason');
      return rulingChange(pool,phone,async(client,current)=>{
        const {raceId,entryId}=request.params as {raceId:string;entryId:string};
        const race=await readRace(client,current.dayId,raceId);
        if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
        const runner=race.parts.runners.value?.find(runner=>runner.id===entryId);
        if(!runner) throw new Refusal(404,'Runner not found in this race');
        const previous=(await client.query('SELECT disqualification FROM runner_rulings WHERE race_id=$1 AND entry_id=$2',[race.id,entryId])).rows[0]?.disqualification;
        if(lifting && !previous) throw new Refusal(409,'This runner is not disqualified');
        if(!lifting && previous) throw new Refusal(409,'This runner is already disqualified');
        const disqualification:Disqualification|null=lifting?null:{reason:reason!,comment};
        await client.query('INSERT INTO runner_rulings(race_id,entry_id,disqualification) VALUES($1,$2,$3) ON CONFLICT(race_id,entry_id) DO UPDATE SET disqualification=EXCLUDED.disqualification',[race.id,entryId,disqualification===null?null:JSON.stringify(disqualification)]);
        const message=lifting?`${current.name} lifted the disqualification of ${runner.wristband} (${raceLabel(race)}): ${comment}`:`${current.name} disqualified ${runner.wristband} (${raceLabel(race)}): ${reason}${comment?` - ${comment}`:''}`;
        await writeAuditNote(client,current,race.event.id,{action:command,message,comment,touches:[{raceId:race.id,entryId}]});
        return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
      });
    });
  }
}
