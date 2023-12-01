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
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/branchif.ts -> src/instruction.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/branchnil.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/defineclass.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/getconstant.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/new_array.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/newhash.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/putnil.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/putobject_int2fix_0.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/putobject_int2fix_1.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/putspecialobject.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/insns/send.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/instruction_sequence.ts -> src/runtime.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/compiler.ts -> src/runtime.ts",
  "Circular dependency: src/execution_context.ts -> src/frame.ts -> src/runtime.ts -> src/runtime/kernel.ts -> src/execution_context.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/kernel.ts -> src/runtime.ts",
  "Circular dependency: src/execution_context.ts -> src/frame.ts -> src/runtime.ts -> src/runtime/proc.ts -> src/execution_context.ts",
  "Circular dependency: src/runtime.ts -> src/runtime/hash.ts -> src/runtime.ts"
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
