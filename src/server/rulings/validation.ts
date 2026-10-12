import { Refusal } from '../access/permissions.js';
export function rulingDetails(body:unknown,requiredComment:boolean) {
  if(!body || typeof body!=='object' || Array.isArray(body)) throw new Refusal(400,'Enter the ruling details');
  const value=body as Record<string,unknown>;
  if(value.comment!==undefined && typeof value.comment!=='string') throw new Refusal(400,'Enter a comment');
  const comment=typeof value.comment==='string'?value.comment.trim().replace(/\s+/g,' '):null;
  if(requiredComment && !comment) throw new Refusal(400,'Enter a comment explaining this ruling');
  if(comment && comment.length>1000) throw new Refusal(400,'Keep the comment within 1000 characters');
  return {value,comment:comment||null};
}
