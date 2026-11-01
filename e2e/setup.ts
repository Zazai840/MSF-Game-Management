import { request } from '@playwright/test';
import { labelDay } from './fixtures.js';
/** Signs the owner in as a lead through the API with the owner password, starting the day, reads its codes and sets This day. */
export default async function setup() {
  const api = await request.newContext({baseURL:process.env.E2E_BASE_URL});
  const response = await api.post('/api/owner-sign-in', {data:{password:'e2e-owner-fixture', name:'E2E Owner', profiles:[]}});
  if (!response.ok()) throw new Error(await response.text());
  const {token,profile} = await response.json();
  process.env.E2E_OWNER_TOKEN=token;
  // Kept so a spec that changes the Olympics password (which ends every session) can sign the owner back in.
  process.env.E2E_OWNER_PROFILE=JSON.stringify(profile);
  const day = await api.get('/api/day', {headers:{authorization:`Bearer ${token}`}});
  if (!day.ok()) throw new Error(await day.text());
  const {leadCode,olympicsPassword} = await day.json();
  process.env.E2E_LEAD_CODE = leadCode;
  process.env.E2E_OLYMPICS_PASSWORD = olympicsPassword;
  // The day export needs This day's Region and Day.
  await labelDay(api, token);
  await api.dispose();
}
