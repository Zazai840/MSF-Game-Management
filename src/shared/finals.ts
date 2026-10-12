import { runnerWarningFlags } from './runner-rulings.js';
import type { FinishingOrder,Runner } from './races.js';
import type { EventState,LeaderboardRow,ResultsRace } from './results-rules.js';
/** Immutable heat provenance. An absent qualifier remains here when a replacement is called up. */
export interface FinalEntry { finalEntryId:string; heatRaceId:string; heatEntryId:string; heatWristband:number; seed:number; heatRank:number; kind:'qualifier'|'call-up'; absent:boolean; runner?:Runner; replacesEntryId?:string }
export interface FinalAddition { runner:Runner; absent:boolean }
export interface FinalField { generation:string; entries:FinalEntry[]; additionalEntries?:FinalAddition[]; presenceConfirmed:boolean; hasRun:boolean; heatsComplete:boolean }
export interface FinalPresence { generation:string; presenceConfirmed:boolean;hasRun:boolean;heatsComplete:boolean;entries:Array<{finalEntryId:string;wristband:number;seed:number|null;absent:boolean}> }
export interface FinalResults extends FinalField { raceId:string; runners:readonly Runner[]; leaderboard:LeaderboardRow[]; nextCallUp:LeaderboardRow|null; vacancy:FinalEntry|null }
export function finalRows(state:EventState,race:ResultsRace):LeaderboardRow[] {
  if(race.clash || !race.finish || !race.final?.presenceConfirmed) return [];
  const finish:FinishingOrder=race.finish;
  const rows=race.runners.map((runner:Runner):LeaderboardRow=>{
    const index=finish.order.indexOf(runner.id),ruling=state.rulings?.find(item=>item.raceId===race.id && item.entryId===runner.id);
    const disqualification=ruling?.disqualification??null,notCounted=ruling?.notCounted??false;
    return {raceId:race.id,entryId:runner.id,wristband:runner.wristband,race:{id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt},position:null,place:index<0?null:index+1,time:null,status:disqualification?'Disqualified':notCounted?'Not counted':index<0?'Did not finish':'Finished',disqualification,notCounted,hasNote:!!state.auditNotes?.some(note=>note.touches.some(touch=>touch.raceId===race.id && (!touch.entryId||touch.entryId===runner.id))),highlighted:false,qualification:null,medalPlace:null,flags:[...runnerWarningFlags(runner,ruling,false),...(runner.addedAtFinish?[{kind:'added-at-finish' as const,message:'Added at the finish',...(ruling?.addedAtFinishChecked?{checked:true}:{})}]:[])]};
  });
  const eligible=rows.filter(row=>row.status==='Finished').sort((a,b)=>a.place!-b.place!);
  for(const [index,row] of eligible.entries()) {row.position=index+1;row.highlighted=index<3;if(index<3) row.medalPlace=(index+1) as 1|2|3;}
  return [...eligible,...rows.filter(row=>row.status!=='Finished')];
}
export function finalResults(state:EventState,heats:readonly LeaderboardRow[]):FinalResults|null {
  const race=state.races.find(race=>race.kind==='final'&&!race.deleted);
  if(!race?.final) return null;
  const used=new Set(race.final.entries.map(entry=>`${entry.heatRaceId}:${entry.heatEntryId}`));
  const active=race.final.entries.filter(entry=>!entry.absent);
  const vacancy=race.runners.length>=6?null:race.final.entries.find(entry=>entry.absent && !active.some(other=>other.seed===entry.seed))??null;
  const nextCallUp=heats.find(row=>row.position!==null && !used.has(`${row.raceId}:${row.entryId}`) && !race.runners.some(runner=>runner.wristband===row.wristband))??null;
  return {...race.final,raceId:race.id,runners:race.runners,leaderboard:finalRows(state,race),nextCallUp,vacancy};
}
