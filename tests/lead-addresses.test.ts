import { expect,test } from 'vitest';
import { addressOf,parentOf,viewAt } from '../src/client/shell/addresses.js';
import { ApiFailure } from '../src/client/api-failure.js';
import { failureLine } from '../src/client/races/parts.js';

test('each lead screen has its own address, and opening an address opens that screen',()=>{
  const screens:Array<[string,ReturnType<typeof viewAt>]>=[
    ['/',{kind:'races'}],
    ['/races/r-1',{kind:'race',id:'r-1'}],
    ['/results',{kind:'results'}],
    ['/results/R4',{kind:'event',code:'R4'}],
    ['/results/R4/heats',{kind:'event',code:'R4',tab:'heats'}],
    ['/results/R4/final',{kind:'event',code:'R4',tab:'final'}],
    ['/results/R4/races',{kind:'event',code:'R4',tab:'races'}],
    ['/results/R4/notes',{kind:'event',code:'R4',tab:'notes'}],
    ['/results/R4/races/r-1',{kind:'race-page',code:'R4',raceId:'r-1'}],
    ['/results/R4/ties/t-1',{kind:'tie',code:'R4',tieId:'t-1'}],
    ['/results/R4/confirm-the-medals',{kind:'confirm-the-medals',code:'R4'}],
    ['/results/R4/ties/t-1?stage=no-final',{kind:'tie',code:'R4',tieId:'t-1',stage:'no-final'}],
    ['/results/R4/races/r-1/runners/e-2/disqualify',{kind:'runner',code:'R4',raceId:'r-1',entryId:'e-2',screen:'disqualify'}],
    ['/results/R4/races/r-1/runners/e-2/lift-disqualification',{kind:'runner',code:'R4',raceId:'r-1',entryId:'e-2',screen:'lift-disqualification'}],
    ['/results/R4/races/r-1/runners/e-2/correct-number',{kind:'runner',code:'R4',raceId:'r-1',entryId:'e-2',screen:'correct-number'}],
    ['/results/R4/races/r-1/runners/e-2/choose-result',{kind:'runner',code:'R4',raceId:'r-1',entryId:'e-2',screen:'choose-result'}],
    ['/results/R4/races/r-1/re-run',{kind:'race-action',code:'R4',raceId:'r-1',action:'re-run'}],
    ['/results/R4/races/r-1/delete',{kind:'race-action',code:'R4',raceId:'r-1',action:'delete'}],
    ['/results/R4/races/r-1/restore',{kind:'race-action',code:'R4',raceId:'r-1',action:'restore'}],
    ['/races/r-1/re-run',{kind:'race-action',raceId:'r-1',action:'re-run'}],
    ['/races/r-1/delete',{kind:'race-action',raceId:'r-1',action:'delete'}],
    ['/results/R4/races/r-1/correct-times',{kind:'correction',code:'R4',raceId:'r-1',action:'correct-times'}],
    ['/results/R4/races/r-1/correct-finishing-order',{kind:'correction',code:'R4',raceId:'r-1',action:'correct-finishing-order'}],
    ['/races/r-1/correct-times',{kind:'correction',raceId:'r-1',action:'correct-times'}],
    ['/races/r-1/correct-finishing-order',{kind:'correction',raceId:'r-1',action:'correct-finishing-order'}],
    ['/results/R4/races/r-1/correct-runner-list',{kind:'correction',code:'R4',raceId:'r-1',action:'correct-runner-list'}],
    ['/results/R4/races/r-1/correct-teams',{kind:'correction',code:'R4',raceId:'r-1',action:'correct-teams'}],
    ['/races/r-1/correct-runner-list',{kind:'correction',raceId:'r-1',action:'correct-runner-list'}],
    ['/races/r-1/correct-teams',{kind:'correction',raceId:'r-1',action:'correct-teams'}],
    ['/day',{kind:'day'}],
    ['/day/signed-in-today',{kind:'signed-in-today'}],
    ['/day/events',{kind:'events'}],
    ['/day/olympics-password',{kind:'olympics-password'}],
    ['/day/events/R6/rename',{kind:'rename-event',code:'R6'}],
    ['/day/events/new',{kind:'new-event'}]
  ];
  for(const [address,view] of screens) {
    expect(viewAt(address)).toEqual(view);
    expect(addressOf(view)).toBe(address);
  }
});

