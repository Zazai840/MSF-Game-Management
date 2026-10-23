import { expect,test } from 'vitest';
import { homeStatus,type HomeEvent } from '../src/shared/race-screen.js';
const sam={id:'s',name:'Sam'},jo={id:'j',name:'Jo'};
const event=(change:Partial<HomeEvent>):HomeEvent=>({code:'R1',name:'60m',section:'Boy Cubs',relay:false,race:{kind:'heat',number:2,state:'in progress'},holds:{},started:false,waitingOn:[],done:false,...change});
test('a tile\'s status line names the race, what is happening on it and who is on it',()=>{
  expect(homeStatus(event({}))).toBe('Heat 2');
  expect(homeStatus(event({holds:{'check-in':sam}}))).toBe('Heat 2 · Checking in · Sam');
  // An order started by someone who has since signed out still shows.
  expect(homeStatus(event({started:true}))).toBe('Heat 2 · Order and times');
  expect(homeStatus(event({holds:{'check-in':sam,order:jo,times:sam}}))).toBe('Heat 2 · Order and times · Sam, Jo');
  expect(homeStatus(event({race:{kind:'heat',number:2,state:'submitted'},holds:{order:jo},waitingOn:['Sam','Jo']}))).toBe('Heat 2 · Waiting on 2 to submit · Sam, Jo');
  // Everyone asked signed out: nobody is left to wait on, and any press saves it.
  expect(homeStatus(event({race:{kind:'heat',number:2,state:'submitted'}}))).toBe('Heat 2 · Ready to save');
  expect(homeStatus(event({race:{kind:'race',number:3,state:'in progress'}}))).toBe('Race 3');
  expect(homeStatus(event({done:true,holds:{order:jo}}))).toBe('Done');
});
test('on a Final, check-in is checking who is here and the order is the finishing order',()=>{
  const final={kind:'final',number:1,state:'in progress'} as const;
  expect(homeStatus(event({race:final,holds:{'check-in':sam}}))).toBe('Final · Checking who is here · Sam');
  expect(homeStatus(event({race:final,holds:{'check-in':sam,order:jo}}))).toBe('Final · Finishing order · Sam, Jo');
});
test('a relay with no teams reads No teams yet',()=>{
  expect(homeStatus(event({code:'R22',name:'4x50m Relay',section:'Girl Cubs',relay:true,race:{kind:'heat',number:1,state:'in progress'},teams:[]}))).toBe('No teams yet');
});
test('a relay with teams and no race yet counts the teams to run',()=>{
  const team=(number:number)=>({id:`t${number}`,number,version:1,legs:[{wristband:2101+number,warnings:[]}]});
  const relay=(teams:number)=>event({code:'R22',name:'4x50m Relay',section:'Girl Cubs',relay:true,race:{kind:'heat',number:1,state:'in progress'},teams:Array.from({length:teams},(_,index)=>team(index+1))});
  expect(homeStatus(relay(5))).toBe('Heat 1 · 5 teams to run');
  expect(homeStatus(relay(1))).toBe('Heat 1 · 1 team to run');
});
