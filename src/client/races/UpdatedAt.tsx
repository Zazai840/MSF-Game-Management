import { PullToRefresh } from './PullToRefresh.js';
/** "Updated at 10:42:05", one centred line on every lead screen; on Races, "Updated at" over the time beside New race. It brings the pull down that refreshes the screen. */
export function UpdatedAt({time,onRefresh}:{time:string;onRefresh:()=>void}) {
  return <><p className="rz-refresh" aria-live="polite">Updated at <span>{time||'…'}</span></p><PullToRefresh onRefresh={onRefresh}/></>;
}
