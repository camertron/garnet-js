import * as fs from "fs"
import { Object, ModuleClass, ObjectClass, ClassClass, evaluate } from "./dist/yarv.js";

// let yarv_json = fs.readFileSync("examples/hash.json", {encoding: "utf-8"});
// evaluate(JSON.parse(yarv_json));

const result = Object.send(ObjectClass.get_data().get_singleton_class(), "ancestors");
const str = Object.send(result, "inspect");
console.log(str.get_data());
