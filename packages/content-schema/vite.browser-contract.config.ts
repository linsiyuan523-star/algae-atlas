import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: packageRoot,
  build: {
    outDir: fileURLToPath(new URL("./.browser-contract", import.meta.url)),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL("./browser/contract.ts", import.meta.url)),
      formats: ["es"],
      fileName: "content-schema-browser-contract",
    },
  },
});
