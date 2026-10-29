import { useEffect,useState } from 'react';
export function initials(name:string) {
  const words=name.trim().split(/\s+/).filter(Boolean);
  // A numbered name ("Sam Patel 2", from Lead sign-in) keeps the person's initials.
  if(words.length>2 && /^\d+$/.test(words[words.length-1])) words.pop();
  if(!words.length) return '';
  const first=[...words[0]][0]||'',last=words.length>1?[...words[words.length-1]][0]||'':'';
  return (first+last).toLocaleUpperCase();
}
export interface TestBuild { commit:string; reportUrl:string }
let testBuildRead:Promise<TestBuild|undefined>|undefined;
/** The health read says whether this deployment is a test build; it is read once per page load. */
export function useTestBuild() {
  const [testBuild,setTestBuild]=useState<TestBuild>();
  useEffect(()=>{
    let live=true;
    testBuildRead??=fetch('/api/health').then(response=>response.json()).then((body:{testBuild?:TestBuild})=>body.testBuild).catch(()=>{testBuildRead=undefined;return undefined;});
    void testBuildRead.then(value=>{if(live) setTestBuild(value);});
    return ()=>{live=false;};
  },[]);
  return testBuild;
}
export function reportLink({reportUrl,commit}:TestBuild,screen:string) {
  const url=new URL(reportUrl);
  url.searchParams.set('commit',commit);url.searchParams.set('screen',screen);
  return url.href;
}
/**
 * The navy bar on every screen. The day has no name in v1's data, so dayName is shown only when known.
 * The signed-in person's name and initials open the avatar menu.
 * On a test build it also shows the commit and a Report a bug link that names the current screen.
 */
export function AppHeader({name,label,dayName,screen,onMenu}:{name?:string;label?:string;dayName?:string;screen:string;onMenu?:()=>void}) {
  const testBuild=useTestBuild();
  return <header className="app-header">
    <div className="app-header-title"><strong>Running Zone</strong>{dayName && <span>{dayName}</span>}</div>
    {name && <button className="app-header-person" aria-label={label} onClick={onMenu}><span>{name}</span><span className="avatar" aria-hidden="true">{initials(name)}</span></button>}
    {testBuild && <div className="app-header-test"><span>Test build · {testBuild.commit.slice(0,7)}</span><a href={reportLink(testBuild,screen)} target="_blank" rel="noreferrer">Report a bug</a></div>}
  </header>;
}
