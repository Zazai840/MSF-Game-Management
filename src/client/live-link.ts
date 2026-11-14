/**
 * A live stream's link, as one state: `connecting` (a stream is opening), `live` (it is open), `retrying` (it failed or
 * went silent, and waits to try again), `paused` (the page is hidden, so no stream is kept) and `refused` (the server
 * said no, so it does not try again by itself). `failures` counts the tries since the last newer snapshot, for the
 * wait before the next one. `note` is what the screen says about it: trouble reaching the server, or the refusal.
 * `gapped`: a frame could not be applied and no changes frame has applied since, so the whole snapshot each reconnect
 * brings does not count as newer: a server that keeps sending such frames is backed off like any failure.
 */
export interface Link { state:'connecting'|'live'|'retrying'|'paused'|'refused'; failures:number; note:{trouble:'lost'|'unreachable'}|{refusal:string}|null; gapped:boolean }
/**
 * What happens to a link. `opened`: the stream answered. `fresh`: it brought a newer snapshot; `applied`: a changes frame
 * was applied to the one held. `gap`: a frame could not be applied (the first reconnects at once). `ended`: the server
 * closed it as planned. `lost`: it failed (`held`: the screen holds a snapshot). `silent`: nothing came for too long.
 * `refused`: the server said no, in `line` (null when the phone is already sent to sign in). `retry`: the wait is over.
 * `hidden` / `shown`: the page. `restart`: the signal went or came back.
 */
export type LinkEvent={type:'opened'|'fresh'|'applied'|'gap'|'ended'|'silent'|'retry'|'hidden'|'shown'|'restart'}|{type:'lost';held:boolean}|{type:'refused';line:string|null};
export const linkStart=(hidden:boolean):Link=>({state:hidden?'paused':'connecting',failures:0,note:null,gapped:false});
/** The wait before reconnecting after a failure or silence: 1 s, doubling up to 30 s. */
const backoff=(failures:number)=>Math.min(30_000,1000*2**(failures-1));
/**
 * The link after an event, with what the stream's owner must do: `reconnect` in that many milliseconds (null: not at
 * all) and `drop` the stream it has open.
 */
export function linkNext(link:Link,event:LinkEvent):{link:Link;reconnect:number|null;drop:boolean} {
  const stay={link,reconnect:null,drop:false},now=(drop:boolean)=>({link:{...link,state:'connecting' as const},reconnect:0,drop});
  if(event.type==='hidden') return {link:{...link,state:'paused'},reconnect:null,drop:true};
  // A paused link keeps no stream: only the page being shown starts one.
  if(link.state==='paused') return event.type==='shown'?now(false):stay;
  switch(event.type) {
    case 'shown': return link.state==='connecting' || link.state==='live'?stay:now(false);
    case 'restart': return now(true);
    case 'retry': return link.state==='retrying'?{...stay,link:{...link,state:'connecting'}}:stay;
    case 'opened': return {...stay,link:{...link,state:'live',note:null}};
    case 'fresh': return link.gapped?stay:{...stay,link:{...link,failures:0}};
    case 'applied': return {...stay,link:{...link,failures:0,gapped:false}};
    case 'gap': {
      if(!link.gapped) return {link:{...link,state:'connecting',gapped:true},reconnect:0,drop:true};
      const failures=link.failures+1;
      return {link:{...link,state:'retrying',failures},reconnect:backoff(failures),drop:true};
    }
    case 'ended': return now(false);
    case 'refused': return {...stay,link:{...link,state:'refused',note:event.line===null?link.note:{refusal:event.line}}};
    case 'lost': case 'silent': {
      const failures=link.failures+1;
      return {link:{...link,state:'retrying',failures,note:event.type==='lost'?{trouble:event.held?'lost':'unreachable'}:link.note},reconnect:backoff(failures),drop:false};
    }
  }
}
/** What the screen says about the link: a phone holding a snapshot keeps showing it, with a calm note that it is reconnecting. */
export const linkLine=({note}:Link)=>note===null?'':'refusal' in note?note.refusal:note.trouble==='lost'?'Connection lost - trying again':'Could not connect - trying again';
