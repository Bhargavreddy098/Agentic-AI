// @ts-check
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
/** Explicit environment > protected runtime file > general non-runtime configuration. */
export function loadRuntimeEnvironment({env=process.env,directory=fileURLToPath(new URL('../../',import.meta.url))}={}) {
 for(const name of ['.env.runtime','.env']){
  let content;try{content=readFileSync(resolve(directory,name),'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
  for(const [key,value] of Object.entries(parseEnv(content)))if(env[key]===undefined)env[key]=value;
 }
}
