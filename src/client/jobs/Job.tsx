import type { Job as JobName,Phone } from '../../shared/domain.js';
import { Times } from './Times.js';
import { FinishOrder } from './FinishOrder.js';
import { StartLine } from './StartLine.js';
export function Job({job,phone,onHome}:{job:JobName;phone:Phone;onHome:()=>void}) { return job==='Start line'?<StartLine key={phone.dayId} dayId={phone.dayId} onHome={onHome} />:job==='Finish order'?<FinishOrder key={phone.dayId} dayId={phone.dayId} />:<Times key={phone.dayId} dayId={phone.dayId} />; }
