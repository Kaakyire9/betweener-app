const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(process.cwd(), "assets/images/onboarding");
const maxLayerEdge = 1024;
const heroNames = new Set([
  "ghana-gate.png",
  "ghana-gate-clean.png",
  "ghana-gate-cropped.png",
  "global-globe.png",
  "base-composite-oath-tight.png",
]);

async function findPngs(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? findPngs(target)
        : entry.name.endsWith(".png") && !entry.name.endsWith(".optimized.png")
          ? [target]
          : [];
    }),
  );
  return nested.flat();
}

async function optimize(file) {
  const source = sharp(file, { failOn: "warning" });
  const metadata = await source.metadata();
  const isHero = heroNames.has(path.basename(file));
  if (isHero) return null;
  const longestEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  const resize = longestEdge > maxLayerEdge
    ? { width: maxLayerEdge, height: maxLayerEdge, fit: "inside", withoutEnlargement: true }
    : undefined;
  const destination = file.replace(/\.png$/i, ".optimized.png");

  let pipeline = source.rotate();
  if (resize) pipeline = pipeline.resize(resize);
  pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 });

  await pipeline.toFile(destination);
  const [before, after] = await Promise.all([fs.stat(file), fs.stat(destination)]);
  return {
    file: path.relative(root, file),
    before: before.size,
    after: after.size,
    resized: Boolean(resize),
  };
}

async function main() {
  sharp.concurrency(Math.max(1, Math.min(4, sharp.concurrency())));
  const files = await findPngs(root);
  const results = [];
  for (const file of files) {
    const result = await optimize(file);
    if (result) results.push(result);
  }

  const before = results.reduce((sum, item) => sum + item.before, 0);
  const after = results.reduce((sum, item) => sum + item.after, 0);
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
  console.log(JSON.stringify({
    files: results.length,
    resized: results.filter((item) => item.resized).length,
    beforeMB: mb(before),
    afterMB: mb(after),
    reductionPercent: ((1 - after / before) * 100).toFixed(1),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
