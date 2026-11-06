const test = require('node:test');
const assert = require('node:assert/strict');
const { unneeded } = require('./win-prune.cjs');

test('sobran mapas, TypeScript, builds de navegador, fuentes C/C++ y binarios de otras plataformas', () => {
  for (const rel of [
    'zod/lib/index.js.map',
    'zod/lib/index.d.ts',
    '@supabase/auth-js/src/GoTrueClient.ts',
    '@modelcontextprotocol/sdk/dist/esm/types.d.mts',
    '@xenova/transformers/dist/transformers.min.js',
    '@xenova/transformers/dist/ort-wasm-simd.wasm',
    'onnxruntime-web/dist/ort-wasm-simd.wasm',
    'onnxruntime-web/dist/ort.min.js',
    'onnxruntime-web/dist/ort-web.js',
    'onnxruntime-node/bin/napi-v3/darwin/arm64/libonnxruntime.1.14.0.dylib',
    'onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node',
    'onnxruntime-node/bin/napi-v3/win32/arm64/onnxruntime.dll',
    'node-pty/prebuilds/darwin-arm64/spawn-helper',
    'node-pty/prebuilds/win32-arm64/pty.node',
    'node-pty/src/win/conpty.cc',
    'sharp/src/pipeline.cc',
    '@azure/msal-browser/dist/index.mjs',
  ]) assert.equal(unneeded(rel), true, rel);
});

test('se queda lo que SIA carga en Windows x64', () => {
  for (const rel of [
    'zod/lib/index.js',
    '@xenova/transformers/src/transformers.js',
    'onnxruntime-web/dist/ort-web.node.js',
    'onnxruntime-web/dist/ort-wasm-threaded.js',
    'onnxruntime-node/bin/napi-v3/win32/x64/onnxruntime_binding.node',
    'onnxruntime-node/bin/napi-v3/win32/x64/onnxruntime.dll',
    'node-pty/prebuilds/win32-x64/pty.node',
    'node-pty/lib/index.js',
    'sharp/build/Release/sharp-win32-x64.node',
    'sharp/vendor/8.14.5/win32-x64/lib/libvips-42.dll',
    '@azure/msal-node/dist/index.cjs',
    'snowflake-sdk/package.json',
  ]) assert.equal(unneeded(rel), false, rel);
});
