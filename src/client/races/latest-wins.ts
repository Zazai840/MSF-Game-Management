/** How a write went: the answer once the server has it, 'refused' when it said no, false when it could not be sent. */
export type Outcome<Answer>=Answer|false|'refused';
/**
 * One step's writes, latest wins: a body sent while a write is on its way waits, and goes in the next write (only the
 * latest of those waiting) at the version the last answer gave. Every send resolves with the outcome of the write
 * that carried its body, so a caller can act on its own save (Times done after the last place's time) even when it
 * was queued. A write that fails drops what waited behind it, with the same outcome. `onIdle` runs once nothing is left.
 * A send never goes at a version older than the last answer: a tap just after it, before the screen holds that answer,
 * would otherwise clash with this phone's own write.
 */
export function latestWins<Body,Answer extends object>(write:(body:Body,version:number)=>Promise<Outcome<Answer>>,versionOf:(answer:Answer)=>number,onIdle:()=>void) {
  let queued:Body|null=null,running=false,waiting:Array<(outcome:Outcome<Answer>)=>void>=[],answered=-Infinity;
  return async function send(body:Body,version:number):Promise<Outcome<Answer>> {
    queued=body;
    const outcome=new Promise<Outcome<Answer>>(resolve=>waiting.push(resolve));
    if(running) return outcome;
    running=true;
    let seen=Math.max(version,answered),last:Outcome<Answer>=false;
    try {
      while(queued!==null) {
        const next=queued,carried=waiting;queued=null;waiting=[];
        last=await write(next,seen);
        for(const resolve of carried) resolve(last);
        if(typeof last!=='object') break;
        seen=answered=versionOf(last);
      }
    } finally {
      queued=null;running=false;
      for(const resolve of waiting.splice(0)) resolve(last);
      onIdle();
    }
    return outcome;
  };
}
