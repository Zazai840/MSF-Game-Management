import { expect,test } from 'vitest';
import { linkLine,linkNext,linkStart,type Link,type LinkEvent } from '../src/client/live-link.js';
const run=(link:Link,...events:LinkEvent[])=>events.reduce((at,event)=>linkNext(at.link,event),{link,reconnect:null as number|null,drop:false});
const lost:LinkEvent={type:'lost',held:true};
test('a live link starts connecting, or paused while the page is hidden',()=>{
  expect(linkStart(false)).toEqual({state:'connecting',failures:0,note:null,gapped:false});
  expect(linkStart(true).state).toBe('paused');
});
test('a lost link retries after 1 s, doubling up to 30 s, and a newer snapshot starts the count again',()=>{
  let link=linkStart(false);
  const waits=[];
  for(let i=0;i<7;i++) {const next=linkNext(link,lost);link=next.link;waits.push(next.reconnect);expect(link.state).toBe('retrying');}
  expect(waits).toEqual([1000,2000,4000,8000,16000,30000,30000]);
  link=run(link,{type:'retry'},{type:'opened'},{type:'fresh'}).link;
  expect(link).toEqual({state:'live',failures:0,note:null,gapped:false});
  expect(linkNext(link,lost).reconnect).toBe(1000);
});
test('a lost link says so, in words that depend on whether a snapshot is held, until it opens again; silence retries without a word',()=>{
  expect(linkLine(linkNext(linkStart(false),lost).link)).toBe('Connection lost - trying again');
  expect(linkLine(linkNext(linkStart(false),{type:'lost',held:false}).link)).toBe('Could not connect - trying again');
  const silent=linkNext(run(linkStart(false),{type:'opened'}).link,{type:'silent'});
  expect([silent.link.state,silent.reconnect,linkLine(silent.link)]).toEqual(['retrying',1000,'']);
  // The note stays while it connects again, and goes once it has.
  const again=run(linkStart(false),lost,{type:'retry'});
  expect([again.link.state,linkLine(again.link)]).toEqual(['connecting','Connection lost - trying again']);
  expect(linkLine(linkNext(again.link,{type:'opened'}).link)).toBe('');
});
test('a planned end connects again at once and counts as no failure',()=>{
  const ended=run(linkStart(false),{type:'opened'},{type:'ended'});
  expect(ended).toEqual({link:{state:'connecting',failures:0,note:null,gapped:false},reconnect:0,drop:false});
});
test('a refusal stops the link with its reason; one with no line (the phone is already sent to sign in) keeps the note it had',()=>{
  const refused=linkNext(linkStart(false),{type:'refused',line:'A lead deleted Heat 2'});
  expect([refused.link.state,refused.reconnect,linkLine(refused.link)]).toEqual(['refused',null,'A lead deleted Heat 2']);
  const signedOut=run(linkStart(false),lost,{type:'retry'},{type:'refused',line:null});
  expect([signedOut.link.state,linkLine(signedOut.link)]).toEqual(['refused','Connection lost - trying again']);
});
test('a hidden page drops the stream and waits; shown again it connects at once, unless a stream is already open or opening',()=>{
  const hidden=run(linkStart(false),{type:'opened'},{type:'hidden'});
  expect(hidden).toMatchObject({link:{state:'paused'},reconnect:null,drop:true});
  // Whatever happens to the dropped stream changes nothing while paused.
  expect(run(hidden.link,lost,{type:'retry'},{type:'restart'}).link).toEqual(hidden.link);
  expect(linkNext(hidden.link,{type:'shown'})).toMatchObject({link:{state:'connecting'},reconnect:0,drop:false});
  for(const open of [linkStart(false),run(linkStart(false),{type:'opened'}).link]) expect(linkNext(open,{type:'shown'})).toEqual({link:open,reconnect:null,drop:false});
  // A link waiting to retry, or refused, tries at once when the page is shown.
  expect(linkNext(linkNext(linkStart(false),lost).link,{type:'shown'})).toMatchObject({link:{state:'connecting',failures:1},reconnect:0});
  expect(linkNext(linkNext(linkStart(false),{type:'refused',line:'No'}).link,{type:'shown'})).toMatchObject({link:{state:'connecting'},reconnect:0});
});
test('the signal going or coming back drops the stream and starts again at once',()=>{
  expect(run(linkStart(false),{type:'opened'},{type:'restart'})).toMatchObject({link:{state:'connecting'},reconnect:0,drop:true});
});
test('a frame that cannot be applied reconnects at once; another before a changes frame applies backs off as a failure, and the whole list between does not reset it',()=>{
  const gap:LinkEvent={type:'gap'};
  const first=run(linkStart(false),{type:'opened'},{type:'fresh'},gap);
  expect(first).toMatchObject({link:{state:'connecting',failures:0},reconnect:0,drop:true});
  // Each reconnect brings the whole list, then the server sends another frame the phone cannot apply: a server fault, so wait longer each time.
  let link=first.link;const waits=[];
  for(let i=0;i<3;i++) {const next=run(link,{type:'opened'},{type:'fresh'},gap);expect(next).toMatchObject({link:{state:'retrying'},drop:true});waits.push(next.reconnect);link=run(next.link,{type:'retry'}).link;}
  expect(waits).toEqual([1000,2000,4000]);
  expect(linkLine(link)).toBe('');
  // A changes frame applied ends it: the next frame that cannot be applied reconnects at once again.
  expect(run(link,{type:'opened'},{type:'applied'},gap)).toMatchObject({link:{state:'connecting',failures:0},reconnect:0,drop:true});
});
