import type { FastifyInstance } from 'fastify';
import type { Phone } from '../../src/shared/domain.js';
export interface SignedIn { token: string; phone: Phone; profile: {id: string; name: string; secret?: string} }
/**
 * The one way server tests sign people in: the owner first (starting the day if none is running),
 * then volunteers and leads by name through the Olympics password and Create profile.
 * Profile names are unique for the database's life, so a name is used once per test (each test app start empties profiles).
 */
export async function signInOwner(app: FastifyInstance, ownerPassword: string, name = 'Aisha') {
  const post = async (url: string, payload: object, token?: string) => {
    const response = await app.inject({method:'POST', url, payload, headers:token ? {authorization:`Bearer ${token}`} : {}});
    if (response.statusCode !== 200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
    return response.json();
  };
  const owner: SignedIn & {pass: string} = await post('/api/owner-sign-in', {password:ownerPassword, name, profiles:[]});
  const day = (await app.inject({url:'/api/day', headers:{authorization:`Bearer ${owner.token}`}})).json();
  const volunteer = (name: string): Promise<SignedIn> => post('/api/profiles', {pass:owner.pass, name});
  const lead = async (name: string) => {
    const signedIn = await volunteer(name);
    await post('/api/become-lead', {code:day.leadCode}, signedIn.token);
    return signedIn;
  };
  return {owner, day, pass:owner.pass, volunteer, lead};
}
