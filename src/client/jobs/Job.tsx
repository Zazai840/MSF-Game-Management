import type { Job as JobName,Phone } from '../../shared/domain.js';
import { StartLine } from './StartLine.js';
export function Job({job,phone}:{job:JobName;phone:Phone}) { return job==='Start line'?<StartLine key={phone.dayId} dayId={phone.dayId} />:<section><h1>{job}</h1><p>No races waiting yet</p></section>; }
