import { useState } from 'react';
import type { Phone } from '../../shared/domain.js';
import { api, phoneStorage } from '../api.js';
import { initials } from '../shell/AppHeader.js';
import { ActionBar } from '../flow/ActionBar.js';
import './access.css';
/** Your profile screen from the header: full name, today's role, Back and Sign out, the same for every role. */
export function YourProfile({phone,onBack}:{phone:Phone;onBack:()=>void}) {
  const [confirming,setConfirming]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function signOut() {
    setBusy(true);setError('');
    try {await api('sign-out',{});phoneStorage.signOut();}
    catch(error) {setError(error instanceof Error ? error.message : 'Could not connect - please try again');setBusy(false);}
  }
  return <section className="sign-in"><h1>Your profile</h1>
    <section className="your-profile" aria-label="Your profile">
      <span className="avatar" aria-hidden="true">{initials(phone.name)}</span>
      <span className="your-profile-text"><span className="profile-name">{phone.name}</span><span className="badge">{phone.level}</span></span>
    </section>
    {confirming && <p className="calm-note">Sign out? You'll need the Olympics password to get back in.</p>}
    {error && <p role="alert">{error}</p>}
    {!confirming && <button type="button" className="button-quiet sign-in-back" onClick={onBack}>Back</button>}
    <ActionBar>{confirming
      ? <><button className="button-secondary" disabled={busy} onClick={()=>setConfirming(false)}>Cancel</button><button disabled={busy} onClick={()=>void signOut()}>{busy ? 'Signing out…' : 'Yes, sign out'}</button></>
      : <button className="button-secondary" onClick={()=>setConfirming(true)}>Sign out</button>}</ActionBar>
  </section>;
}
