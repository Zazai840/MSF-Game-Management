import { describe,expect,it } from 'vitest';
import { issueLine,toCheckWording,toCheckHeading } from '../src/shared/to-check.js';
import type { DayLeadItem } from '../src/shared/lead-results.js';
const event={id:'e',code:'R3',name:'60m',section:'Boy Cubs' as const,format:'heats' as const,enabled:true,type:'races' as const,relay:false};
const race={id:'r',kind:'heat' as const,number:2,checkedInAt:'2026-10-14T10:00:00Z'};
const item=(fields:Partial<DayLeadItem>&Pick<DayLeadItem,'kind'|'message'>):DayLeadItem=>({id:'i',at:'2026-10-14T10:05:00Z',event,race,raceId:'r',...fields});
describe('To check wording',()=>{
  it('says which time looks wrong and why',()=>{
    expect(toCheckWording(item({kind:'times-out-of-order',message:'Times out of order',wrongTime:{place:4,time:1290,earlierPlace:3,earlierTime:1305}}))).toEqual({
      race:'R3 · 60m Boy Cubs · Heat 2',title:'A time looks wrong',explanation:'4th place (12.90) is faster than 3rd (13.05). The timer kept it as typed.'});
    expect(toCheckWording(item({kind:'times-out-of-order',message:'Times out of order',wrongTime:{place:12,time:9205,earlierPlace:11,earlierTime:9300}})).explanation).toBe('12th place (1:32.05) is faster than 11th (1:33.00). The timer kept it as typed.');
  });
  it('explains a wristband warning in the volunteer wording',()=>{
    expect(toCheckWording(item({kind:'warning',message:'3045: 3045 belongs to Boy Scouts - this race is Boy Cubs',wristband:3045,warningKinds:['wrong-section']}))).toMatchObject({title:'A wristband number needs checking',explanation:'3045 is not a Boy Cubs number. Boy Cubs wristbands are 1000 to 1999. Correct it or mark it checked.'});
    expect(toCheckWording(item({kind:'warning',message:'0: unknown',wristband:0,warningKinds:['unknown-number']})).explanation).toBe('0 is not a wristband number. Wristbands are 1 to 4999. Correct it or mark it checked.');
  });
  it('explains a runner added at the finish and a runner who ran twice',()=>{
    expect(toCheckWording(item({kind:'added-at-finish',message:'2002: Added at the finish',wristband:2002}))).toMatchObject({title:'A runner was added at the finish',explanation:'2002 crossed the line but was not checked in at the start. Check they ran in this race.'});
    expect(toCheckWording(item({kind:'ran-twice',message:'2001: Ran twice in this event',wristband:2001}))).toMatchObject({title:'A runner ran twice',explanation:'2001 has a result in more than one race of this event. Choose which result counts.'});
  });
  it('explains a tie, which belongs to the event rather than one race',()=>{
    expect(toCheckWording(item({kind:'tie',message:'Tie at 20.00: 2004, 2005',race:undefined,raceId:undefined,tieId:'t',tie:{time:2000,names:['2004','2005'],raceIds:['r1','r2']}}))).toEqual({
      race:'R3 · 60m Boy Cubs',title:'Runners tied on time',explanation:'2004 and 2005 both have 20.00. Decide whether a run-off is needed.'});
  });
  it('keeps the original message when the facts are missing',()=>{
    expect(toCheckWording(item({kind:'warning',message:'3045: odd'})).explanation).toBe('3045: odd');
  });
  it('heads the list with how many things need a lead',()=>{
    expect(toCheckHeading(0)).toBe('Nothing to check');
    expect(toCheckHeading(1)).toBe('1 thing needs a zone lead');
    expect(toCheckHeading(2)).toBe('2 things need a zone lead');
  });
  it("groups a lead's card issues by race and kind and counts them, two groups then how many more",()=>{
    const heat=(number:number)=>({id:`r${number}`,kind:'heat' as const,number,checkedInAt:'2026-10-14T10:00:00Z'});
    const wristbands=Array.from({length:9},(_,index)=>item({kind:'warning',message:'odd',race:heat(2),raceId:'r2',wristband:3000+index}));
    expect(issueLine([...wristbands,item({kind:'times-out-of-order',message:'Times out of order',race:heat(1),raceId:'r1'})])).toBe('Heat 2: 9 wristbands to check · Heat 1: 1 time to check');
    expect(issueLine([item({kind:'added-at-finish',message:'a',race:heat(3),raceId:'r3',wristband:2001}),item({kind:'added-at-finish',message:'b',race:heat(3),raceId:'r3',wristband:2002})]))
      .toBe('Heat 3: 2 runners added at the finish');
    expect(issueLine([...wristbands,item({kind:'warning',message:'odd',race:heat(1),raceId:'r1'}),item({kind:'times-out-of-order',message:'t',race:heat(2),raceId:'r2'}),
      item({kind:'ran-twice',message:'t',race:heat(2),raceId:'r2',wristband:2001}),item({kind:'tie',message:'t',race:undefined,raceId:undefined})]))
      .toBe('Heat 2: 9 wristbands to check · Heat 1: 1 wristband to check · 3 more');
  });
});
