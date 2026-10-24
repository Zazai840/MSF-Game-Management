import writeExcelFile,{type SheetData } from 'write-excel-file/node';
import type pg from 'pg';
import { readEvents } from './events.js';
import { readRace,type StoredRace } from '../races/records.js';
import { readAuditNotes,readRulings } from '../rulings/records.js';
import { readCompletedStages } from '../rulings/stages.js';
import { readTieSettlements } from '../rulings/ties.js';
import { eventState } from '../results/read.js';
import { readTeamLists,switchedOn } from '../relays/teams.js';
import { eventResults,type ResultEntry,type ResultTeam,type Section } from '../../shared/results-rules.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import { wristbandWarnings } from '../../shared/wristband-checks.js';
import { entryName,raceLabel,type RaceEntry } from '../../shared/races.js';
/**
 * A medal team as the scoring database takes it: for J, M or P the first child in leg order whose wristband is the
 * relay's own Section (any Beaver number on a Beaver relay), else the 1st leg so the export is never blocked; then
 * the other three in leg order.
 */
function medalTeam(team:ResultTeam,section:Section) {
 const own=Math.max(0,team.wristbands.findIndex(wristband=>wristband!==null && !wristbandWarnings(wristband,section,[],{skipAlreadyRan:true}).length));
 return {scored:team.wristbands[own],teammates:team.wristbands.filter((_,leg)=>leg!==own)};
}
/** One row per child: a relay team's children in leg order with "Team 3" and the leg, else the child with Team and Leg blank. */
const perChild=({wristband,team}:Pick<ResultEntry,'wristband'|'team'>)=>team?team.wristbands.map((child,leg)=>[child,`Team ${team.number}`,leg+1] as const):[[wristband,null,null] as const];
/** A race entry by id, or the stored copy of one no longer on the race's runner list. */
const named=(race:StoredRace,id:string,copy?:RaceEntry)=>{const entry=race.parts.runners.value?.find(runner=>runner.id===id)??copy;return entry&&resultEntry(race,entry);};
/** All reads use the export transaction's day lock, including records omitted by live queues. */
export async function dayWorkbook(client:pg.PoolClient,dayId:string) {
 const events=await readEvents(client,false,dayId),races:StoredRace[]=[];
 const ids=(await client.query('SELECT id FROM races WHERE day_id=$1 ORDER BY checked_in_at,id',[dayId])).rows;
 for(const row of ids) races.push(await readRace(client,dayId,row.id));
 const rulings=await readRulings(client,dayId),notes=await readAuditNotes(client,dayId),stages=await readCompletedStages(client,dayId),ties=await readTieSettlements(client,dayId);
 const relays=switchedOn(await readTeamLists(client,dayId));
 const input:SheetData=[['Event code',null,null,null,null,null,null,null,null,'1st',null,null,'2nd',null,null,'3rd']];
 const finals:SheetData=[['Event code','Event','Section','Final','Seed','Wristband number','Team','Leg','Final position','Attendance / role','Source heat','Heat rank','Original heat wristband','Replaces']];
 const all:SheetData=[['Event code','Event','Section','Race','Wristband number','Team','Leg','Time','Place in race','Event position','Status','Warning','Note']];
 for(const event of events){
  const state=eventState(event,races,rulings,notes.filter(note=>note.eventId===event.id),ties.filter(tie=>tie.eventId===event.id),stages.filter(stage=>stage.eventId===event.id).map(stage=>stage.stage),new Map(),relays);
  const results=eventResults(state),podium=results.inputRunning;
  if(podium?.teams) {
   // J, M and P for the 1st, 2nd and 3rd team; their teammates in U-W, AA-AC and AG-AI.
   const row:Array<string|number|null>=[podium.eventCode,...Array(34).fill(null)];
   podium.teams.forEach((team,index)=>{if(!team) return;const {scored,teammates}=medalTeam(team,event.section);row[9+index*3]=scored;row.splice(20+index*6,3,...teammates);});
   input.push(row);
  }
  else if(podium) input.push([podium.eventCode,null,null,null,null,null,null,null,null,podium.first,null,null,podium.second,null,null,podium.third]);
  for(const row of results.allResults) for(const child of perChild(row)) all.push([event.code,event.name,event.section,raceLabel(row.race),...child,row.time===null?null:{value:row.time/100,format:'0.00'},row.place,row.position,row.statuses.join('; '),row.warning||null,row.note||null]);
  for(const field of results.finalRecords){
   const race=races.find(race=>race.id===field.race.id)!;
   const place=(id:string)=>field.leaderboard.find(row=>row.entryId===id)?.position??null;
   const label=(absent:boolean,kind:string)=>`${race.deleted?'Deleted race; ':''}${absent?'Absent; ':''}${kind}`;
   for(const entry of field.entries){
    const source=races.find(race=>race.id===entry.heatRaceId),heat=source&&named(source,entry.heatEntryId);
    const replaced=field.entries.find(other=>other.finalEntryId===entry.replacesEntryId);
    perChild(named(race,entry.finalEntryId,entry.runner)??{wristband:entry.heatWristband}).forEach((child,leg)=>finals.push([event.code,event.name,event.section,raceLabel(race),entry.seed,...child,entry.absent?null:place(entry.finalEntryId),label(entry.absent,entry.kind==='call-up'?'Call-up':'Qualifier'),source?raceLabel(source):'Heat no longer stored',entry.heatRank,heat?.team?heat.team.wristbands[leg]:entry.heatWristband,replaced?`${replaced.heatWristband??(replaced.runner?entryName(replaced.runner):'')} (seed ${replaced.seed})`:null]));
   }
   for(const addition of field.additionalEntries||[]) for(const child of perChild(resultEntry(race,addition.runner))) finals.push([event.code,event.name,event.section,raceLabel(race),null,...child,addition.absent?null:place(addition.runner.id),label(addition.absent,'Added'),null,null,null,null]);
  }
 }
 const audit:SheetData=[['Event code','Time','Who','Action','Comment'],...notes.slice().reverse().map(note=>[events.find(event=>event.id===note.eventId)?.code??null,note.at,note.actor,note.message,note.comment])];
 return writeExcelFile([
  {sheet:'Input - Running',data:input,widths:Array(35).fill(12)},
  {sheet:'Finals',data:finals,widths:[12,22,20,12,8,18,10,6,15,24,24,12,22,24]},
  {sheet:'All results',data:all,widths:[12,22,20,12,18,10,6,12,15,15,40,55,85]},
  {sheet:'Audit notes',data:audit,widths:[12,28,22,85,65]}
 ].map(({sheet,data,widths})=>({sheet,stickyRowsCount:1,columns:widths.map(width=>({width})),data:data.map((row,index)=>row.map(cell=>typeof cell==='string'?{type:String,value:cell.length>32767?`${cell.slice(0,32700)}… See Audit notes for the full history.`:cell,wrap:true,alignVertical:'top' as const,...(index===0?{fontWeight:'bold' as const}:{})}:cell))}))).toBuffer();
}
