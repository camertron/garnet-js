import resolve from "@rollup/plugin-node-resolve"
import typescript from "@rollup/plugin-typescript"
import { terser } from "rollup-plugin-terser"
import pkg from "./package.json"

export default [
  {
    input: "src/yarv.ts",
    output: {
      file: pkg.module,
      format: "es",
      sourcemap: true
    },
    plugins: [
      resolve(),
      typescript(),
      terser()
    ],
    onwarn: (warning, warn) => {
      if (warning.code === "THIS_IS_UNDEFINED") return
      warn(warning)
    }
  }
]
