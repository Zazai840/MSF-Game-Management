import type { LeaderboardRow,ResultEntry,ResultTie } from './results-rules.js';
export type TieOutcome='no-run-off'|'run-off'|'decided';
export interface TieSettlement { tieId:string; outcome:TieOutcome; order:Array<Pick<ResultEntry,'raceId'|'entryId'>>; impact:string }
export const tieEntryKey=(entry:Pick<ResultEntry,'raceId'|'entryId'>)=>`${entry.raceId}:${entry.entryId}`;
/** Cross-race rulings leave equal finishers from one race in their torso order. */
export function keepsSameRaceOrder(order:readonly Pick<ResultEntry,'raceId'|'entryId'>[],original:readonly Pick<ResultEntry,'raceId'|'entryId'>[]):boolean {
  const positions=new Map(order.map((entry,index)=>[tieEntryKey(entry),index]));
  const last=new Map<string,number>();
  return original.every(entry=>{
    const position=positions.get(tieEntryKey(entry));
    if(position===undefined || position<=(last.get(entry.raceId)??-1)) return false;
    last.set(entry.raceId,position);return true;
  });
}
/** A whole equal-time group needs attention if any member reaches the highlighted band. */
export function eventTies(rows:LeaderboardRow[],highlightCount:number,format:'heats'|'timed',settlements:readonly TieSettlement[]=[]):ResultTie[] {
  const groups=new Map<number,LeaderboardRow[]>();
  for(const row of rows) {const group=groups.get(row.time!)||[];group.push(row);groups.set(row.time!,group);}
  return [...groups].flatMap(([time,group])=>{
    if(new Set(group.map(row=>row.raceId)).size<2) return [];
    const first=rows.indexOf(group[0]);
    const id=`${time}|${group.map(tieEntryKey).sort().join('|')}`;
    const places=group.map((_row,index)=>first+index+1);
    const qualifying=places.filter(place=>place<=6).length;
    const medals=places.filter(place=>place<=3);
    const impact=format==='heats'?(qualifying>0 && qualifying<group.length?`qualifiers:${qualifying}`:'none'):(medals.length?`medals:${medals.join(',')}`:'none');
    const settlement=settlements.find(settlement=>settlement.tieId===id);
    const reconsider=settlement?.outcome==='no-run-off' && impact!=='none' && settlement.impact!==impact;
    if(settlement && !reconsider && settlement.order.length===group.length && keepsSameRaceOrder(settlement.order,group) && new Set(settlement.order.map(tieEntryKey)).size===group.length && settlement.order.every(entry=>group.some(row=>tieEntryKey(row)===tieEntryKey(entry)))) {
      if(settlement.outcome!=='no-run-off') {
        const ordered=settlement.order.map(entry=>group.find(row=>tieEntryKey(row)===tieEntryKey(entry))!);
        rows.splice(first,group.length,...ordered);
      }
      for(const row of group) row.flags.push({kind:'tie-settled',message:'Tie settled'});
      return [];
    }
    if(first>=highlightCount) return [];
    for(const row of group) row.flags.push({kind:'tie',message:'TIE'});
    return [{id,time,impact,entries:group.map(({raceId,entryId,wristband})=>({raceId,entryId,wristband}))}];
  });
}
