import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import findParams from './routes/findParams.js';
import balance from './routes/balance.js';
import quote from './routes/quote.js';
import txStatus from './routes/txStatus.js';
import scanToken from './routes/scanToken.js';
import verifyOft from './routes/verifyOft.js';
import bridgeParamsManual from './routes/bridgeParamsManual.js';
import { CHAINS } from './lib/chains.js';
import { rpcCall } from './lib/rpc.js';
import { cacheStats } from './lib/cache.js';

dotenv.config({ path: '../.env' });
const app = express();

// За nginx/проксі — щоб req.ip був реальним IP клієнта (для rate-limit)
app.set('trust proxy', 1);

// CORS: у ПРОДІ обмежуємо дозволені origins через ALLOWED_ORIGINS (кома-розділ).
// У DEV (змінна не задана) — відкрито, щоб не заважати локальній розробці.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? {
  origin(origin, cb) {
    // Дозволяємо запити без Origin (health-check, curl) та з whitelist
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
} : {}));

app.use(express.json());

// Простий in-memory rate-limit (без залежностей): RL_MAX запитів за RL_WINDOW_MS на IP.
// Для одного інстансу за nginx цього достатньо. Health-check не лічимо.
const RL_WINDOW_MS = Number(process.env.RL_WINDOW_MS || 15000);
const RL_MAX = Number(process.env.RL_MAX || 60);
const rlHits = new Map();
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = rlHits.get(ip);
  if (!rec || now - rec.start > RL_WINDOW_MS) {
    rlHits.set(ip, { start: now, count: 1 });
    return next();
  }
  rec.count += 1;
  if (rec.count > RL_MAX) {
    return res.status(429).json({ ok: false, error: 'Too many requests, please slow down' });
  }
  next();
});
// Періодичне прибирання застарілих записів, щоб мапа не росла
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rlHits) if (now - rec.start > RL_WINDOW_MS) rlHits.delete(ip);
}, 60000).unref();

// ДОДАТКОВІ ліміти для ВАЖКИХ ендпоінтів. Загальний ліміт вище рахує всі
// запити однаково, але їхня ціна дуже різна:
//   • scan-token   — може запустити глибокий скан логів (~200 запитів до RPC)
//   • find-params  — зазвичай дешевий (кеш + LayerZero API), але користувач
//                    цілком законно перебирає багато напрямків підряд
// Тому ліміти окремі: жорсткий на пошук токена, м'якший на перебір маршрутів.
const RL_MINUTE = 60000;
function makeLimiter(max, label) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits) if (now - rec.start > RL_MINUTE) hits.delete(ip);
  }, RL_MINUTE).unref();

  return function limiter(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || now - rec.start > RL_MINUTE) {
      hits.set(ip, { start: now, count: 1 });
      return next();
    }
    rec.count += 1;
    if (rec.count > max) {
      console.log(`[rate-limit] ${label}: заблоковано ${ip} (${rec.count} за хвилину, ліміт ${max})`);
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please wait a minute and try again.',
      });
    }
    next();
  };
}
const scanTokenLimiter = makeLimiter(Number(process.env.RL_SCAN_MAX || 15), 'scan-token');
const findParamsLimiter = makeLimiter(Number(process.env.RL_FIND_MAX || 50), 'find-params');

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Статистика кешу — щоб бачити, чи він реально працює (size/hits/misses).
app.get('/api/cache-stats', (_, res) => res.json({ ok: true, caches: cacheStats() }));

app.use('/api/find-params', findParamsLimiter, findParams);
app.use('/api/balance', balance);
app.use('/api/quote', quote);
app.use('/api/tx-status', txStatus);
app.use('/api/scan-token', scanTokenLimiter, scanToken);
app.use('/api/verify-oft', verifyOft);
app.use('/api/bridge-params-manual', bridgeParamsManual);

app.get('/api/rpc-call', async (req, res) => {
  const chain = CHAINS[req.query.chain];
  const { to, data } = req.query;
  if (!chain || !to || !data) return res.status(400).json({ ok: false, error: 'Missing params' });
  try {
    const result = await rpcCall(chain, to, data);
    res.json({ ok: true, result });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Невідомі /api-роути — чистий 404 (а не дефолтний Express). Сканери часто
// шлють POST на /api/session, /api/user/login тощо; без цього вони або падали
// в дефолтний обробник, або (з кривим JSON-тілом) віддавали 500 — а 500
// виглядає для сканера як «живий» ендпоінт і засмічує error-rate.
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

// Обробник помилок. Криве JSON-тіло (express.json кидає) = 400, помилка клієнта,
// а не 500. Відхилення CORS = 403. Решту несподіваного логуємо й віддаємо 500
// без деталей назовні.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ ok: false, error: 'Invalid request body' });
  }
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ ok: false, error: 'Origin not allowed' });
  }
  console.log('[server] unhandled error=', err?.message || err);
  res.status(500).json({ ok: false, error: 'Internal error' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '127.0.0.1', () => console.log(`[server] Backend listening on http://127.0.0.1:${PORT}`));
server.on('error', (err) => console.log('[server] listen error=', err.code, err.message));
process.on('uncaughtException', (err) => console.log('[server] uncaughtException=', err.message));
process.on('unhandledRejection', (err) => console.log('[server] unhandledRejection=', err?.message || err));
process.on('SIGINT', () => { console.log('[server] SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { console.log('[server] SIGTERM'); process.exit(0); });
