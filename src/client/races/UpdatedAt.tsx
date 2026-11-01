/** "Updated at 10:42:05" with Refresh, on Races, the lead's race steps and every lead screen. */
export function UpdatedAt({time,onRefresh}:{time:string;onRefresh:()=>void}) {
  return <p className="rz-refresh" aria-live="polite">Updated at {time||'…'} <button className="rz-btn rz-btn--small" type="button" onClick={onRefresh}>Refresh</button></p>;
}
