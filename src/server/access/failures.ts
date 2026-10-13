import { setTimeout } from 'node:timers/promises';
import type { FastifyReply } from 'fastify';
import { Refusal } from './permissions.js';

export class WrongAccessCode extends Refusal {
  constructor(message:string) {super(403,message);}
}

/** Delay only incorrect codes, after the transaction has released its locks/client. */
export function failureBackoff() {
  const failures=new Map<string,{count:number;at:number}>();
  return async <T>(keys:string[],reply:FastifyReply,check:()=>Promise<T>):Promise<T>=>{
    try {return await check();}
    catch(error) {
      if(!(error instanceof WrongAccessCode)) throw error;
      const now=Date.now();
      for(const [key,failure] of failures) if(now-failure.at>=15*60_000) failures.delete(key);
      let delay=0;
      for(const key of keys) {
        const count=Math.min((failures.get(key)?.count||0)+1,11);
        failures.delete(key);
        failures.set(key,{count,at:now});
        if(count>5) delay=Math.max(delay,Math.min(30_000,1000*2**(count-6)));
      }
      // Bound memory even if callers supply many different IPs or joined phones.
      while(failures.size>10_000) failures.delete(failures.keys().next().value!);
      if(!delay) throw error;
      await setTimeout(delay);
      reply.header('Retry-After',Math.ceil(delay/1000));
      throw new Refusal(429,'Too many incorrect codes - wait and try again');
    }
  };
}
