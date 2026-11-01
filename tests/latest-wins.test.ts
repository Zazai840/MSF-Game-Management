import { expect,test } from 'vitest';
import { latestWins } from '../src/client/races/latest-wins.js';
/** A write held until released, answering the version after the one it was sent at. */
function heldWrites() {
  const sent:Array<{body:string;version:number}>=[],releases:Array<(answer:{version:number}|false|'refused')=>void>=[];
  const write=(body:string,version:number)=>{sent.push({body,version});return new Promise<{version:number}|false|'refused'>(resolve=>releases.push(resolve));};
  return {sent,releases,write};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('quick sends while a write is on its way go in one next write, the latest winning, and each send hears how the write that carried it went',async()=>{
  const {sent,releases,write}=heldWrites();let idle=0;
  const send=latestWins(write,answer=>answer.version,()=>idle++);
  const first=send('one',3),second=send('two',3),third=send('three',3);
  expect(sent).toEqual([{body:'one',version:3}]);
  releases[0]({version:4});await tick();
  // The next write carries only the latest, at the version the first was answered with.
  expect(sent).toEqual([{body:'one',version:3},{body:'three',version:4}]);
  expect(idle).toBe(0);
  releases[1]({version:5});
  expect(await first).toEqual({version:4});
  expect(await second).toEqual({version:5});
  expect(await third).toEqual({version:5});
  expect(idle).toBe(1);
});
test('a refused write drops what waited behind it, and every send waiting hears the refusal',async()=>{
  const {sent,releases,write}=heldWrites();let idle=0;
  const send=latestWins(write,answer=>answer.version,()=>idle++);
  const first=send('one',1),second=send('two',1);
  releases[0]('refused');
  expect(await first).toBe('refused');
  expect(await second).toBe('refused');
  expect(sent).toHaveLength(1);
  expect(idle).toBe(1);
  // The next send starts afresh.
  const again=send('three',1);releases[1]({version:2});
  expect(await again).toEqual({version:2});
});
test('a send just after the last answer, before the screen holds that answer\'s version, still goes at the answered version',async()=>{
  const {sent,releases,write}=heldWrites();
  const send=latestWins(write,answer=>answer.version,()=>{});
  const first=send('one',1);releases[0]({version:2});await first;
  // The screen still shows version 1: a tap this soon would clash with this phone's own write.
  const second=send('two',1);
  expect(sent).toEqual([{body:'one',version:1},{body:'two',version:2}]);
  releases[1]({version:3});await second;
  // Someone else's newer version, read meanwhile, wins over the last answer.
  void send('three',7);
  expect(sent[2]).toEqual({body:'three',version:7});
});
