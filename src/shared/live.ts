/** Splits Server-Sent Events text into its complete frames and the unfinished rest. */
export function splitFrames(buffer:string):{frames:string[];rest:string} {
  const frames=buffer.split('\n\n');
  return {rest:frames.pop()!,frames};
}
/** A frame's data line, or null for a comment such as the heartbeat. The server sends one JSON line per frame. */
export const frameData=(frame:string)=>frame.split('\n').find(line=>line.startsWith('data: '))?.slice(6)??null;
/** A phone keeps the snapshot it holds unless the new one is from the same day revision or later. */
export const newerSnapshot=<T extends {revision:number}>(held:T|null,next:T)=>!held || next.revision>=held.revision;
