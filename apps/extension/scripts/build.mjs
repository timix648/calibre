// Bundles the extension into dist/: esbuild for the three scripts, a copy of the static files, and generated PNG icons.
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "icons"), { recursive: true });

await build({
  entryPoints: { content: join(root, "src/content.ts"), background: join(root, "src/background.ts"), options: join(root, "src/options.ts"), popup: join(root, "src/popup.ts") },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: true,
  sourcemap: false,
  logLevel: "warning",
});

await cp(join(root, "static"), dist, { recursive: true });

// Icons: a dark rounded square with a teal ring and dot (the CALIBRE mark), drawn per pixel and written as PNG.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

function png(size) {
  // The CALIBRE mark, the same geometry as apps/web/app/icon.svg (a 64-unit box): two lit drops on a dark rounded square.
  const bg = [10, 12, 16];
  const light = [196, 253, 243], mid = [94, 234, 212], deep = [15, 122, 106];
  const drops = [{ x: 27, y: 38, r: 19 }, { x: 50, y: 15, r: 8.5 }];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const shade = (d, px, py) => {
    // Radial gradient centred up and to the left of the drop, like the SVG's (cx .32, cy .3, r .85 of the box).
    const gx = d.x - d.r + 0.64 * d.r, gy = d.y - d.r + 0.6 * d.r;
    const t = Math.min(1, Math.hypot(px - gx, py - gy) / (1.7 * d.r));
    return t < 0.42 ? mix(light, mid, t / 0.42) : mix(mid, deep, (t - 0.42) / 0.58);
  };
  const highlight = (d, px, py) => {
    const hx = d.x - 0.37 * d.r, hy = d.y - 0.42 * d.r, a = (-40 * Math.PI) / 180;
    const ux = (px - hx) * Math.cos(a) + (py - hy) * Math.sin(a), uy = -(px - hx) * Math.sin(a) + (py - hy) * Math.cos(a);
    return (ux / (0.29 * d.r)) ** 2 + (uy / (0.17 * d.r)) ** 2 <= 1;
  };
  const rim = (d, px, py) => {
    const dist = Math.hypot(px - d.x, py - d.y), ang = Math.atan2(py - d.y, px - d.x);
    return Math.abs(dist - 0.81 * d.r) < 0.06 * d.r + 0.6 && ang > 0.35 && ang < 1.31;
  };
  const sample = (px, py) => {
    // Rounded-square mask, then the drops over it.
    const ax = Math.abs(px - 32) / 32, ay = Math.abs(py - 32) / 32, r = 0.3;
    const cx = Math.max(ax - (1 - r), 0), cy = Math.max(ay - (1 - r), 0);
    if (Math.hypot(cx, cy) > r) return null;
    for (const d of [drops[1], drops[0]]) {
      if (Math.hypot(px - d.x, py - d.y) > d.r) continue;
      let c = shade(d, px, py);
      if (rim(d, px, py)) c = mix(c, [255, 255, 255], 0.45);
      if (highlight(d, px, py)) c = mix(c, [255, 255, 255], 0.92);
      return c;
    }
    return bg;
  };
  const rows = [];
  const N = 4;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
        const c = sample(((x + (sx + 0.5) / N) / size) * 64, ((y + (sy + 0.5) / N) / size) * 64);
        if (!c) continue;
        R += c[0]; G += c[1]; B += c[2]; A++;
      }
      const o = 1 + x * 4;
      if (A) { row[o] = Math.round(R / A); row[o + 1] = Math.round(G / A); row[o + 2] = Math.round(B / A); }
      row[o + 3] = Math.round((A / (N * N)) * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const size of [16, 48, 128]) await writeFile(join(dist, "icons", `icon${size}.png`), png(size));

// Check the manifest and that every file it names was produced.
const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
const named = [
  manifest.background?.service_worker, manifest.options_ui?.page,
  ...(manifest.content_scripts ?? []).flatMap((c) => c.js ?? []),
  ...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {}),
];
const missing = named.filter((f) => !existsSync(join(dist, f)));
if (manifest.manifest_version !== 3 || missing.length > 0) {
  console.error(`manifest problem: version ${manifest.manifest_version}, missing ${missing.join(", ") || "nothing"}`);
  process.exit(1);
}
console.log(`built ${dist} (manifest v${manifest.manifest_version}, ${named.length} files checked)`);
