import { createContext,useContext,type ReactNode } from 'react';
import { ErrorCallout,Icon,Pattern,Screen } from '../races/parts.js';
import { entryBack,useScreenName } from '../shell/addresses.js';
/** What every lead screen's header needs from the app: the avatar with its menu, and where Back goes. */
export const LeadFrame=createContext<{avatar:ReactNode;onBack:()=>void}|null>(null);
/**
 * The lead header, on every lead screen: the race screen's compact bar with a back arrow naming, in gold above the
 * title, the screen it returns to: the one the lead came from, else `up` (the natural parent, for a screen reached
 * with no history). Then the title (an event as "200m · Boy Cubs" with its code tag)
 * and the avatar. It also names the screen, so a screen opened from here names it on its own back arrow.
 * The screen's `body` shares the bar's screen root; `wide` lets a card grid widen on a laptop, as on Races.
 */
export function LeadBar({title,code,up,body,wide=false}:{title:string;code?:string;up:string;body:ReactNode;wide?:boolean}) {
  const frame=useContext(LeadFrame)!,back=entryBack()??up;
  useScreenName(title);
  const header=<header className="rz-appbar rz-appbar--compact rz-appbar--race rz-appbar--lead"><Pattern/>
    <div className="rz-appbar__start">
      <button type="button" className="rz-appbar__back" aria-label={`Back to ${back}`} onClick={frame.onBack}><Icon name="chevron-left" className="rz-icon--bold"/><span>{back}</span></button>
      {/* The race bar's title: up to two lines in display type, the code tag after the last word. */}
      <div className="rz-appbar__heading"><h1>{title}</h1>{code && <> <span className="rz-code-tag">{code}</span></>}</div>
    </div>
    <div className="rz-appbar__end">{frame.avatar}</div>
  </header>;
  return <Screen screen={title} wide={wide}>{header}{body}</Screen>;
}
/**
 * A full lead screen's body while its read is on its way: "Opening…", or why the read failed. The screen passes it as
 * its LeadBar's `body`, so the header stays the same element once the read arrives (no remount, no lost focus).
 */
export const OpeningBody=({error}:{error:unknown})=><main className="rz-main">{error!==null?<ErrorCallout error={error} action="read"/>:<p className="rz-empty">Opening…</p>}</main>;
