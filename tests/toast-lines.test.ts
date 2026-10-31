import { expect,test } from 'vitest';
import { toastLine } from '../src/shared/toast-lines.js';
// The lines the owner accepted for spec #250 (31 Oct 2026), one per kind of lead save.
const heat1={section:'Girl Cubs',kind:'heat',number:1} as const,heat2={...heat1,number:2},heat4={...heat1,number:4};
const final={section:'Girl Cubs',kind:'final',number:0} as const;
const event={name:'200m',section:'Boy Cubs'} as const;
test('a correction names what it saved and the race',()=>{
  expect(toastLine({kind:'corrected',part:'times',race:heat1})).toBe('Times saved · Girl Cubs Heat 1');
  expect(toastLine({kind:'corrected',part:'order',race:heat1})).toBe('Finishing order saved · Girl Cubs Heat 1');
  expect(toastLine({kind:'corrected',part:'runners',race:heat1})).toBe('Runner list saved · Girl Cubs Heat 1');
  expect(toastLine({kind:'corrected',part:'teams',race:final})).toBe('Teams saved · Girl Cubs Final');
});
test('re-run, delete and restore name the race',()=>{
  expect(toastLine({kind:'re-run',race:heat2})).toBe('Re-run made · Girl Cubs Heat 2');
  expect(toastLine({kind:'deleted',race:heat1,forGood:false})).toBe('Heat 1 moved to Deleted races · Girl Cubs');
  expect(toastLine({kind:'deleted',race:heat1,forGood:true})).toBe('Heat 1 deleted for good · Girl Cubs');
  expect(toastLine({kind:'restored',race:heat4})).toBe('Heat 4 restored · Girl Cubs');
});
test('a runner save names the runner',()=>{
  expect(toastLine({kind:'disqualified',who:'2041',reason:'False start'})).toBe('2041 disqualified · False start');
  expect(toastLine({kind:'counts-again',who:'2041'})).toBe('2041 counts again');
  expect(toastLine({kind:'warning-checked',who:'2041'})).toBe('Warning checked · 2041');
  expect(toastLine({kind:'addition-checked',who:'2041'})).toBe('Addition checked · 2041');
  expect(toastLine({kind:'number-saved',who:'2045',race:heat1})).toBe('Number saved · 2045 in Heat 1');
  expect(toastLine({kind:'result-counts',who:'2041',race:heat2})).toBe('Result counts · 2041 Heat 2');
});
test('an event save names the event',()=>{
  expect(toastLine({kind:'tie-saved',event})).toBe('Tie saved · 200m Boy Cubs');
  expect(toastLine({kind:'stage-complete',stage:'final',event})).toBe('Medals confirmed · 200m Boy Cubs');
  // Results without a final confirms the medals too.
  expect(toastLine({kind:'stage-complete',stage:'no-final',event})).toBe('Medals confirmed · 200m Boy Cubs');
  expect(toastLine({kind:'stage-complete',stage:'event',event})).toBe('Medals confirmed · 200m Boy Cubs');
  expect(toastLine({kind:'reopened',stage:'final',event})).toBe('Final reopened · 200m Boy Cubs');
  expect(toastLine({kind:'reopened',stage:'heats',event})).toBe('Heats reopened · 200m Boy Cubs');
  expect(toastLine({kind:'reopened',stage:'event',event})).toBe('Event reopened · 200m Boy Cubs');
  expect(toastLine({kind:'reopened',stage:'no-final',event})).toBe('Results reopened · 200m Boy Cubs');
});
test('the final names who joined it',()=>{
  expect(toastLine({kind:'called-up',who:'2045',race:final})).toBe('2045 called up · Girl Cubs Final');
  expect(toastLine({kind:'team-added',team:3,race:final})).toBe('Team 3 added · Girl Cubs Final');
});
test('Day setup saves name what changed',()=>{
  expect(toastLine({kind:'this-day',field:'Year',value:'2027'})).toBe('Year saved · 2027');
  expect(toastLine({kind:'this-day',field:'Region',value:'South'})).toBe('Region saved · South');
  expect(toastLine({kind:'this-day',field:'Day',value:'Day 1'})).toBe('Day saved · Day 1');
  expect(toastLine({kind:'lead-code',code:'7390'})).toBe('New lead code · 7390');
  expect(toastLine({kind:'role',name:'Sam Ali',role:'Lead'})).toBe('Sam Ali is a lead now · today only');
  expect(toastLine({kind:'role',name:'Sam Ali',role:'Volunteer'})).toBe('Sam Ali is a volunteer now · today only');
  expect(toastLine({kind:'removed',name:'Tom Barker'})).toBe('Tom Barker removed · signed out');
  expect(toastLine({kind:'renamed',code:'R6',name:'60m sprint'})).toBe('Name saved · R6 60m sprint');
  expect(toastLine({kind:'switched',code:'R6',on:false})).toBe('R6 switched off');
  expect(toastLine({kind:'switched',code:'R6',on:true})).toBe('R6 switched on');
  expect(toastLine({kind:'event-added',code:'R9'})).toBe('Event added · R9');
  expect(toastLine({kind:'downloaded',file:'msf-running-south-day-1-2026-11-07.xlsx'})).toBe('Downloaded · msf-running-south-day-1-2026-11-07.xlsx');
});
test('saves today\'s screens have that the spec list leaves out',()=>{
  expect(toastLine({kind:'event-list-confirmed'})).toBe('Event list confirmed');
  expect(toastLine({kind:'stage-complete',stage:'heats',event})).toBe('Heats complete · 200m Boy Cubs');
});
