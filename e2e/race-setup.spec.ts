import { recordRace,signInThroughApi,submitRace,writeCheckIn,writeOrder,writeTimes,expect,test,type APIRequestContext } from './fixtures.js';
const owner=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
/** A race as a lead reads it: each child's place and time in check-in order, and who saved each part. */
async function leadRead(request:APIRequestContext,id:string) {
  const {race,history}=await (await request.get(`/api/lead/races/${id}`,{headers:owner()})).json();
  return {
    results:race.recording.results.map(({wristband,place,time}:{wristband:number;place:number|null;time:number|null})=>[wristband,place,time]),
    // History starts when the race is saved: a row per part naming who held its job.
    authors:[...new Set(history.filter(({author}:{author:string|null})=>author).map(({part,author}:{part:string;author:string})=>`${part} by ${author}`))].sort()
  };
}
test('the race setup helpers check in, write the finishing order and times, submit, and record a whole race, each as the phone they are given',async({request},info)=>{
  const code=`SU-${info.project.name.toUpperCase()}`,name=`Race setup ${info.project.name}`;
  await request.post('/api/day/events',{headers:owner(),data:{code,name:'Setup sprint',section:'Girl Cubs',format:'timed',type:'races'}});await request.post('/api/day/confirm-events',{headers:owner(),data:{}});
  const token=await signInThroughApi(request,name);
  await writeCheckIn(request,token,code,[2001,2002,2003]);
  await writeOrder(request,token,code,[2002,2001],{didNotFinish:[2003]});
  const {race}=await writeTimes(request,token,code,[1200,1300]);
  expect((await submitRace(request,token,code)).lastSaved).toMatchObject({number:race.number,by:name});
  expect(await leadRead(request,race.id!)).toEqual({results:[[2001,2,1300],[2002,1,1200],[2003,null,null]],authors:[`finish by ${name}`,`runners by ${name}`,`times by ${name}`]});
  const whole=await recordRace(request,token,code,[2004,2005],[1500,1400]);
  expect(await leadRead(request,whole.id)).toEqual({results:[[2004,1,1500],[2005,2,1400]],authors:[`finish by ${name}`,`runners by ${name}`,`times by ${name}`]});
  for(const id of [race.id,whole.id]) expect((await request.post(`/api/lead/races/${id}/delete`,{headers:owner(),data:{permanent:true}})).ok()).toBe(true);
});
