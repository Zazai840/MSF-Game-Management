import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import { rulingChange } from '../rulings/records.js';
import { Refusal } from '../access/permissions.js';
import { dayNumbers,regions,sections,thisDayYears } from '../../shared/day.js';
/** Keep each setup change and its export revision in the same transaction. */
export async function changeDay(pool:pg.Pool,phone:Phone,change:(client:pg.PoolClient,dayId:string)=>Promise<unknown>,confirmed=false) {
  return rulingChange(pool,phone,async(client,current)=>{
    await change(client,current.dayId);
    await client.query('UPDATE olympics_days SET events_confirmed=$1 WHERE id=$2',[confirmed,current.dayId]);
    return {saved:true};
  });
}
export function eventName(value:unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new Refusal(400,'Enter an event name (up to 100 characters)');
  return value.trim();
}
export function eventDetails(value:unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Refusal(400,'Enter event details');
  const body = value as Record<string,unknown>;
  if (typeof body.code !== 'string' || !/^[A-Z0-9][A-Z0-9-]{0,11}$/i.test(body.code.trim())) throw new Refusal(400,'Enter an event code (letters, numbers or hyphens, up to 12 characters)');
  const code = body.code.trim().toUpperCase();
  const name = eventName(body.name);
  const section = sections.find(section=>section===body.section);
  if (!section) throw new Refusal(400,'Choose one of the six sections');
  if (body.format!=='heats' && body.format!=='timed') throw new Refusal(400,'Choose heats then final or timed');
  // A relay needs its team lists, so only a new day's seeded relays are relays.
  if (body.type!=='races' && body.type!=='hurdles') throw new Refusal(400,'Choose Races or Hurdles');
  return {code,name,section,format:body.format,type:body.type};
}
/** One This day field from a lead's choice: its column and a value from its list (Year 2026 to next year, Region, Day 1-5). */
export function thisDayChange(value:unknown) {
  const body=value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{};
  const fields=Object.keys(body);
  if (fields.length!==1) throw new Refusal(400,'Choose one of Year, Region or Day');
  const [field]=fields,chosen=body[field];
  if (field==='year') {
    const years=thisDayYears(new Date());
    if (!years.some(year=>year===chosen)) throw new Refusal(400,`Choose a year from 2026 to ${years.at(-1)}`);
    return {column:'year',value:chosen};
  }
  if (field==='region') {
    if (!regions.some(region=>region===chosen)) throw new Refusal(400,'Choose North, South or National');
    return {column:'region',value:chosen};
  }
  if (field==='dayNumber') {
    if (!dayNumbers.some(day=>day===chosen)) throw new Refusal(400,'Choose Day 1 to Day 5');
    return {column:'day_number',value:chosen};
  }
  throw new Refusal(400,'Choose one of Year, Region or Day');
}
