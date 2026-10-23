import { expect,test } from 'vitest';
import { homeStatus,type HomeEvent } from '../src/shared/race-screen.js';
import type { RelayTeam,TeamRace } from '../src/shared/teams.js';
const sam={id:'s',name:'Sam'},jo={id:'j',name:'Jo'};
const event=(change:Partial<HomeEvent>):HomeEvent=>({code:'R1',name:'60m',section:'Boy Cubs',relay:false,race:{id:null,kind:'heat',number:2,state:'in progress'},holds:{},started:false,waitingOn:[],done:false,...change});
test('a tile\'s status line names the race, what is happening on it and who is on it',()=>{
  expect(homeStatus(event({}))).toBe('Heat 2');
  expect(homeStatus(event({holds:{'check-in':sam}}))).toBe('Heat 2 · Checking in · Sam');
  // An order started by someone who has since signed out still shows.
  expect(homeStatus(event({started:true}))).toBe('Heat 2 · Order and times');
  expect(homeStatus(event({holds:{'check-in':sam,order:jo,times:sam}}))).toBe('Heat 2 · Order and times · Sam, Jo');
  expect(homeStatus(event({race:{id:'r',kind:'heat',number:2,state:'submitted'},holds:{order:jo},waitingOn:['Sam','Jo']}))).toBe('Heat 2 · Waiting on 2 to submit · Sam, Jo');
  // Everyone asked signed out: nobody is left to wait on, and any press saves it.
  expect(homeStatus(event({race:{id:'r',kind:'heat',number:2,state:'submitted'}}))).toBe('Heat 2 · Ready to save');
  expect(homeStatus(event({race:{id:'r',kind:'race',number:3,state:'in progress'}}))).toBe('Race 3');
  expect(homeStatus(event({done:true,holds:{order:jo}}))).toBe('Done');
});
test('on a Final, check-in is checking who is here and the order is the finishing order',()=>{
  const final={id:'f',kind:'final',number:1,state:'in progress'} as const;
  expect(homeStatus(event({race:final,holds:{'check-in':sam}}))).toBe('Final · Checking who is here · Sam');
  expect(homeStatus(event({race:final,holds:{'check-in':sam,order:jo}}))).toBe('Final · Finishing order · Sam, Jo');
});
test('a relay with no teams reads No teams yet',()=>{
  expect(homeStatus(event({code:'R22',name:'4x50m Relay',section:'Girl Cubs',relay:true,race:{id:null,kind:'heat',number:1,state:'in progress'},teams:[]}))).toBe('No teams yet');
});
test('a relay tile counts the teams still to run, then the teams ticked while checking in',()=>{
  const heat1={id:'h1',kind:'heat',number:1,state:'saved'} as const,heat2={id:'h2',kind:'heat',number:2,state:'in progress'} as const;
  const team=(number:number,races:TeamRace[]=[]):RelayTeam=>({id:`t${number}`,number,version:1,changing:null,races,legs:[{wristband:2101+number,warnings:[]}]});
  const relay=(teams:RelayTeam[],change:Partial<HomeEvent>={})=>event({code:'R22',name:'4x50m Relay',section:'Girl Cubs',relay:true,race:{id:null,kind:'heat',number:1,state:'in progress'},teams,...change});
  expect(homeStatus(relay([1,2,3,4,5].map(number=>team(number))))).toBe('Heat 1 · 5 teams to run');
  expect(homeStatus(relay([team(1)]))).toBe('Heat 1 · 1 team to run');
  // Teams that ran in heat 1 are not to run; heat 2 has nobody ticked yet once its last team was taken off.
  const current={race:{id:'h2',kind:'heat',number:2,state:'in progress'}} as const;
  expect(homeStatus(relay([team(1,[heat1]),team(2),team(3)],current))).toBe('Heat 2 · 2 teams to run');
  expect(homeStatus(relay([team(1,[heat1]),team(2,[heat2]),team(3,[heat2]),team(4)],current))).toBe('Heat 2 · Checking in · 2 teams');
  expect(homeStatus(relay([team(2,[heat2]),team(4)],current))).toBe('Heat 2 · Checking in · 1 team');
  // The order and times, submitting and Done read as on any heat.
  expect(homeStatus(relay([team(2,[heat2])],{...current,holds:{order:jo}}))).toBe('Heat 2 · Order and times · Jo');
  expect(homeStatus(relay([team(2,[heat2])],{...current,started:true}))).toBe('Heat 2 · Order and times');
  expect(homeStatus(relay([team(2,[heat2])],{race:{...heat2,state:'submitted'},waitingOn:['Jo']}))).toBe('Heat 2 · Waiting on 1 to submit · Jo');
  expect(homeStatus(relay([team(2,[heat2])],{...current,done:true}))).toBe('Done');
});
test('a relay tile reads Heats done · Final next once no team is still to run and the current heat is empty, whoever still holds the order',()=>{
  const heat1={id:'h1',kind:'heat',number:1,state:'saved'} as const,heat2={id:'h2',kind:'heat',number:2,state:'in progress'} as const;
  const team=(number:number,races:TeamRace[]=[]):RelayTeam=>({id:`t${number}`,number,version:1,changing:null,races,legs:[{wristband:2101+number,warnings:[]}]});
  const relay=(teams:RelayTeam[],change:Partial<HomeEvent>={})=>event({code:'R22',name:'4x50m Relay',section:'Girl Cubs',relay:true,race:{id:null,kind:'heat',number:2,state:'in progress'},teams,...change});
  // The order and times holders keep their holds into the next heat: an empty heat still reads by its teams.
  expect(homeStatus(relay([team(1,[heat1]),team(2)],{holds:{order:jo,times:sam}}))).toBe('Heat 2 · 1 team to run');
  expect(homeStatus(relay([team(1,[heat1]),team(2,[heat1])],{holds:{order:jo,times:sam}}))).toBe('Heats done · Final next');
  // A heat whose last team was taken off is empty too.
  expect(homeStatus(relay([team(1,[heat1])],{race:heat2}))).toBe('Heats done · Final next');
  // With a team ticked, held jobs read as the order and times.
  expect(homeStatus(relay([team(1,[heat1]),team(2,[heat2])],{race:heat2,holds:{order:jo,times:sam}}))).toBe('Heat 2 · Order and times · Jo, Sam');
});
