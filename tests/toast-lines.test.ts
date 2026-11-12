import { expect,test } from 'vitest';
import { toastLine } from '../src/shared/toast-lines.js';
// The short lines the owner agreed for spec #309 (11 Nov 2026), one per kind of lead save.
const heat1={kind:'heat',number:1} as const,heat4={...heat1,number:4};
test('a correction names what it saved',()=>{
  expect(toastLine({kind:'corrected',part:'times'})).toBe('Times saved');
  expect(toastLine({kind:'corrected',part:'order'})).toBe('Finishing order saved');
  expect(toastLine({kind:'corrected',part:'runners'})).toBe('Runner list saved');
  expect(toastLine({kind:'corrected',part:'teams'})).toBe('Teams saved');
});
test('delete and restore name the race, a re-run does not',()=>{
  expect(toastLine({kind:'re-run'})).toBe('Re-run made');
  expect(toastLine({kind:'deleted',race:heat1,forGood:false})).toBe('Heat 1 moved to Deleted races');
  expect(toastLine({kind:'deleted',race:heat1,forGood:true})).toBe('Heat 1 deleted for good');
  expect(toastLine({kind:'restored',race:heat4})).toBe('Heat 4 restored');
});
test('a runner save names the runner',()=>{
  expect(toastLine({kind:'disqualified',who:'2041',reason:'False start'})).toBe('2041 disqualified · False start');
  expect(toastLine({kind:'counts-again',who:'2041'})).toBe('2041 counts again');
  expect(toastLine({kind:'warning-checked',who:'2041'})).toBe('Warning checked · 2041');
  expect(toastLine({kind:'addition-checked',who:'2041'})).toBe('Addition checked · 2041');
  expect(toastLine({kind:'number-saved',who:'2045'})).toBe('Number saved · 2045');
  expect(toastLine({kind:'result-counts',who:'2041'})).toBe('Result counts · 2041');
});
test('an event save says what happened, without the event',()=>{
  expect(toastLine({kind:'tie-saved'})).toBe('Tie saved');
  expect(toastLine({kind:'stage-complete'})).toBe('Medals confirmed');
  expect(toastLine({kind:'reopened',stage:'final'})).toBe('Final reopened');
  expect(toastLine({kind:'reopened',stage:'heats'})).toBe('Heats reopened');
  expect(toastLine({kind:'reopened',stage:'event'})).toBe('Event reopened');
  expect(toastLine({kind:'reopened',stage:'no-final'})).toBe('Results reopened');
});
test('the final names who joined it',()=>{
  expect(toastLine({kind:'called-up',who:'2045'})).toBe('2045 called up');
  expect(toastLine({kind:'team-added',team:3})).toBe('Team 3 added');
});
test('Day setup saves name what changed',()=>{
  expect(toastLine({kind:'this-day',field:'Year',value:'2027'})).toBe('Year saved · 2027');
  expect(toastLine({kind:'this-day',field:'Region',value:'South'})).toBe('Region saved · South');
  expect(toastLine({kind:'this-day',field:'Day',value:'Day 1'})).toBe('Day saved · Day 1');
  expect(toastLine({kind:'lead-code',code:'7390'})).toBe('New lead code · 7390');
  expect(toastLine({kind:'role',name:'Sam Ali',role:'Lead'})).toBe('Sam Ali is a lead now');
  expect(toastLine({kind:'role',name:'Sam Ali',role:'Volunteer'})).toBe('Sam Ali is a volunteer now');
  expect(toastLine({kind:'removed',name:'Tom Barker'})).toBe('Tom Barker removed');
  expect(toastLine({kind:'renamed',code:'R6'})).toBe('Name saved · R6');
  expect(toastLine({kind:'switched',code:'R6',on:false})).toBe('R6 switched off');
  expect(toastLine({kind:'switched',code:'R6',on:true})).toBe('R6 switched on');
  expect(toastLine({kind:'event-added',code:'R9'})).toBe('Event added · R9');
  expect(toastLine({kind:'downloaded'})).toBe('Downloaded');
});
