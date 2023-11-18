import * as fs from "fs"
import * as YARV from "./src/yarv";

await YARV.init();
YARV.ExecutionContext.current.push_onto_load_path(process.env.PWD!);
YARV.evaluate(fs.readFileSync("examples/return.rb").toString());

// EVALUATE YARV INSTRUCTIONS IN FILE
// let yarv_json = fs.readFileSync("examples/require/require.json", {encoding: "utf-8"});
// evaluate(JSON.parse(yarv_json));

// TEST CLASS HIERARCHY OF OBJECT
// const result = Object.send(ObjectClass, "ancestors");
// const str = Object.send(result, "inspect");
// console.log(str.get_data());

// TEST CLASS HAS CORRECT SINGLETON CLASS INHERITANCE HIERARCHY
// const foo_class = Runtime.define_class("Foo", ObjectClass);

// const ancestors = Object.send(foo_class.get_data().get_singleton_class(), "ancestors");
// const str = Object.send(ancestors, "inspect");
// console.log(str.get_data());
