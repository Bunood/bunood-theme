import {readFileSync} from 'node:fs';
import {benchPy, SITE} from './session.mjs';
const source=readFileSync(new URL('./print_logo_fixture.py',import.meta.url),'utf8');
export function benchWithPrintLogos(code) {
 const wrapped=source + `\nwith owned_print_logos(${JSON.stringify(SITE)}) as logos:\n` + code.split('\n').map(line=>'    '+line).join('\n');
 try{return benchPy(wrapped);}
 catch(error){if(String(error).includes('OWNED_LOGO_CLEANUP_FAILED'))error.fatalSuite=true;throw error;}
}
