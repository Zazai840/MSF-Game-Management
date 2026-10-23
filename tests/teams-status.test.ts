import { expect,test } from 'vitest';
import { teamsBadge,teamsStatus,type RelayTeam } from '../src/shared/teams.js';
const team=(number:number,...wristbands:Array<number|null>):RelayTeam=>({id:`t${number}`,number,version:1,races:[],legs:wristbands.map(wristband=>({wristband,warnings:[]}))});
const full=(number:number)=>team(number,1,2,3,4);
const sam={id:'s',name:'Sam Patel'};
test('a relay card\'s status line says who is entering, how many teams and the first team not complete',()=>{
  expect(teamsStatus({teams:[],teamsHolder:null},'s')).toBe('No teams yet · open to start');
  expect(teamsStatus({teams:[1,2,3,4].map(full).concat(team(5,1,2,null,4)),teamsHolder:sam},'s')).toBe('You are entering · 5 teams · Team 5 is 3 of 4');
  expect(teamsStatus({teams:[1,2,3,4,5].map(full),teamsHolder:sam},'other')).toBe('Sam Patel is entering · 5 teams');
  expect(teamsStatus({teams:[full(1)],teamsHolder:null},'s')).toBe('1 team');
  expect(teamsStatus({teams:[],teamsHolder:sam},'s')).toBe('You are entering · No teams yet');
});
test('the Teams badge counts every relay\'s teams and those not complete, and is empty with no teams',()=>{
  expect(teamsBadge([{teams:[]},{teams:[]}])).toBe('');
  expect(teamsBadge([{teams:[full(1),team(2,1,null,null,null)]},{teams:[full(1)]}])).toBe('3 teams · 1 not complete');
  expect(teamsBadge([{teams:[full(1)]}])).toBe('1 team');
});
