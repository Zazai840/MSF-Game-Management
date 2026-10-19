import { checkIn,recordFinishingOrder,recordTimes,recordRace,signInThroughApi,expect,test,type APIRequestContext } from './fixtures.js';
const scoring=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
/** A race as a lead reads it: each child's place and time in check-in order, and who saved each part. */
async function leadRead(request:APIRequestContext,id:string) {
  const {race,history}=await (await request.get(`/api/lead/races/${id}`,{headers:scoring()})).json();
  return {
    results:race.recording.results.map(({wristband,place,time}:{wristband:number;place:number|null;time:number|null})=>[wristband,place,time]),
    // Each part starts with an empty save by no one.
    authors:[...new Set(history.filter(({author}:{author:string|null})=>author).map(({part,author}:{part:string;author:string})=>`${part} by ${author}`))].sort()
  };
}
test('the race setup helpers check in, record the finishing order and times, and record a whole race, each as the phone they are given',async({request},info)=>{
  const code=`SU-${info.project.name.toUpperCase()}`,name=`Race setup ${info.project.name}`;
  await request.post('/api/day/events',{headers:scoring(),data:{code,name:'Setup sprint',section:'Girl Cubs',format:'timed'}});await request.post('/api/day/confirm-events',{headers:scoring(),data:{}});
  const token=await signInThroughApi(request,name);
  const race=await checkIn(request,token,code,[2001,2002,2003]);
  await recordFinishingOrder(request,token,race,{order:[2002,2001],didNotFinish:[2003]});
  await recordTimes(request,token,race,[1200,1300]);
  expect(await leadRead(request,race.id)).toEqual({results:[[2001,2,1300],[2002,1,1200],[2003,null,null]],authors:[`finish by ${name}`,`runners by ${name}`,`times by ${name}`]});
  const whole=await recordRace(request,token,code,[2004,2005],[1500,1400]);
  expect(await leadRead(request,whole.id)).toEqual({results:[[2004,1,1500],[2005,2,1400]],authors:[`finish by ${name}`,`runners by ${name}`,`times by ${name}`]});
  for(const {id} of [race,whole]) expect((await request.post(`/api/lead/races/${id}/delete`,{headers:scoring(),data:{permanent:true}})).ok()).toBe(true);
});
