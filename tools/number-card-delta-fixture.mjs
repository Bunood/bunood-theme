import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { benchPy, SITE } from './session.mjs';
const source = readFileSync(new URL('./number_card_delta_fixture.py', import.meta.url), 'utf8');
const literal = value => `json.loads(${JSON.stringify(JSON.stringify(value))})`;
export async function withNumberCardDelta(run) {
 const token = randomUUID().replaceAll('-', '');
 const output = benchPy(source + `\nprint("BND_DELTA=" + json.dumps(create_fixture(${literal(token)}, ${literal(SITE)})))\n`);
 const line = output.split('\n').find(line => line.startsWith('BND_DELTA='));
 if (!line) { const error = new Error('Native delta fixture did not return ownership receipt'); error.fatalSuite = true; throw error; }
 const receipt = JSON.parse(line.slice('BND_DELTA='.length));
 let failure;
 try { return await run({route: '/desk/dashboard-view/' + encodeURIComponent(receipt.dashboard), receipt}); }
 catch (error) { failure = error; throw error; }
 finally {
  try { benchPy(source + `\nclear_fixture(${literal(receipt)}, ${literal(SITE)})\nprint("delta fixture removed")\n`); }
  catch (error) { const fatal = failure || error; fatal.fatalSuite = true; if(failure) fatal.cleanupError = error; throw fatal; }
 }
}