test('an address the app does not know opens Races',()=>{
  expect(viewAt('/results/R4/medals')).toEqual({kind:'races'});
  expect(viewAt('/results/R4/races/r-1/runners/e-2/promote')).toEqual({kind:'races'});
  expect(viewAt('/nowhere')).toEqual({kind:'races'});
  expect(viewAt('/races/r-1/promote')).toEqual({kind:'races'});
});

test('codes and race ids with spaces or slashes survive the address',()=>{
  const view={kind:'race-page',code:'R 4/b',raceId:'a/b c'} as const;
  expect(viewAt(addressOf(view))).toEqual(view);
  expect(viewAt(addressOf({kind:'rename-event',code:'R 4/b'}))).toEqual({kind:'rename-event',code:'R 4/b'});
  // A tie's id joins its time and its runners' race and entry ids: "1000|r-1:e-1|r-2:e-2".
  const tie={kind:'tie',code:'R4',tieId:'1000|r 1:e/1|r-2:e-2'} as const;
  expect(viewAt(addressOf(tie))).toEqual(tie);
});

test('a screen reached with no history goes up one level',()=>{
  expect(parentOf({kind:'race-page',code:'R4',raceId:'r-1'})).toEqual({kind:'event',code:'R4',tab:'races'});
  expect(parentOf({kind:'runner',code:'R4',raceId:'r-1',entryId:'e-2',screen:'disqualify'})).toEqual({kind:'race-page',code:'R4',raceId:'r-1'});
  expect(parentOf({kind:'event',code:'R4',tab:'final'})).toEqual({kind:'results'});
  expect(parentOf({kind:'tie',code:'R4',tieId:'t-1',stage:'no-final'})).toEqual({kind:'event',code:'R4',tab:'heats'});
  // Confirm the medals goes up to its event, which opens on the tab holding the medal decision.
  expect(parentOf({kind:'confirm-the-medals',code:'R4'})).toEqual({kind:'event',code:'R4'});
  // Re-run, Delete and Restore go up to their race: its race page under Results, else the race screen.
  expect(parentOf({kind:'race-action',code:'R4',raceId:'r-1',action:'delete'})).toEqual({kind:'race-page',code:'R4',raceId:'r-1'});
  expect(parentOf({kind:'race-action',raceId:'r-1',action:'re-run'})).toEqual({kind:'race',id:'r-1'});
  // A correction goes up to its race the same way.
  expect(parentOf({kind:'correction',code:'R4',raceId:'r-1',action:'correct-times'})).toEqual({kind:'race-page',code:'R4',raceId:'r-1'});
  expect(parentOf({kind:'correction',raceId:'r-1',action:'correct-finishing-order'})).toEqual({kind:'race',id:'r-1'});
  expect(parentOf({kind:'results'})).toEqual({kind:'races'});
  expect(parentOf({kind:'day'})).toEqual({kind:'races'});
  expect(parentOf({kind:'signed-in-today'})).toEqual({kind:'day'});
  expect(parentOf({kind:'events'})).toEqual({kind:'day'});
  expect(parentOf({kind:'olympics-password'})).toEqual({kind:'day'});
  expect(parentOf({kind:'rename-event',code:'R6'})).toEqual({kind:'events'});
  expect(parentOf({kind:'new-event'})).toEqual({kind:'events'});
});

test('a failed request says Could not connect, a refused save says Not saved, each with the server\'s reason when it gives one',()=>{
  expect(failureLine(new TypeError('Failed to fetch'),'read')).toBe('Could not connect - try again');
  expect(failureLine(new TypeError('Failed to fetch'),'save')).toBe('Could not connect - try again');
  expect(failureLine(new ApiFailure(409,'Heat 2 was changed by Sam Ali'),'save')).toBe('Not saved - try again. Heat 2 was changed by Sam Ali');
  expect(failureLine(new ApiFailure(403,'Lead access needed'),'read')).toBe('Could not connect - try again. Lead access needed');
  expect(failureLine(new ApiFailure(500,''),'save')).toBe('Not saved - try again');
});
