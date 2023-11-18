import { readFileSync } from "fs";
import { loadPrism } from "@ruby/prism";

const parse = await loadPrism();
const code = readFileSync("examples/array.rb")
const ast = parse(code)

debugger
