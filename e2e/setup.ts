import { request } from '@playwright/test';
export default async function setup() {
  const api = await request.newContext({baseURL:process.env.E2E_BASE_URL});
  const response = await api.post('/api/join', {data:{code:'e2e-owner-fixture', name:'E2E Scoring'}});
  if (!response.ok()) throw new Error(await response.text());
  const {token} = await response.json();
  process.env.E2E_SCORING_TOKEN=token;
  const day = await api.get('/api/day', {headers:{authorization:`Bearer ${token}`}});
  const {dayCode,leadCode} = await day.json();
  process.env.E2E_DAY_CODE = dayCode;
  process.env.E2E_LEAD_CODE = leadCode;
  await api.dispose();
}
