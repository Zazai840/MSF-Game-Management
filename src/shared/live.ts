/** Splits Server-Sent Events text into its complete frames and the unfinished rest. */
export function splitFrames(buffer:string):{frames:string[];rest:string} {
  const frames=buffer.split('\n\n');
  return {rest:frames.pop()!,frames};
}
/** A frame's data line, or null for a comment such as the heartbeat. The server sends one JSON line per frame. */
export const frameData=(frame:string)=>frame.split('\n').find(line=>line.startsWith('data: '))?.slice(6)??null;
/** A phone keeps the snapshot it holds unless the new one is from the same day revision or later. */
export const newerSnapshot=<T extends {revision:number}>(held:T|null,next:T)=>!held || next.revision>=held.revision;
/** A list of event groups, as the races list is: each group is one event's, keyed by its id. */
interface Grouped { revision:number; groups:{event:{id:string}}[] }
/** A changes frame: the new revision, `from` (the revision this phone was sent last on this stream) and each whole group that differs. */
// `from` alone tells a changes frame from a whole snapshot on every stream (afterFrame): no snapshot may have a `from` field.
export interface Changes<G> { revision:number; from:number; groups:G[] }
// Each list's groups as JSON, made once for every phone it is sent to (the races list is one shared read).
const texts=new WeakMap<Grouped,string[]>();
const groupTexts=(read:Grouped)=>{let held=texts.get(read);if(!held) texts.set(read,held=read.groups.map(group=>JSON.stringify(group)));return held;};
/**
 * After a stream's first frame, what to send for `next` when the phone was sent `sent` last: each whole group that
 * differs (absolute, so one applied twice is harmless), the whole list when an event was switched on or off or moved,
 * or null when nothing changed. A list that differs at the same revision is sent too (ADR 0007).
 */
export function changesFrame<T extends Grouped>(sent:T,next:T):T|Changes<T['groups'][number]>|null {
  if(sent.groups.length!==next.groups.length || sent.groups.some((group,i)=>group.event.id!==next.groups[i].event.id)) return next;
  const before=groupTexts(sent),after=groupTexts(next),groups=next.groups.filter((_,i)=>after[i]!==before[i]);
  return groups.length || next.revision>sent.revision?{revision:next.revision,from:sent.revision,groups}:null;
}
/**
 * The snapshot a phone holds after a frame: a whole one by `newerSnapshot`; a changes frame applied only onto exactly
 * the revision it was made from (a group can change and change back, so a gap is never guessed across). An older or
 * repeated one leaves `held` as it is; one it cannot apply (a missed frame, nothing held, a group it does not hold)
 * answers 'reconnect', and the reconnect starts with the whole list.
 */
export function afterFrame<T extends {revision:number}>(held:T|null,frame:T|Changes<unknown>):T|'reconnect' {
  if(!('from' in frame)) return newerSnapshot(held,frame)?frame:held!;
  if(!held || frame.from!==held.revision) return held && frame.revision<=held.revision?held:'reconnect';
  const list=held as T&Grouped,changed=new Map((frame.groups as Grouped['groups']).map(group=>[group.event.id,group]));
  if([...changed.keys()].some(id=>!list.groups.some(group=>group.event.id===id))) return 'reconnect';
  return {...held,revision:frame.revision,groups:list.groups.map(group=>changed.get(group.event.id)??group)};
}
