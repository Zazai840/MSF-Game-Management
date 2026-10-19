import type { FastifyInstance } from 'fastify';
// Throwaway spike for "Does a live event stream reach phones through Railway without delay?" (#98). Never merged.
// Stream: one event a second for 30 s (buffering shows as bursts), then heartbeats only, with data at 6, 9 and 12 min
// (6 min proves heartbeats beat Railway's 5-min idle cap), then "bye". ?plain=1 drops X-Accel-Buffering, ?hb=0 drops heartbeats.
export function spikeSseRoutes(app: FastifyInstance) {
  app.get('/api/spike/stream', (request, reply) => {
    const query = request.query as {plain?: string; hb?: string; minutes?: string};
    const heartbeatSeconds = query.hb === undefined ? 15 : Number(query.hb);
    const minutes = Number(query.minutes) || 12;
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      ...(query.plain ? {} : {'X-Accel-Buffering': 'no'})
    });
    const started = Date.now();
    let seq = 0;
    const send = (event: string) => reply.raw.write(`event: ${event}\nid: ${++seq}\ndata: ${JSON.stringify({seq, sentAt: Date.now(), elapsed: Date.now() - started})}\n\n`);
    send('data');
    const timers: NodeJS.Timeout[] = [];
    const fast = setInterval(() => send('data'), 1000);
    timers.push(setTimeout(() => clearInterval(fast), 30_000));
    for (const minute of [6, 9, 12].filter(m => m <= minutes)) timers.push(setTimeout(() => send('data'), minute * 60_000));
    const heartbeat = heartbeatSeconds > 0 ? setInterval(() => reply.raw.write(`: hb ${Date.now() - started}\n\n`), heartbeatSeconds * 1000) : undefined;
    timers.push(setTimeout(() => { send('bye'); reply.raw.end(); }, minutes * 60_000 + 1000));
    reply.raw.on('close', () => {
      clearInterval(fast); clearInterval(heartbeat); timers.forEach(clearTimeout);
      console.log(`spike stream closed after ${Math.round((Date.now() - started) / 1000)} s, ${seq} events`);
    });
  });
  app.get('/api/spike/page', (_request, reply) => reply.type('text/html').send(page));
}
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SSE spike</title><style>body{font:15px system-ui;margin:16px}pre{white-space:pre-wrap;font-size:12px}button{font-size:16px;padding:8px 12px;margin:4px 4px 0 0}</style></head><body>
<h1>SSE spike</h1>
<div><button onclick="run('')">Start</button><button onclick="run('plain=1')">Start without X-Accel-Buffering</button><button onclick="navigator.clipboard.writeText(document.getElementById('log').textContent)">Copy</button></div>
<p id="summary"></p><pre id="log"></pre>
<script>
const log = document.getElementById('log'), summary = document.getElementById('summary');
const line = s => { log.textContent = s + '\\n' + log.textContent; };
async function run(query) {
  log.textContent = '';
  const page = performance.getEntriesByType('navigation')[0];
  line('page protocol: ' + (page && page.nextHopProtocol) + ' | ' + navigator.userAgent);
  const url = '/api/spike/stream' + (query ? '?' + query : '');
  const t0 = performance.now(); let last = t0, minOffset = Infinity, heartbeats = 0, events = 0, fastGaps = [];
  const at = () => ((performance.now() - t0) / 1000).toFixed(1) + 's';
  try {
    const response = await fetch(url, {cache: 'no-store'});
    line(at() + ' headers ' + response.status);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      buffer += value;
      let cut;
      while ((cut = buffer.indexOf('\\n\\n')) >= 0) {
        const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
        const now = performance.now(), gap = Math.round(now - last); last = now;
        if (block.startsWith(':')) { heartbeats++; line(at() + ' heartbeat (gap ' + gap + ' ms)'); continue; }
        const data = JSON.parse(block.split('\\n').find(l => l.startsWith('data: ')).slice(6));
        const offset = Date.now() - data.sentAt; minOffset = Math.min(minOffset, offset); events++;
        if (data.seq > 1 && data.elapsed <= 30000) fastGaps.push(gap);
        line(at() + ' event ' + data.seq + ' gap ' + gap + ' ms, extra lag ' + (offset - minOffset) + ' ms');
      }
      summary.textContent = 'events ' + events + ', heartbeats ' + heartbeats + ', 1-a-second gaps min ' + Math.min(...fastGaps) + ' / max ' + Math.max(...fastGaps) + ' ms, open ' + at();
    }
    line(at() + ' stream ended by server');
  } catch (error) { line(at() + ' stream failed: ' + error); }
  const entry = performance.getEntriesByType('resource').filter(e => e.name.includes('/api/spike/stream')).pop();
  line('stream protocol: ' + (entry && entry.nextHopProtocol));
}
</script></body></html>`;
