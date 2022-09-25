import * as fs from "fs"
import { evaluate, ExecutionContext, Main } from "./dist/yarv.js";
import Benchmarkify from "benchmarkify";

let yarv_json = fs.readFileSync("examples/bench1.json", {encoding: "utf-8"});
evaluate(JSON.parse(yarv_json));

const ec = ExecutionContext.current;
const run_method = Main.klass.methods["run"];
const args = [];

const benchmark = new Benchmarkify("yarv-js").printHeader();
const bench = benchmark.createSuite("Micro-benchmarks");

bench.add("New instance + method call", () => {
    run_method.call(ec, Main, args);
});

bench.run();
