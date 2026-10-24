import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { keepsSameRaceOrder,tieEntryKey,type TieSettlement } from '../../shared/ties.js';
import { formatTime } from '../../shared/time-entry.js';
import { resultName } from '../../shared/results-rules.js';
import { actions,Refusal } from '../access/permissions.js';
import type { Database } from '../races/records.js';
import { readEventResults } from '../results/read.js';
import { rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
export async function readTieSettlements(db:Database,dayId:string):Promise<Array<TieSettlement & {eventId:string}>> {
  const rows=(await db.query('SELECT s.event_id,s.settlement FROM tie_settlements s JOIN events e ON e.id=s.event_id WHERE e.day_id=$1',[dayId])).rows;
  return rows.map(row=>({...row.settlement,eventId:row.event_id}));
}
export function tieRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('POST','/api/lead/events/:code/settle-tie','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,(request.body as {outcome?:unknown}|null)?.outcome==='decided');
    if(value.outcome!=='no-run-off' && value.outcome!=='run-off' && value.outcome!=='decided') throw new Refusal(400,'Choose how the tie was settled');
    const outcome=value.outcome;
    if(typeof value.tieId!=='string') throw new Refusal(400,'Choose a tie');
    return rulingChange(pool,phone,async(client,current)=>{
      const {code}=request.params as {code:string};
      const detail=await readEventResults(client,current.dayId,code);
      // A tie settled from the Results without a final sheet is judged against medal places, so it keeps that impact.
      const tie=(value.stage==='no-final'?detail.results.noFinalTies:detail.results.ties).find(tie=>tie.id===value.tieId);
      if(!tie) throw new Refusal(409,'This tie has changed or is already settled - refresh the results');
      let order=tie.entries.map(({raceId,entryId})=>({raceId,entryId}));
      if(outcome!=='no-run-off') {
        const submitted=value.order;
        if(!Array.isArray(submitted) || submitted.length!==order.length || submitted.some(entry=>!entry || typeof entry!=='object' || typeof entry.raceId!=='string' || typeof entry.entryId!=='string')) throw new Refusal(400,'Put every tied runner in order');
        const keys=submitted.map(tieEntryKey);
        if(new Set(keys).size!==order.length || keys.some(key=>!order.some(entry=>tieEntryKey(entry)===key))) throw new Refusal(400,'Put every tied runner in order once');
        if(!keepsSameRaceOrder(submitted,tie.entries)) throw new Refusal(400,'Keep runners from the same race in their finishing order');
        order=submitted.map(({raceId,entryId})=>({raceId,entryId}));
      }
      const settlement:TieSettlement={tieId:tie.id,outcome,order,impact:tie.impact};
      await client.query('INSERT INTO tie_settlements(event_id,tie_id,settlement) VALUES($1,$2,$3) ON CONFLICT(event_id,tie_id) DO UPDATE SET settlement=EXCLUDED.settlement',[detail.event.id,tie.id,JSON.stringify(settlement)]);
      const names=order.map(entry=>resultName(tie.entries.find(member=>tieEntryKey(member)===tieEntryKey(entry))!));
      const message=outcome==='no-run-off'?`${current.name} settled the tie at ${formatTime(tie.time)} (${names.join(', ')}): No run-off needed`:
        outcome==='run-off'?`${current.name} recorded a run-off at ${formatTime(tie.time)}: ${names.join(' then ')}`:
        `${current.name} decided the tie at ${formatTime(tie.time)} without a run-off: ${names.join(' then ')}`;
      await writeAuditNote(client,current,detail.event.id,{action:'settle-tie',message:`${message}${comment?` - ${comment}`:''}`,comment,touches:order});
      return {status:'saved',...await readEventResults(client,current.dayId,code)};
    });
  });
}
