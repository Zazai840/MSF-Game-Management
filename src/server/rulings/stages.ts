import { seedFinal } from './finals.js';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import type { CompletedStage } from '../../shared/stage-lock.js';
import { actions,Refusal } from '../access/permissions.js';
import type { Database } from '../races/records.js';
import { readEventResults } from '../results/read.js';
import { rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
export async function readCompletedStages(db:Database,dayId:string):Promise<CompletedStage[]> {
  return (await db.query('SELECT s.event_id AS "eventId",e.code AS "eventCode",s.stage FROM event_stages s JOIN events e ON e.id=s.event_id WHERE e.day_id=$1',[dayId])).rows;
}
export function stageRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  for(const command of ['complete-stage','reopen-stage'] as const) action('POST',`/api/lead/events/:code/${command}`,'Lead',async(request,_reply,phone)=>{
    const reopening=command==='reopen-stage';
    const stage=(request.body as {stage?:unknown}|null)?.stage;
    // Results without a final, like any reopening, needs the lead's reason.
    const {comment}=rulingDetails(request.body,reopening || stage==='no-final');
    if(!['event','heats','final',...(reopening?[]:['no-final'])].includes(String(stage))) throw new Refusal(400,'Choose a stage');
    return rulingChange(pool,phone,async(client,current)=>{
      const detail=await readEventResults(client,current.dayId,(request.params as {code:string}).code);
      const sheet=[detail.results.heatsCheckSheet,detail.results.noFinalCheckSheet,detail.results.checkSheet].find(sheet=>sheet?.stage===stage);
      if(!sheet) throw new Refusal(409,'This stage is not available');
      if(sheet.completed===!reopening) throw new Refusal(409,reopening?'This stage is already open':'This stage is already complete');
      if(!reopening && sheet.mustSettleFirst.length) throw new Refusal(409,'Must settle first - open the completion check sheet');
      if(reopening) await client.query('DELETE FROM event_stages WHERE event_id=$1 AND stage=$2',[detail.event.id,sheet.stage]);
      else await client.query('INSERT INTO event_stages(event_id,stage) VALUES($1,$2)',[detail.event.id,sheet.stage]);
      if(sheet.stage==='heats') await seedFinal(client,current,detail.event,detail.results.qualifiers);
      const touches=[...detail.results.leaderboard,...(detail.results.finalResults?.leaderboard||[])].map(row=>({raceId:row.raceId})).filter((touch,index,all)=>all.findIndex(other=>other.raceId===touch.raceId)===index);
      await writeAuditNote(client,current,detail.event.id,{action:command,message:`${current.name} ${reopening?'reopened':'marked'} ${sheet.label}${comment?` - ${comment}`:''}`,comment,touches});
      return {status:'saved',...await readEventResults(client,current.dayId,detail.event.code)};
    });
  });
}
