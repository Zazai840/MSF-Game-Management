import type { Job as JobName,Phone } from '../../shared/domain.js';
import { Times } from './Times.js';
import { FinishOrder } from './FinishOrder.js';
import { StartLine } from './StartLine.js';
export function Job({job,phone}:{job:JobName;phone:Phone}) { return job==='Start line'?<StartLine key={phone.dayId} dayId={phone.dayId} />:job==='Finish order'?<FinishOrder key={phone.dayId} dayId={phone.dayId} />:<Times key={phone.dayId} dayId={phone.dayId} />; }
