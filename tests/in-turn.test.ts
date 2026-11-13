import { expect,test } from 'vitest';
import { inTurn } from '../src/client/races/in-turn.js';
type Read={revision:number};
/** Saves held until released, each answering the race as given, and the race the screen holds (`screen.revision`). */
function heldSaves(revision:number) {
  const sent:Array<{tap:string;from:number}>=[],releases:Array<(answer:Read|false|'refused')=>void>=[],screen={revision};
  const tap=inTurn((tap:string,from:Read)=>{sent.push({tap,from:from.revision});return new Promise<Read|false|'refused'>(resolve=>releases.push(resolve));},()=>({...screen}));
  return {sent,releases,screen,tap};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('taps made while a save is on its way each save in their turn, from the race as the save before answered',async()=>{
  // The screen holds revision 3 throughout: only the first save may go from it.
  const {sent,releases,tap}=heldSaves(3);
  void tap('one');void tap('two');void tap('three');
  expect(sent).toEqual([{tap:'one',from:3}]);
  releases[0]({revision:4});await tick();
  expect(sent).toEqual([{tap:'one',from:3},{tap:'two',from:4}]);
  releases[1]({revision:5});await tick();
  expect(sent).toEqual([{tap:'one',from:3},{tap:'two',from:4},{tap:'three',from:5}]);
});
test('a tap made after a save answered, on a screen that does not hold the answer yet, saves from the answer',async()=>{
  const {sent,releases,tap}=heldSaves(3);
  void tap('one');releases[0]({revision:4});await tick();
  void tap('two');
  expect(sent[1]).toEqual({tap:'two',from:4});
});
test('a save starts from the screen\'s race when that is newer than the last answer (another phone\'s change)',async()=>{
  const {sent,releases,screen,tap}=heldSaves(3);
  void tap('one');void tap('two');
  screen.revision=9;releases[0]({revision:4});await tick();
  expect(sent[1]).toEqual({tap:'two',from:9});
});
test('a save that fails does not stop the taps waiting behind it',async()=>{
  const {sent,releases,tap}=heldSaves(3);
  void tap('one');void tap('two');void tap('three');
  releases[0]('refused');await tick();
  releases[1](false);await tick();
  expect(sent).toEqual([{tap:'one',from:3},{tap:'two',from:3},{tap:'three',from:3}]);
});
