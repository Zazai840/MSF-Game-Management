import { useState } from 'react';
const failure=(error:unknown)=>error instanceof Error ? error.message : 'Could not connect - please try again';
/** Runs one request from a form or button, keeping the busy state and the refusal for the form that sent it. */
export function useSubmit(initialError='') {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(initialError);
  async function submit(send:()=>Promise<void>,onRefused?:(error:unknown)=>void) {
    setBusy(true);setError('');
    try {await send();}
    catch(error) {setError(failure(error));onRefused?.(error);}
    finally {setBusy(false);}
  }
  return {busy,error,submit,setError};
}
