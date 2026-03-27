import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "build/index.js",
  banner: { js: "#!/usr/bin/env node" },
  external: ["@modelcontextprotocol/sdk", "yaml", "zod"],
});

console.log("Build complete: build/index.js");
