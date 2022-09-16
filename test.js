// import * as fs from "fs"
// import { Class } from "./dist/runtime.js";
import { evaluate, Runtime, Object, ObjectClass, String } from "./dist/yarv.js";

// let yarv_json = fs.readFileSync("foo.json", {encoding: "utf-8"});
// evaluate(JSON.parse(yarv_json));

let FooClass = Runtime.define_class("Foo", ObjectClass, (klass) => {
    klass.define_method("bar", (_self) => {
        return String.new("bar");
    });
});

const val = Object.send(FooClass.klass.get_singleton_class(), String.new("new"));
console.log(Object.send(val, String.new("bar")).data);
