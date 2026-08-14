/**
 * One-off encoding probe for customerService.js (debug session fb3079).
 * Run: node scripts/debug-check-customerService-encoding.js
 */
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'debug-fb3079.log');
const TARGET = path.join(__dirname, '..', 'src', 'services', 'customerService.js');

function appendLog(payload) {
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
}

const buf = fs.readFileSync(TARGET);
const first8 = Array.from(buf.slice(0, 8));
const hex = first8.map((b) => b.toString(16).padStart(2, '0')).join(' ');
const hasUtf8Bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
const hasUtf16LeBom = buf[0] === 0xff && buf[1] === 0xfe;
const hasUtf16BeBom = buf[0] === 0xfe && buf[1] === 0xff;
const startsWithImport =
  buf.slice(0, 6).toString('utf8') === 'import' ||
  (hasUtf8Bom && buf.slice(3, 9).toString('utf8') === 'import');

const ts = Date.now();
const base = {
  sessionId: 'fb3079',
  runId: process.env.DEBUG_RUN_ID || 'pre-fix',
  location: 'scripts/debug-check-customerService-encoding.js',
  timestamp: ts,
};

// H-A: UTF-8 BOM before "import"
appendLog({
  ...base,
  hypothesisId: 'A',
  message: 'UTF-8 BOM check',
  data: { hasUtf8Bom, hex, startsWithImport },
});

// H-B: UTF-16 BOM / wrong encoding
appendLog({
  ...base,
  hypothesisId: 'B',
  message: 'UTF-16 BOM check',
  data: { hasUtf16LeBom, hasUtf16BeBom, hex },
});

// H-C: leading control / null bytes
appendLog({
  ...base,
  hypothesisId: 'C',
  message: 'Leading control chars',
  data: {
    firstByte: buf[0],
    isNull: buf[0] === 0,
    isControl: buf[0] < 0x20 && buf[0] !== 0x09 && buf[0] !== 0x0a && buf[0] !== 0x0d,
    hex,
  },
});

// H-D: Babel parse probe
let babelError = null;
try {
  require('@babel/core').parseSync(fs.readFileSync(TARGET, 'utf8'), {
    sourceType: 'module',
    plugins: [],
  });
  appendLog({
    ...base,
    hypothesisId: 'D',
    message: 'Babel parseSync',
    data: { ok: true },
  });
} catch (e) {
  babelError = { name: e.name, message: e.message, loc: e.loc };
  appendLog({
    ...base,
    hypothesisId: 'D',
    message: 'Babel parseSync',
    data: { ok: false, error: babelError },
  });
}

console.log('Wrote encoding probe to', LOG_PATH);
console.log({ hex, hasUtf8Bom, hasUtf16LeBom, babelError: babelError?.message ?? 'ok' });
