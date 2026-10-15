export function initials(name:string) {
  const words=name.trim().split(/\s+/).filter(Boolean);
  if(!words.length) return '';
  const first=[...words[0]][0]||'',last=words.length>1?[...words[words.length-1]][0]||'':'';
  return (first+last).toLocaleUpperCase();
}
/** The navy bar on every screen. The day has no name in v1's data, so dayName is shown only when known. */
export function AppHeader({name,dayName}:{name?:string;dayName?:string}) {
  return <header className="app-header">
    <div className="app-header-title"><strong>Running Zone</strong>{dayName && <span>{dayName}</span>}</div>
    {name && <div className="app-header-person"><span>{name}</span><span className="avatar" aria-hidden="true">{initials(name)}</span></div>}
  </header>;
}
