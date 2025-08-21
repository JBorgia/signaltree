import fs from 'fs';
import zlib from 'zlib';

const PATH = 'dist/packages/core/fesm2022/signaltree-core.mjs';
const BASELINE = 9412; // bytes gzipped

if (!fs.existsSync(PATH)) {
  console.error(`Missing artifact: ${PATH}`);
  process.exit(2);
}

const buf = fs.readFileSync(PATH);
const gz = zlib.gzipSync(buf).length;

console.log(`core artifact bytes: ${buf.length}, gzipped: ${gz}`);

if (gz > BASELINE) {
  console.error(`Size check failed: gzipped ${gz} > baseline ${BASELINE}`);
  process.exit(1);
}

console.log('Size check passed');
process.exit(0);
