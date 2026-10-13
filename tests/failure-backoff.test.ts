import { afterEach,expect,test,vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { failureBackoff,WrongAccessCode } from '../src/server/access/failures.js';
import { Refusal } from '../src/server/access/permissions.js';
afterEach(()=>{vi.clearAllMocks();vi.restoreAllMocks();});

test('failure backoff blocks code checks, grows exponentially, is capped, and expires after inactivity',async()=>{
  let now=Date.now();
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  const check=failureBackoff(),header=vi.fn(),reply={header} as unknown as FastifyReply;
  const fail=vi.fn(async()=>{throw new WrongAccessCode('Wrong code');}),succeed=vi.fn(async()=>42);
  for(let i=0;i<5;i++) await expect(check(['ip'],reply,fail)).rejects.toMatchObject({statusCode:403});
  expect(header).not.toHaveBeenCalled();
  for(const wait of [1000,2000,4000,8000,16000,30000,30000,30000]) {
    await expect(check(['ip'],reply,fail)).rejects.toMatchObject({statusCode:429});
    expect(header).toHaveBeenLastCalledWith('Retry-After',wait/1000);
    const count=fail.mock.calls.length;
    await expect(check(['ip'],reply,succeed)).rejects.toMatchObject({statusCode:429});
    expect(succeed).not.toHaveBeenCalled();
    now+=wait/2;
    await Promise.all(Array.from({length:3},()=>expect(check(['ip'],reply,fail)).rejects.toMatchObject({statusCode:429})));
    expect(fail).toHaveBeenCalledTimes(count);
    expect(header).toHaveBeenLastCalledWith('Retry-After',Math.ceil(wait/2000));
    now+=wait/2;
  }
  expect(fail).toHaveBeenCalledTimes(13);
  expect(await check(['ip'],reply,succeed)).toBe(42);
  await expect(check(['ip'],reply,async()=>{throw new Refusal(409,'Duplicate name');})).rejects.toMatchObject({statusCode:409});
  now+=15*60_000;
  await expect(check(['ip'],reply,fail)).rejects.toMatchObject({statusCode:403});
  expect(fail).toHaveBeenCalledTimes(14);
});

test('backoff checks every key and allows unrelated keys',async()=>{
  let now=Date.now();
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  const check=failureBackoff(),header=vi.fn(),reply={header} as unknown as FastifyReply;
  const fail=vi.fn(async()=>{throw new WrongAccessCode('Wrong code');}),succeed=vi.fn(async()=>42);
  for(let i=0;i<6;i++) await check(['ip'],reply,fail).catch(()=>{});
  now+=500;
  for(let i=0;i<6;i++) await check(['phone'],reply,fail).catch(()=>{});
  now+=500;
  for(const keys of [['ip','phone'],['phone','ip']]) {
    await expect(check(keys,reply,fail)).rejects.toMatchObject({statusCode:429});
    expect(header).toHaveBeenLastCalledWith('Retry-After',1);
  }
  expect(fail).toHaveBeenCalledTimes(12);
  expect(await check(['other'],reply,succeed)).toBe(42);
  now+=500;
  expect(await check(['ip','phone'],reply,succeed)).toBe(42);
});
