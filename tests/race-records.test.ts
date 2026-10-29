import { randomUUID } from 'node:crypto';
import { afterEach,expect,test,vi } from 'vitest';
import type pg from 'pg';
import { openDatabase } from '../src/server/storage.js';
import { createRace } from '../src/server/races/create.js';
import { listRaces,readRace,requireStageOpen } from '../src/server/races/records.js';
let pool:pg.Pool;
afterEach(async()=>{vi.restoreAllMocks();await pool?.end();});

test('a lead\'s write to a finished final is refused in the same words as the race screen\'s',()=>{
  expect(()=>requireStageOpen({stageComplete:true,kind:'final',event:{section:'Girl Cubs'}})).toThrow('Girl Cubs final is finished. Ask a lead to change this race.');
  expect(()=>requireStageOpen({stageComplete:false,kind:'final',event:{section:'Girl Cubs'}})).not.toThrow();
});

test('batched pool and client reads match individual reads, preserve ordering, and isolate days/deleted races',async()=>{
  pool=await openDatabase(process.env.TEST_DATABASE_URL!,true);
  const day=randomUUID(),otherDay=randomUUID(),phone=randomUUID(),otherPhone=randomUUID(),timed=randomUUID(),heats=randomUUID(),otherEvent=randomUUID();
  const ahmed=randomUUID(),aisha=randomUUID();
  await pool.query("INSERT INTO olympics_days(id,lead_code,active) VALUES($1,'LEAD11',true),($2,'LEAD22',false)",[day,otherDay]);
  await pool.query("INSERT INTO profiles(id,name,secret_hash) VALUES($1,'Ahmed','first'),($2,'Aisha','second')",[ahmed,aisha]);
  await pool.query("INSERT INTO sign_ins(id,day_id,profile_id,name,level,token_hash) VALUES($1,$2,$3,'Ahmed','Volunteer','first'),($4,$5,$6,'Aisha','Volunteer','second')",[phone,day,ahmed,otherPhone,otherDay,aisha]);
  await pool.query("INSERT INTO events(id,day_id,code,name,section,format,enabled,programme_order) VALUES($1,$2,'R1','Timed','Girl Cubs','timed',false,1),($3,$2,'R2','Heats','Girl Cubs','heats',true,2),($4,$5,'R1','Other day','Girl Cubs','timed',true,1)",[timed,day,heats,otherEvent,otherDay]);
  const ids=Array.from({length:8},(_,i)=>`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
  const client=await pool.connect();
  try {
    // Insert ties in reverse ID order to test the secondary ordering key.
    for(const i of [1,0,2,3,4,5,6,7]) {
      await createRace(client,[{id:`entry-${i}`,wristband:2001+i}],{id:ids[i],dayId:i===7?otherDay:day,eventId:i===7?otherEvent:i===0||i===6?timed:heats,kind:i>=2&&i<=5?'final':i===1?'heat':'race',savedBy:i===7?otherPhone:phone});
      await client.query('UPDATE races SET checked_in_at=$1,deleted=$2,delete_reason=$3 WHERE id=$4',[new Date(Date.UTC(2026,9,12,10,i<=1?0:i)),i===6,i===6?'lead-delete':null,ids[i]]);
    }
    for(const i of [2,3,4,5]) await client.query("INSERT INTO race_finals(race_id,entries,additional_entries,generation) VALUES($1,$2,$3,$4)",[ids[i],JSON.stringify([{finalEntryId:`entry-${i}`,heatRaceId:ids[1],heatEntryId:'entry-1',heatWristband:2002,seed:i-1,heatRank:i-1,kind:'qualifier',absent:false}]),JSON.stringify([{runner:{id:`extra-${i}`,wristband:2010+i},absent:true}]),`generation-${i}`]);
    await client.query("INSERT INTO event_stages(event_id,stage) VALUES($1,'heats'),($2,'event')",[heats,timed]);
    // A final has run once saved; a finishing order recorded on an unsaved final is not enough.
    await client.query("INSERT INTO race_part_history(race_id,part,version,value,runners) VALUES($1,'finish',1,$2,'[]')",[ids[2],JSON.stringify({order:['entry-2'],didNotFinish:[]})]);
    await client.query("UPDATE races SET state='saved',saved_at=now(),saved_by='Ahmed' WHERE id=ANY($1::uuid[])",[[ids[3],ids[4],ids[5]]]);
    await client.query("UPDATE race_parts SET version=1,value=$1 WHERE race_id=$2 AND part='finish'",[JSON.stringify({order:['entry-4'],didNotFinish:[]}),ids[4]]);
    const expected=[];for(const id of ids.slice(0,6)) expected.push(await readRace(client,day,id));
    expect(expected.slice(2).map(race=>race.final?.hasRun)).toEqual([false,true,true,true]);
    const poolQuery=vi.spyOn(pool,'query');
    expect(await listRaces(pool,day)).toEqual(expected);
    expect(poolQuery).toHaveBeenCalledTimes(3);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const clientQuery=vi.spyOn(client,'query');
    expect(await listRaces(client,day)).toEqual(expected);
    expect(clientQuery).toHaveBeenCalledTimes(3);
    await client.query('COMMIT');
    expect((await listRaces(pool,otherDay)).map(race=>race.id)).toEqual([ids[7]]);
    poolQuery.mockClear();
    expect(await listRaces(pool,randomUUID())).toEqual([]);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  } finally {client.release();}
});
