import { argv } from "process";
import * as Garnet from "../src/garnet";
import { ExecutionContext, Runtime, vmfs, Array, String } from "../src/garnet";
import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs";
import { Dir } from "../src/runtime/dir";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await Garnet.init();

let code: string | null = null;
let code_path: string = "<code>";
let script_argv: string[] = [];

// current directory
ExecutionContext.current.push_onto_load_path(process.env.PWD!);
// path to stdlib
ExecutionContext.current.push_onto_load_path(path.resolve(path.join(__dirname, "..", "src", "lib")));

Dir.setwd(process.env.PWD!);

for (let i = 0; i < argv.length; i ++) {
    if (argv[i] == "-I") {
        const p = path.resolve(argv[i + 1])
        ExecutionContext.current.push_onto_load_path(p);
        i ++;
    } else if (argv[i].startsWith("-I")) {
        const p = path.resolve(argv[i].substring(2));
        ExecutionContext.current.push_onto_load_path(p);
    } else if (argv[i] == '-e') {
        code = argv[i + 1];
        i ++;
    } else if (argv[i] == "-r") {
        Runtime.require(argv[i + 1]);
        i ++;
    } else if (argv[i] == "-m") {
        const module_name = argv[i + 1];
        await import(module_name);
        i ++;
    } else if (argv[i] == "-C") {
        let dir = argv[i + 1];

        if (vmfs.is_relative(dir)) {
            dir = vmfs.join_paths(Dir.getwd(), dir);
        }

        Dir.setwd(dir);
        ExecutionContext.current.push_onto_load_path(dir);

        i ++;
    } else if (argv[i] === "--") {
        script_argv = argv.splice(i + 1);
        argv.pop(); // remove "--"
        break;
    }
}

Garnet.ObjectClass.get_data<Garnet.Class>().constants["ARGV"] = Array.new(
    script_argv.map((arg) => {
        return String.new(arg);
    })
);

if (!code) {
    code_path = argv[argv.length - 1];
    ExecutionContext.current.globals["$0"] = String.new(code_path);

    if (fs.existsSync(code_path)) {
        code = fs.readFileSync(code_path).toString('utf8');
    }
}

if (!code) {
    process.exit(0);
}

await Garnet.evaluate(code, code_path);
await Garnet.deinit();
