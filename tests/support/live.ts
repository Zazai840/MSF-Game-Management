import { get,type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createGunzip } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { frameData,splitFrames } from '../../src/shared/live.js';
/** Each frame's JSON in the stream's text so far. */
export const frames=<T>(text:string)=>splitFrames(text).frames.map(frameData).filter(data=>data!==null).map(data=>JSON.parse(data) as T);
/** The races list stream as that phone, read as raw HTTP so the test sees the wire: the text it decodes to so far, and a wait for more. */
export async function openRaces(app:FastifyInstance,token:string,acceptEncoding?:string) {
  const {port}=app.server.address() as AddressInfo;
  const response=await new Promise<IncomingMessage>((resolve,reject)=>get({host:'127.0.0.1',port,path:'/api/live/races',headers:{authorization:`Bearer ${token}`,...(acceptEncoding?{'accept-encoding':acceptEncoding}:{})}},resolve).on('error',reject));
  const body=response.headers['content-encoding']==='gzip'?response.pipe(createGunzip()):response;
  let text='';
  body.setEncoding('utf8').on('data',(chunk:string)=>{text+=chunk;});
  const ended=new Promise(resolve=>body.on('end',resolve));
  // Prompt means nothing waits in a compressor: each frame decodes as soon as it is sent.
  const until=async(seen:(text:string)=>boolean)=>{
    for(const start=Date.now();!seen(text);await new Promise(resolve=>setTimeout(resolve,10))) if(Date.now()-start>2000) throw new Error(`Waited 2 s for the stream, got: ${text}`);
  };
  return {headers:response.headers,text:()=>text,until,ended};
}
