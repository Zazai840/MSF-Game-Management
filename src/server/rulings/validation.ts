import { Refusal } from '../access/permissions.js';
import { changeReasons,type ChangeReason } from '../../shared/rulings.js';
import { noPlaceFreeLine,placeFree } from '../../shared/finals.js';
export function rulingDetails(body:unknown,requiredComment:boolean) {
  if(!body || typeof body!=='object' || Array.isArray(body)) throw new Refusal(400,'Enter the ruling details');
  const value=body as Record<string,unknown>;
  if(value.comment!==undefined && typeof value.comment!=='string') throw new Refusal(400,'Enter a comment');
  const comment=typeof value.comment==='string'?value.comment.trim().replace(/\s+/g,' '):null;
  if(requiredComment && !comment) throw new Refusal(400,'Enter a comment explaining this ruling');
  if(comment && comment.length>1000) throw new Refusal(400,'Keep the comment within 1000 characters');
  return {value,comment:comment||null};
}
/** A final's line-up change's reason as sent ("Why the change?"): one of `changeReasons` ("Wrong number" only where `wrongNumber`), its text tidied, and required for Other. */
export function requireChangeReason(sent:unknown,wrongNumber:boolean):ChangeReason {
  const value=(sent && typeof sent==='object'?sent:{}) as {reason?:unknown;text?:unknown};
  const reason=changeReasons.find(item=>item===value.reason && (wrongNumber || item!=='Wrong number'));
  if(!reason) throw new Refusal(400,'Choose why the change');
  const text=typeof value.text==='string'?value.text.trim().replace(/\s+/g,' '):'';
  if(reason==='Other' && !text) throw new Refusal(400,'Write why for Other');
  if(text.length>1000) throw new Refusal(400,'Keep the comment within 1000 characters');
  return {reason,text:text||null};
}
/**
 * A final's line-up changed by hand at its start line, after the runner or team tapped or typed is checked: an add
 * ("+ Runner", "+ Team", a team typed there) needs a free place, then every change needs "Why the change?" (Wrong
 * number only on a replace or a leg change). One order whichever way the change comes, so each refusal is the same.
 */
export function requireFinalChange(final:Parameters<typeof placeFree>[0],sent:unknown,add:boolean):ChangeReason {
  if(add && !placeFree(final)) throw new Refusal(409,noPlaceFreeLine);
  return requireChangeReason(sent,!add);
}
