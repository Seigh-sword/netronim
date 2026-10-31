import { readFile, writeFile, mkdir } from 'node:fs/promises';
import wabtFactory from 'wabt';
const wabt = await wabtFactory();
await mkdir('public/wasm', { recursive: true });
await mkdir('public/examples', { recursive: true });
for (const name of ['prism','pulse']) {
  const source = await readFile(`wasm/${name}.wat`, 'utf8');
  const module = wabt.parseWat(`${name}.wat`, source, { simd: false });
  module.resolveNames(); module.validate();
  const { buffer } = module.toBinary({ write_debug_names: false });
  await writeFile(`public/wasm/${name}.wasm`, buffer); module.destroy();
  console.log(`Built ${name}.wasm (${buffer.length} bytes)`);
}
