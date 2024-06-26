import resolve from "@rollup/plugin-node-resolve"
import typescript from "@rollup/plugin-typescript"
import { terser } from "rollup-plugin-terser"
import pkg from "./package.json"

let plugins = [
  resolve(),
  typescript()
];

if (process.env.RELEASE != null) {
  plugins.push(terser());
}

export default [
  {
    input: "src/garnet.ts",
    output: {
      file: pkg.module,
      format: "es",
      sourcemap: true
    },
    inlineDynamicImports: true,
    plugins: plugins,
    onwarn: (warning, warn) => {
      if (warning.code === "CIRCULAR_DEPENDENCY") {
        return;
      }

      warn(warning);
    }
  }
];
