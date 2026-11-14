import { expect,test } from 'vitest';
import { afterFrame,changesFrame,newerSnapshot } from '../src/shared/live.js';
/** A small races list: each group is one event, with a value standing in for its races. */
interface List { revision:number; groups:{event:{id:string};value:number}[] }
const list=(revision:number,values:Record<string,number>):List=>({revision,groups:Object.entries(values).map(([id,value])=>({event:{id},value}))});
const r1=list(1,{a:0,b:0,c:0}),r2=list(2,{a:1,b:0,c:0}),r3=list(3,{a:1,b:0,c:2}),r4=list(4,{a:0,b:0,c:2});
const frame=(sent:List,next:List)=>changesFrame(sent,next)!;

test('the server sends only each whole group that changed, from the revision this phone was sent last',()=>{
  expect(frame(r1,r2)).toEqual({revision:2,from:1,groups:[{event:{id:'a'},value:1}]});
  expect(frame(r1,r3)).toEqual({revision:3,from:1,groups:[r3.groups[0],r3.groups[2]]});
  // A raised revision with nothing changed still moves the phone on; nothing new at the same revision sends nothing.
  expect(frame(r1,list(5,{a:0,b:0,c:0}))).toEqual({revision:5,from:1,groups:[]});
  expect(changesFrame(r1,list(1,{a:0,b:0,c:0}))).toBeNull();
  // A list that differs at the same revision is sent too, as today's snapshot is (ADR 0007).
  expect(frame(r1,list(1,{a:0,b:7,c:0}))).toEqual({revision:1,from:1,groups:[{event:{id:'b'},value:7}]});
});
test('an event switched on or off, or moved, sends the whole list',()=>{
  for(const next of [list(2,{a:0,b:0}),list(2,{a:0,b:0,c:0,d:0}),list(2,{b:0,a:0,c:0})]) expect(changesFrame(r1,next)).toBe(next);
});
test('in order, the phone holds exactly the server\'s list',()=>{
  let held:List=r1;
  for(const [sent,next] of [[r1,r2],[r2,r3],[r3,r4]]) held=afterFrame(held,frame(sent,next)) as List;
  expect(held).toEqual(r4);
  // A whole list is kept as today: the same revision or newer.
  expect(afterFrame(r2,r3)).toBe(r3);
  expect(afterFrame(r2,list(2,{a:1,b:9,c:0}))).toEqual(list(2,{a:1,b:9,c:0}));
  expect(afterFrame(null,r1)).toBe(r1);
  // The same frame twice is harmless: each group is the whole of it, not an edit.
  const once=afterFrame(r1,frame(r1,r2));
  expect(afterFrame(once as List,frame(r1,r2))).toBe(once);
});
test('a missed frame asks for a reconnect and leaves the list as it was',()=>{
  expect(afterFrame(r2,frame(r3,r4))).toBe('reconnect');
  expect(r2).toEqual(list(2,{a:1,b:0,c:0}));
  // The group that went back to how it was (a: 0, then 1, then 0) is exactly why a gap cannot be guessed across.
  expect(afterFrame(r1,frame(r2,r4))).toBe('reconnect');
});
test('an older or repeated frame is ignored, never applied over a newer list',()=>{
  expect(afterFrame(r3,frame(r1,r2))).toBe(r3);
  expect(afterFrame(r3,frame(r2,r3))).toBe(r3);
  expect(afterFrame(r3,r2)).toBe(r3);
  expect(newerSnapshot(r3,r2)).toBe(false);
});
test('a frame onto a list the phone got elsewhere (a newer write answer) is never guessed: it reconnects or waits',()=>{
  // r2 came from elsewhere; the stream still builds from r1: applying r1 -> r4 onto r2 would leave a: 1 where the server has 0.
  expect(afterFrame(r2,frame(r1,r4))).toBe('reconnect');
  expect(afterFrame(r3,frame(r1,r2))).toBe(r3);
});
test('a changes frame with nothing held, or naming a group the phone does not hold, asks for a reconnect',()=>{
  expect(afterFrame(null,frame(r1,r2))).toBe('reconnect');
  expect(afterFrame(r1,{revision:2,from:1,groups:[{event:{id:'z'},value:1}]})).toBe('reconnect');
});

/** A seeded random number generator (mulberry32), so a failure replays exactly. */
function random(seed:number) {
  return ()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}
test('over random days with lost, repeated and reordered frames and write answers, a phone never holds a wrong list',()=>{
  // How often each path ran over all the days, so a change to the model cannot quietly stop testing one.
  let applied=0,reconnects=0;
  for(let seed=1;seed<=400;seed++) {
    const next=random(seed),pick=<T>(items:T[])=>items[Math.floor(next()*items.length)];
    // The server: its list now and at every revision; values 0-2 so a group often goes back to how it was.
    const ids=['a','b','c','d','e'];
    let server=list(1,{a:0,b:0,c:0});
    const at=new Map<number,List>([[1,server]]);
    // The stream: what it was sent last, and its frames on their way (any may be lost, repeated or overtaken).
    const flight:object[]=[server];
    let sent=server,held:List|null=null;
    const connect=()=>{reconnects++;held=null;sent=server;flight.push(server);};
    for(let step=0;step<120;step++) {
      const roll=next();
      if(roll<0.35) {
        const groups=server.groups.map(group=>({...group}));
        if(next()<0.1) {
          // An event switched on or off.
          const off=pick(groups);
          if(groups.length>1 && next()<0.5) groups.splice(groups.indexOf(off),1);
          else {const on=ids.find(id=>!groups.some(group=>group.event.id===id));if(on) groups.push({event:{id:on},value:0});}
        } else for(const group of groups) if(next()<0.4) group.value=Math.floor(next()*3);
        server={revision:server.revision+1,groups};at.set(server.revision,server);
      } else if(roll<0.5) {
        // The stream reads: changes made since its last read go out in one frame, as several changes during a read do.
        const frame=changesFrame(sent,server);
        if(frame) {sent=server;flight.push(frame);}
      } else if(roll<0.85 && flight.length) {
        const index=Math.floor(next()*flight.length),frame=flight[index];
        // Lost, repeated (kept to arrive again) or delivered, in any order.
        const fate=next();
        if(fate>=0.15) flight.splice(index,1);
        if(fate<0.1) continue;
        const after:List|'reconnect'=afterFrame(held,frame as List);
        if(after==='reconnect') {
          expect(held===null || at.has((held as List).revision)).toBe(true);
          connect();
          // The reconnect's first frame is the whole list now.
          held=afterFrame(held,flight.pop() as List) as List;
          expect(held).toEqual(server);
        } else {if(after!==held && 'from' in frame) applied++;held=after;}
      } else if(held) {
        // A write's answer: the whole list at some revision, maybe already overtaken.
        held=afterFrame(held,at.get(Math.max(1,server.revision-Math.floor(next()*3)))!) as List;
      }
      if(held) expect(held,`seed ${seed}, step ${step}`).toEqual(at.get(held.revision));
    }
  }
  expect(applied).toBeGreaterThan(800);
  expect(reconnects).toBeGreaterThan(500);
});
