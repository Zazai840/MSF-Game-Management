import { useRef,useState } from 'react';
import { legRefusal,legWarnings,type RelayTeam,type TeamList } from '../../shared/teams.js';
/** What a team's Save sends: the four boxes in leg order (null when empty) and the wristbands whose warnings were kept. */
export interface TeamDraft { legs:Array<number|null>; keptWarnings:number[] }
/**
 * A team's four leg boxes being typed (and put in another leg order by a grip), for any screen to draw: a number already in this team or another team of the
 * relay is refused as it is typed (Fix number only); one that looks wrong (unknown, another Section's, in another
 * relay) shows once its box is left, with Fix number or Keep. `ready` once something is typed and each is fixed or kept.
 */
export function useTeamDraft(team:RelayTeam|null,relay:TeamList,relays:readonly TeamList[]) {
  const [boxes,setBoxes]=useState(()=>(team?.legs.map(leg=>leg.wristband===null?'':String(leg.wristband))||['','','','']));
  /** Each box's own key, in leg order, so a box keeps its key (and its row) when it is dragged to another leg. */
  const [keys,setKeys]=useState([0,1,2,3]);
  const [kept,setKept]=useState(()=>team?.legs.flatMap(leg=>leg.wristband!==null && leg.warnings.length?[leg.wristband]:[])||[]);
  /** The box being typed in: its warnings wait until it is left. */
  const [typing,setTyping]=useState<number|null>(null);
  const inputs=useRef<Array<HTMLInputElement|null>>([]);
  const legs=boxes.map(box=>box===''?null:Number(box));
  // Each box is checked against the boxes before it, so only the later of two equal numbers is refused.
  const refusals=legs.map((_,index)=>legRefusal(relay.teams,team?.id??null,legs.slice(0,index+1),index));
  const warnings=legs.map((number,index)=>number===null || refusals[index] || kept.includes(number)?[]:legWarnings(number,relay,relays));
  const amber=(index:number)=>Boolean(refusals[index]) || (typing!==index && warnings[index].length>0);
  return {boxes,keys,legs,refusals,warnings,amber,inputs,
    /** The boxes in a new leg order (by key), as a grip drag leaves them: only the draft changes until Save. */
    move:(next:number[])=>{setBoxes(next.map(key=>boxes[keys.indexOf(key)]));setKeys(next);},
    ready:legs.some(number=>number!==null) && refusals.every(refusal=>!refusal) && warnings.every(list=>!list.length),
    type:(index:number,digits:string)=>setBoxes(current=>current.map((value,at)=>at===index?digits:value)),
    focus:(index:number|null)=>setTyping(index),
    fix:(index:number)=>{setBoxes(current=>current.map((box,at)=>at===index?'':box));inputs.current[index]?.focus();},
    keep:(index:number)=>setKept(current=>[...current,legs[index]!]),
    draft:():TeamDraft=>({legs,keptWarnings:kept.filter(number=>legs.includes(number))})};
}
