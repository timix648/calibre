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
  entryPoints: { content: join(root, "src/content.ts"), background: join(root, "src/background.ts"), options: join(root, "src/options.ts") },
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
  const bg = [10, 12, 16], fg = [94, 234, 212];
  const rows = [];
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.hypot(dx, dy) / (size / 2);
      // Rounded-square mask.
      const ax = Math.abs(dx) / (size / 2), ay = Math.abs(dy) / (size / 2);
      const r = 0.34;
      const cx = Math.max(ax - (1 - r), 0), cy = Math.max(ay - (1 - r), 0);
      const inside = Math.hypot(cx, cy) <= r;
      const ring = d > 0.52 && d < 0.72;
      const dot = d < 0.22;
      const [R, G, B] = ring || dot ? fg : bg;
      const o = 1 + x * 4;
      row[o] = R; row[o + 1] = G; row[o + 2] = B; row[o + 3] = inside ? 255 : 0;
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
