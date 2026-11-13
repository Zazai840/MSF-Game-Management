import { describe,expect,it } from 'vitest';
import { acceptable,eventItems,issueLine,placesCorrection,problemButtons,problemFix,raceCallouts,raceItems,toCheckWording,toCheckHeading } from '../src/shared/to-check.js';
import type { EventResults } from '../src/shared/results-rules.js';
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
  it('gives an event one callout per race: the problems of one race share it, a lone problem and a tie keep their own',()=>{
    const heat=(number:number)=>({...race,id:`r${number}`,number});
    const wrong=(id:string,wristband:number,kind:NonNullable<DayLeadItem['warningKinds']>[number])=>item({id,kind:'warning',message:'w',race:heat(1),raceId:'r1',wristband,warningKinds:[kind]});
    const tie=item({id:'t',kind:'tie',message:'Tie',race:undefined,raceId:undefined,tieId:'t',tie:{time:2000,names:['2004','2005'],raceIds:['r1','r2']}});
    const late=item({id:'l',kind:'added-at-finish',message:'a',race:heat(1),raceId:'r1',wristband:1002});
    const alone=item({id:'a',kind:'times-out-of-order',message:'Times out of order',race:heat(2),raceId:'r2'});
    // One kind of problem: the facts only.
    expect(raceCallouts([wrong('w1',5141,'unknown-number'),wrong('w2',3141,'wrong-section')])[0].lines).toEqual(['5141 is not a wristband number. Wristbands are 1 to 4999.','3141 is not a Boy Cubs number. Boy Cubs wristbands are 1000 to 1999.']);
    expect(raceCallouts([wrong('w1',5141,'unknown-number'),tie,wrong('w2',3141,'wrong-section'),alone,late])).toEqual([
      {items:[expect.objectContaining({id:'w1'}),expect.objectContaining({id:'w2'}),expect.objectContaining({id:'l'})],title:'Heat 1 · 3 things to check',
        lines:['A wristband number needs checking. 5141 is not a wristband number. Wristbands are 1 to 4999.','A wristband number needs checking. 3141 is not a Boy Cubs number. Boy Cubs wristbands are 1000 to 1999.','A runner was added at the finish. 1002 crossed the line but was not checked in at the start.']},
      {items:[expect.objectContaining({id:'t'})]},
      {items:[expect.objectContaining({id:'a'})]}]);
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
describe("A lead's card problem buttons",()=>{
  const heat=(number:number)=>({id:`r${number}`,kind:'heat' as const,number,checkedInAt:'2026-10-14T10:00:00Z'});
  const relay={...event,name:'4x100m Relay',type:'relays' as const,relay:true};
  const on=(number:number,fields:Partial<DayLeadItem>&Pick<DayLeadItem,'kind'>)=>item({message:'m',race:heat(number),raceId:`r${number}`,entryId:'e',...fields});
  const tie=(id:string,from:DayLeadItem['event']=event)=>item({kind:'tie',message:'t',event:from,race:undefined,raceId:undefined,tieId:id,tie:{time:2000,names:['2004','2005'],raceIds:['r1','r2']}});
  it('names the race and the count of each kind on an individual event, and opens that race\'s page',()=>{
    const kinds=['times-out-of-order','warning','added-at-finish','ran-twice'] as const;
    expect(problemButtons(kinds.map((kind,index)=>on(index+1,{kind,wristband:2001})))).toEqual([
      {label:'Check Heat 1 · 1 time',target:{event,raceId:'r1'}},{label:'Check Heat 2 · 1 wristband',target:{event,raceId:'r2'}},
      {label:'Check Heat 3 · 1 runner',target:{event,raceId:'r3'}},{label:'Check Heat 4 · 1 runner',target:{event,raceId:'r4'}}]);
  });
  it('counts teams and children on a relay',()=>{
    const kinds=['two-relays','ran-short','added-at-finish','ran-twice','warning','times-out-of-order'] as const;
    expect(problemButtons(kinds.map((kind,index)=>on(index+1,{kind,event:relay,team:5}))).map(button=>button.label)).toEqual([
      'Check Heat 1 · 1 child','Check Heat 2 · 1 team','Check Heat 3 · 1 team','Check Heat 4 · 1 team','Check Heat 5 · 1 wristband','Check Heat 6 · 1 time']);
    expect(problemButtons([on(1,{kind:'two-relays',event:relay,team:5}),on(1,{kind:'two-relays',event:relay,team:6})])).toEqual([{label:'Check Heat 1 · 2 children',target:{event:relay,raceId:'r1'}}]);
  });
  it('is one button per race, in the order of the items: a race with more than one kind counts its problems',()=>{
    const final={id:'f',kind:'final' as const,number:1,checkedInAt:'2026-10-14T11:00:00Z'};
    expect(problemButtons([on(2,{kind:'warning'}),on(1,{kind:'warning'}),on(2,{kind:'warning'}),on(2,{kind:'times-out-of-order'}),on(9,{kind:'times-out-of-order',race:final,raceId:'f'})]).map(button=>button.label))
      .toEqual(['Check Heat 2 · 3 problems','Check Heat 1 · 1 wristband','Check Final · 1 time']);
    expect(problemButtons([on(1,{kind:'added-at-finish',wristband:2001}),on(1,{kind:'ran-twice',wristband:2002})])).toEqual([{label:'Check Heat 1 · 2 problems',target:{event,raceId:'r1'}}]);
  });
  it('says Decide the tie: one tie opens the tie, more than one the event in Results',()=>{
    expect(problemButtons([tie('t1')])).toEqual([{label:'Decide the tie',target:{event,tieId:'t1'}}]);
    expect(problemButtons([tie('t1'),tie('t2')])).toEqual([{label:'Decide the tie',target:{event}}]);
    expect(problemButtons([tie('t1',relay)])).toEqual([{label:'Decide the tie',target:{event:relay,tieId:'t1'}}]);
  });
  it('is empty with nothing to check',()=>{expect(problemButtons([])).toEqual([]);});
});
describe("A problem's button",()=>{
  const relay={...event,relay:true,type:'relays' as const},final={id:'f',kind:'final' as const,number:1,checkedInAt:'2026-10-14T11:00:00Z'};
  const tie=item({kind:'tie',message:'t',race:undefined,raceId:undefined,tieId:'t1'});
  it('on the race page opens the correction that fits the problem',()=>{
    expect(problemFix(tie,{kind:'heat',relay:false})).toEqual({label:'Decide the tie',opens:'tie'});
    expect(problemFix(item({kind:'ran-twice',message:'m'}),{kind:'heat',relay:false})).toEqual({label:'Fix',opens:'choose-result'});
    expect(problemFix(item({kind:'times-out-of-order',message:'m'}),{kind:'heat',relay:false})).toEqual({label:'Fix time',opens:'correct-times'});
    expect(problemFix(item({kind:'times-out-of-order',message:'m'}),{kind:'final',relay:false})).toEqual({label:'Fix time',opens:'correct-finishing-order'});
    for(const kind of ['warning','added-at-finish'] as const) expect(problemFix(item({kind,message:'m'}),{kind:'heat',relay:false})).toEqual({label:'Fix',opens:'correct-runner-list'});
    for(const kind of ['warning','two-relays','ran-short','added-at-finish'] as const) expect(problemFix(item({kind,message:'m',event:relay}),{kind:'heat',relay:true})).toEqual({label:'Fix',opens:'correct-teams'});
  });
  it('on the event opens the tie, or the race page of the problem',()=>{
    expect(problemFix(tie)).toEqual({label:'Decide the tie',opens:'tie'});
    expect(problemFix(item({kind:'warning',message:'m'}))).toEqual({label:'Check Heat 2',opens:'race-page'});
    expect(problemFix(item({kind:'times-out-of-order',message:'m',race:final}))).toEqual({label:'Check Final',opens:'race-page'});
  });
  it("a place is fixed in a final's finishing order, else in its race's times",()=>{
    expect([placesCorrection(true),placesCorrection(false)]).toEqual(['correct-finishing-order','correct-times']);
  });
  it("It's right accepts every kind but a second run and a tie",()=>{
    const kinds=['warning','two-relays','ran-short','added-at-finish','times-out-of-order','ran-twice','tie'] as const;
    expect(kinds.filter(kind=>acceptable({kind}))).toEqual(['warning','two-relays','ran-short','added-at-finish','times-out-of-order']);
  });
});
describe("An event's To check items",()=>{
  const bare=(id:string,fields:Partial<DayLeadItem>&Pick<DayLeadItem,'kind'>)=>({id,at:'2026-10-14T10:05:00Z',message:'m',...fields});
  const other={...race,id:'r2',number:3};
  const needsYou=[bare('a',{kind:'warning',raceId:'r'}),bare('b',{kind:'times-out-of-order',raceId:'r2'}),bare('c',{kind:'tie',tieId:'t',tie:{time:2000,names:['2004','2005'],raceIds:['r','r9']}})];
  const results={needsYou,races:[{race,runners:2,saved:true,reasons:[]},{race:other,runners:2,saved:true,reasons:[]}]} as Pick<EventResults,'needsYou'|'races'>;
  it('carry their event and race, in the order of the event read',()=>{
    expect(eventItems({event,results})).toEqual([{...needsYou[0],event,race},{...needsYou[1],event,race:other},{...needsYou[2],event}]);
  });
  it("a race's are its own and each tie it is in",()=>{
    const items=eventItems({event,results});
    expect(raceItems(items,'r').map(item=>item.id)).toEqual(['a','c']);
    expect(raceItems(items,'r2').map(item=>item.id)).toEqual(['b']);
  });
});
