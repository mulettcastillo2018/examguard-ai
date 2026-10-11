// Copia el WASM de MediaPipe (detección de rostros) a public/mediapipe para servirlo desde
// el propio sitio, sin CDN externo. Corre antes de `dev` y de `build`; la carpeta no va en
// Git (son unos 23 MB que ya vienen en node_modules).
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const from = path.join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = path.join("public", "mediapipe");
// Con SIMD y sin SIMD: el navegador elige la que soporta.
const files = ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"];

mkdirSync(to, { recursive: true });
let copied = 0;
for (const file of files) {
  const source = path.join(from, file);
  const target = path.join(to, file);
  if (existsSync(target) && statSync(target).size === statSync(source).size) continue;
  copyFileSync(source, target);
  copied += 1;
}
console.log(copied ? `MediaPipe: ${copied} archivo(s) copiado(s) a ${to}` : "MediaPipe: al día");
