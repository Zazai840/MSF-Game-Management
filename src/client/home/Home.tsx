import type { Job, WaitingCounts } from '../../shared/domain.js';
export function Home({waiting,onJob}:{waiting:WaitingCounts;onJob:(job:Job)=>void}) {
  return <section><h1>What are you doing?</h1><div className="jobs">
    {(['Start line','Finish order','Times'] as const).map(job=><button key={job} onClick={()=>onJob(job)}>{job} · {waiting[job]} waiting</button>)}
  </div></section>;
}
