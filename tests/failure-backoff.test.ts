import { afterEach,expect,test,vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { setTimeout } from 'node:timers/promises';
import { failureBackoff,WrongAccessCode } from '../src/server/access/failures.js';
import { Refusal } from '../src/server/access/permissions.js';
vi.mock('node:timers/promises',()=>({setTimeout:vi.fn(async()=>{})}));
afterEach(()=>{vi.clearAllMocks();vi.restoreAllMocks();});

test('failure delays grow exponentially, are capped, and expire after inactivity',async()=>{
  const check=failureBackoff(),header=vi.fn(),reply={header} as unknown as FastifyReply;
  const fail=async()=>{throw new WrongAccessCode('Wrong code');};
  for(let i=0;i<5;i++) await expect(check(['ip'],reply,fail)).rejects.toMatchObject({statusCode:403});
  expect(setTimeout).not.toHaveBeenCalled();
  for(let i=0;i<8;i++) await expect(check(['ip'],reply,fail)).rejects.toMatchObject({statusCode:429});
  expect(vi.mocked(setTimeout).mock.calls.map(([delay])=>delay)).toEqual([1000,2000,4000,8000,16000,30000,30000,30000]);
  expect(header).toHaveBeenLastCalledWith('Retry-After',30);
  const count=vi.mocked(setTimeout).mock.calls.length;
  expect(await check(['ip'],reply,async()=>42)).toBe(42);
  await expect(check(['ip'],reply,async()=>{throw new Refusal(409,'Duplicate name');})).rejects.toMatchObject({statusCode:409});
  expect(setTimeout).toHaveBeenCalledTimes(count);
  vi.spyOn(Date,'now').mockReturnValue(Date.now()+15*60_000);
  await expect(check(['ip'],reply,fail)).rejects.toMatchObject({statusCode:403});
  expect(setTimeout).toHaveBeenCalledTimes(count);
});
