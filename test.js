import * as fs from "fs"
import { evaluate } from "./dist/yarv.js";

let yarv_json = fs.readFileSync("examples/hash.json", {encoding: "utf-8"});
evaluate(JSON.parse(yarv_json));
