import { expect,test } from 'vitest';
import { ApiFailure,StaleRequest,failureLine } from '../src/shared/request-failure.js';

const refused=(status:number,message:string)=>new ApiFailure(status,message,{message});

test('a request that never reached the app says Could not connect, whatever it was',()=>{
  for(const action of ['read','save'] as const) {
    expect(failureLine(new TypeError('Failed to fetch'),action)).toBe('Could not connect - try again');
    // The host's own page (no reason from the app), and the host's 502-504 while the app is down.
    expect(failureLine(new ApiFailure(413,'Could not connect - please try again'),action)).toBe('Could not connect - try again');
    expect(failureLine(refused(503,'The server is busy'),action)).toBe('Could not connect - try again');
  }
});

test('a refused save says Not saved - try again, then the server\'s reason; a 500 gives no reason worth showing',()=>{
  expect(failureLine(refused(409,'Heat 2 was changed by Sam Ali'),'save')).toBe('Not saved - try again. Heat 2 was changed by Sam Ali');
  expect(failureLine(refused(400,'2041 is already in this race'),'save')).toBe('Not saved - try again. 2041 is already in this race');
  expect(failureLine(refused(500,'Something went wrong - please try again'),'save')).toBe('Not saved - try again');
});

test('any other refusal says the server\'s reason, which already says what to do',()=>{
  expect(failureLine(refused(403,'Wrong lead code - ask a zone lead'),'read')).toBe('Wrong lead code - ask a zone lead');
  expect(failureLine(refused(409,'Set the Region and Day under This day first'),'read')).toBe('Set the Region and Day under This day first');
  expect(failureLine(refused(500,'Something went wrong - please try again'),'read')).toBe('Could not connect - try again');
});

test('a request from a phone whose session changed asks for a refresh',()=>{
  expect(failureLine(new StaleRequest(),'save')).toBe('Please refresh');
});
