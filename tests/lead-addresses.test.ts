import { expect,test } from 'vitest';
import { addressOf,parentOf,viewAt } from '../src/client/shell/addresses.js';
import { ApiFailure } from '../src/client/api-failure.js';
import { failureLine } from '../src/client/races/parts.js';

test('each lead screen has its own address, and opening an address opens that screen',()=>{
  const screens:Array<[string,ReturnType<typeof viewAt>]>=[
    ['/',{kind:'races'}],
    ['/races/r-1',{kind:'race',id:'r-1'}],
    ['/results',{kind:'results'}],
    ['/results/R4/heats',{kind:'event',code:'R4',tab:'heats'}],
    ['/results/R4/final',{kind:'event',code:'R4',tab:'final'}],
    ['/results/R4/races',{kind:'event',code:'R4',tab:'races'}],
    ['/results/R4/notes',{kind:'event',code:'R4',tab:'notes'}],
    ['/results/R4/races/r-1',{kind:'race-page',code:'R4',raceId:'r-1'}],
    ['/day',{kind:'day'}],
    ['/day/signed-in-today',{kind:'signed-in-today'}],
    ['/day/events',{kind:'events'}]
  ];
  for(const [address,view] of screens) {
    expect(viewAt(address)).toEqual(view);
    expect(addressOf(view)).toBe(address);
  }
});

test('an event address without a tab opens Heats, and an address the app does not know opens Races',()=>{
  expect(viewAt('/results/R4')).toEqual({kind:'event',code:'R4',tab:'heats'});
  expect(viewAt('/results/R4/medals')).toEqual({kind:'races'});
  expect(viewAt('/nowhere')).toEqual({kind:'races'});
});

test('codes and race ids with spaces or slashes survive the address',()=>{
  const view={kind:'race-page',code:'R 4/b',raceId:'a/b c'} as const;
  expect(viewAt(addressOf(view))).toEqual(view);
});

test('a screen reached with no history goes up one level',()=>{
  expect(parentOf({kind:'race-page',code:'R4',raceId:'r-1'})).toEqual({kind:'event',code:'R4',tab:'races'});
  expect(parentOf({kind:'event',code:'R4',tab:'final'})).toEqual({kind:'results'});
  expect(parentOf({kind:'results'})).toEqual({kind:'races'});
  expect(parentOf({kind:'day'})).toEqual({kind:'races'});
  expect(parentOf({kind:'signed-in-today'})).toEqual({kind:'day'});
  expect(parentOf({kind:'events'})).toEqual({kind:'day'});
});

test('a failed request says Could not connect, a refused save says Not saved, each with the server\'s reason when it gives one',()=>{
  expect(failureLine(new TypeError('Failed to fetch'),'read')).toBe('Could not connect - try again');
  expect(failureLine(new TypeError('Failed to fetch'),'save')).toBe('Could not connect - try again');
  expect(failureLine(new ApiFailure(409,'Heat 2 was changed by Sam Ali'),'save')).toBe('Not saved - try again. Heat 2 was changed by Sam Ali');
  expect(failureLine(new ApiFailure(403,'Lead access needed'),'read')).toBe('Could not connect - try again. Lead access needed');
  expect(failureLine(new ApiFailure(500,''),'save')).toBe('Not saved - try again');
});
