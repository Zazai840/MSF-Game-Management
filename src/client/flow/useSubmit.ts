import { useState } from 'react';
import { failureLine } from '../../shared/request-failure.js';
/** Runs one request from a form or button, keeping the busy state and the refusal for the form that sent it. */
export function useSubmit(initialError='') {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(initialError);
  async function submit(send:()=>Promise<void>,onRefused?:(error:unknown)=>void) {
    setBusy(true);setError('');
    try {await send();}
    catch(error) {setError(failureLine(error,'read'));onRefused?.(error);}
    finally {setBusy(false);}
  }
  return {busy,error,submit,setError};
}
