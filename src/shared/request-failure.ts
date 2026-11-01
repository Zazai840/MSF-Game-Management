/** A request the server answered with a refusal: its status, its message (the reason, in words) and its body. */
export class ApiFailure extends Error { constructor(public status: number, message: string, public body: {message?:string;reason?:string;taken?:boolean;gone?:boolean} = {}) { super(message); } }
/** A request from before this phone's session changed (a new day, a sign-out): its answer no longer applies. */
export class StaleRequest extends Error {constructor(){super('Please refresh');}}
/**
 * The words for a failed request, on every screen (race steps and lead screens alike): "Could not connect - try
 * again" when it never reached the app (no network, the host's own page, or the host's 502-504 while the app is
 * down); for a refused save "Not saved - try again" then the server's reason (none on a 500, whose reason is only
 * "something went wrong"); for any other refusal (`read`: a read, a check, a download, a lead code) the server's
 * reason alone, which already says what to do.
 */
export function failureLine(failure:unknown,action:'read'|'save') {
  if(failure instanceof StaleRequest) return failure.message;
  const answer=failure instanceof ApiFailure && failure.status<=500 && failure.body.message?failure:null;
  if(!answer || answer.status===500 && action==='read') return 'Could not connect - try again';
  if(action==='read') return answer.body.message!;
  return answer.status===500?'Not saved - try again':`Not saved - try again. ${answer.body.message}`;
}
