import writeExcelFile,{type SheetData } from 'write-excel-file/node';
import type pg from 'pg';
import { readEvents } from './events.js';
import { readRace,type StoredRace } from '../races/records.js';
import { readAuditNotes,readRulings } from '../rulings/records.js';
import { readCompletedStages } from '../rulings/stages.js';
import { readTieSettlements } from '../rulings/ties.js';
import { eventState } from '../results/read.js';
import { eventResults } from '../../shared/results-rules.js';
import { raceLabel } from '../../shared/races.js';
/** All reads use the export transaction's day lock, including records omitted by live queues. */
export async function dayWorkbook(client:pg.PoolClient,dayId:string) {
 const events=await readEvents(client,false,dayId),races:StoredRace[]=[];
 const ids=(await client.query('SELECT id FROM races WHERE day_id=$1 ORDER BY checked_in_at,id',[dayId])).rows;
 for(const row of ids) races.push(await readRace(client,dayId,row.id));
 const rulings=await readRulings(client,dayId),notes=await readAuditNotes(client,dayId),stages=await readCompletedStages(client,dayId),ties=await readTieSettlements(client,dayId);
 const input:SheetData=[['Event code',null,null,null,null,null,null,null,null,'1st',null,null,'2nd',null,null,'3rd']];
 const finals:SheetData=[['Event code','Event','Section','Final','Seed','Wristband number','Final position','Attendance / role','Source heat','Heat rank','Original heat wristband','Replaces']];
 const all:SheetData=[['Event code','Event','Section','Race','Wristband number','Time','Place in race','Event position','Status','Warning','Note']];
 for(const event of events){
  const state=eventState(event,races,rulings,notes.filter(note=>note.eventId===event.id),ties.filter(tie=>tie.eventId===event.id),stages.filter(stage=>stage.eventId===event.id).map(stage=>stage.stage));
  const results=eventResults(state),podium=results.inputRunning;
  if(podium) input.push([podium.eventCode,null,null,null,null,null,null,null,null,podium.first,null,null,podium.second,null,null,podium.third]);
  for(const row of results.allResults) all.push([event.code,event.name,event.section,raceLabel(row.race),row.wristband,row.time===null?null:{value:row.time/100,format:'0.00'},row.place,row.position,row.statuses.join('; '),row.warning||null,row.note||null]);
  for(const field of results.finalRecords){
   const race=races.find(race=>race.id===field.race.id)!;
   const place=(id:string)=>field.leaderboard.find(row=>row.entryId===id)?.position??null;
   const label=(absent:boolean,kind:string)=>`${race.deleted?'Deleted race; ':''}${absent?'Absent; ':''}${kind}`;
   for(const entry of field.entries){
    const current=race.parts.runners.value?.find(runner=>runner.id===entry.finalEntryId)??entry.runner;
    const source=races.find(race=>race.id===entry.heatRaceId);
    const replaced=field.entries.find(other=>other.finalEntryId===entry.replacesEntryId);
    finals.push([event.code,event.name,event.section,raceLabel(race),entry.seed,current?.wristband??entry.heatWristband,entry.absent?null:place(entry.finalEntryId),label(entry.absent,entry.kind==='call-up'?'Call-up':'Qualifier'),source?raceLabel(source):'Heat no longer stored',entry.heatRank,entry.heatWristband,replaced?`${replaced.heatWristband} (seed ${replaced.seed})`:null]);
   }
   for(const addition of field.additionalEntries||[]) finals.push([event.code,event.name,event.section,raceLabel(race),null,addition.runner.wristband,addition.absent?null:place(addition.runner.id),label(addition.absent,'Added'),null,null,null,null]);
  }
 }
 const audit:SheetData=[['Event code','Time','Who','Action','Comment'],...notes.slice().reverse().map(note=>[events.find(event=>event.id===note.eventId)?.code??null,note.at,note.actor,note.message,note.comment])];
 return writeExcelFile([
  {sheet:'Input - Running',data:input,widths:Array(16).fill(12)},
  {sheet:'Finals',data:finals,widths:[12,22,20,12,8,18,15,24,24,12,22,24]},
  {sheet:'All results',data:all,widths:[12,22,20,12,18,12,15,15,40,55,85]},
  {sheet:'Audit notes',data:audit,widths:[12,28,22,85,65]}
 ].map(({sheet,data,widths})=>({sheet,stickyRowsCount:1,columns:widths.map(width=>({width})),data:data.map((row,index)=>row.map(cell=>typeof cell==='string'?{type:String,value:cell.length>32767?`${cell.slice(0,32700)}… See Audit notes for the full history.`:cell,wrap:true,alignVertical:'top' as const,...(index===0?{fontWeight:'bold' as const}:{})}:cell))}))).toBuffer();
}
