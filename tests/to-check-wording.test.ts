import { describe,expect,it } from 'vitest';
import { toCheckWording,toCheckHeading } from '../src/shared/to-check.js';
import type { DayLeadItem } from '../src/shared/lead-results.js';
const event={id:'e',code:'R3',name:'60m',section:'Boy Cubs' as const,format:'heats' as const,enabled:true};
const race={id:'r',kind:'heat' as const,number:2,checkedInAt:'2026-10-14T10:00:00Z'};
const item=(fields:Partial<DayLeadItem>&Pick<DayLeadItem,'kind'|'message'>):DayLeadItem=>({id:'i',at:'2026-10-14T10:05:00Z',event,race,raceId:'r',...fields});
describe('To check wording',()=>{
  it('names two clashing finishing orders, who saved them and how far apart',()=>{
    expect(toCheckWording(item({kind:'clash',message:'Two versions - zone lead to check',clash:[{part:'finish',savers:[{name:'Yusuf',at:'2026-10-14T10:01:00Z'},{name:'Maryam',at:'2026-10-14T10:02:10Z'}]}]}))).toEqual({
      race:'R3 · 60m Boy Cubs · Heat 2',title:'Two different finishing orders were saved',explanation:'Saved by Yusuf and Maryam a minute apart. Choose which one stands.'});
  });
  it('words runner list and times clashes, close saves, long gaps and unknown savers',()=>{
    const at=(seconds:number)=>new Date(Date.parse('2026-10-14T10:00:00Z')+seconds*1000).toISOString();
    const clash=(part:'runners'|'times',seconds:number,names:(string|null)[])=>toCheckWording(item({kind:'clash',message:'',clash:[{part,savers:names.map((name,index)=>({name,at:at(index*seconds)}))}]}));
    expect(clash('runners',20,['Yusuf','Maryam'])).toMatchObject({title:'Two different runner lists were saved',explanation:'Saved by Yusuf and Maryam less than a minute apart. Choose which one stands.'});
    expect(clash('times',300,['Yusuf',null])).toMatchObject({title:'Two different sets of times were saved',explanation:'Saved by Yusuf and someone else 5 minutes apart. Choose which one stands.'});
    expect(clash('times',150,['Ali','Ali','Sara'])).toMatchObject({title:'Three different sets of times were saved',explanation:'Saved by Ali, Ali and Sara 5 minutes apart. Choose which one stands.'});
    expect(clash('times',7200,['Ali','Sara'])).toMatchObject({explanation:'Saved by Ali and Sara 2 hours apart. Choose which one stands.'});
    expect(clash('times',90,['Ali','Ali'])).toMatchObject({explanation:'Saved twice by Ali a minute apart. Choose which one stands.'});
    expect(clash('times',90,['Ali','Ali','Ali'])).toMatchObject({explanation:'Saved 3 times by Ali 3 minutes apart. Choose which one stands.'});
  });
  it('falls back to a plain clash line when the parts are not known',()=>{
    expect(toCheckWording(item({kind:'clash',message:'Two versions - zone lead to check'}))).toMatchObject({title:'Two different versions were saved',explanation:'Open the race and choose which one stands.'});
  });
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
    expect(toCheckWording(item({kind:'tie',message:'Tie at 20.00: 2004, 2005',race:undefined,raceId:undefined,tieId:'t',tie:{time:2000,wristbands:[2004,2005]}}))).toEqual({
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
});
