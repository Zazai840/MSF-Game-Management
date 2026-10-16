const two=(value:number)=>String(value).padStart(2,'0');
/** Every time on screen, as a 24-hour hh:mm the same on every phone ("21:05"). */
export const clock=(at:Date|string=new Date())=>{const date=new Date(at);return `${two(date.getHours())}:${two(date.getMinutes())}`;};
/** hh:mm:ss, for saved versions that can land in the same minute. */
export const clockWithSeconds=(at:Date|string)=>`${clock(at)}:${two(new Date(at).getSeconds())}`;
