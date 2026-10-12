import type { Job as JobName } from '../../shared/domain.js';
export function Job({job}:{job:JobName}) { return <section><h1>{job}</h1><p>No races waiting yet</p></section>; }
