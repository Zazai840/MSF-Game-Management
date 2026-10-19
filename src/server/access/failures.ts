import type { FastifyReply } from 'fastify';
import { Refusal } from './permissions.js';

export class WrongAccessCode extends Refusal {
  constructor(message:string) {super(403,message);}
}

/** Reject attempts during backoff before checking codes or taking transaction locks. */
export function failureBackoff() {
  const failures=new Map<string,{count:number;at:number;until:number}>();
  return async <T>(keys:string[],reply:FastifyReply,check:()=>Promise<T>):Promise<T>=>{
    const now=Date.now();
    for(const [key,failure] of failures) if(now-failure.at>=15*60_000) failures.delete(key);
    let remaining=0;
    for(const key of keys) remaining=Math.max(remaining,(failures.get(key)?.until||0)-now);
    if(remaining>0) {
      reply.header('Retry-After',Math.ceil(remaining/1000));
      throw new Refusal(429,'Too many incorrect codes - wait and try again');
    }
    try {return await check();}
    catch(error) {
      if(!(error instanceof WrongAccessCode)) throw error;
      const now=Date.now();
      for(const [key,failure] of failures) if(now-failure.at>=15*60_000) failures.delete(key);
      let delay=0;
      for(const key of keys) {
        const count=Math.min((failures.get(key)?.count||0)+1,11);
        const wait=count>5?Math.min(30_000,1000*2**(count-6)):0;
        failures.delete(key);
        failures.set(key,{count,at:now,until:now+wait});
        delay=Math.max(delay,wait);
      }
      // Bound memory even if callers supply many different IPs or signed-in phones.
      while(failures.size>10_000) failures.delete(failures.keys().next().value!);
      if(!delay) throw error;
      reply.header('Retry-After',Math.ceil(delay/1000));
      throw new Refusal(429,'Too many incorrect codes - wait and try again');
    }
  };
}
