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

const allowed_circular_deps = [
  "Circular dependency: src/execution_context.ts -> src/frame.ts -> src/runtime.ts -> src/execution_context.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/array.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/integer.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/symbol.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/string.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/runtime.ts"
];

export default [
  {
    input: "src/yarv.ts",
    output: {
      file: pkg.module,
      format: "es",
      sourcemap: true
    },
    plugins: plugins,
    onwarn: (warning, warn) => {
      if (warning.code === "CIRCULAR_DEPENDENCY" && allowed_circular_deps.indexOf(warning.message) >= 0) {
        return;
      }

      warn(warning);
    }
  }
]
