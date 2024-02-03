import * as fs from "fs"
import { evaluate, ExecutionContext, Main } from "./dist/garnet.js";
import Benchmarkify from "benchmarkify";

const code = fs.readFileSync("examples/bench1.rb", {encoding: "utf-8"});
evaluate(code);

const ec = ExecutionContext.current;
const run_method = Main.klass.methods["run"];
const args = [];

const benchmark = new Benchmarkify("garnet.js").printHeader();
const bench = benchmark.createSuite("Micro-benchmarks");

bench.add("New instance + method call", () => {
    run_method.call(ec, Main, args);
});

bench.run();
