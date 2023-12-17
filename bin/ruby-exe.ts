import { argv } from "process";
import * as YARV from "../src/yarv";
import { ExecutionContext, Runtime, vmfs } from "../src/yarv";
import path from "path";
import fs from "fs";
import { Dir } from "../src/runtime/dir";

await YARV.init();

let code: string | null = null;
let code_path: string = "<code>";

ExecutionContext.current.push_onto_load_path(process.env.PWD!);
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
    } else if (argv[i] == "-C") {
        let dir = argv[i + 1];

        if (vmfs.is_relative(dir)) {
            dir = vmfs.join_paths(Dir.getwd(), dir);
        }

        Dir.setwd(dir);
        ExecutionContext.current.push_onto_load_path(dir);

        i ++;
    }
}

if (!code) {
    code_path = argv[argv.length - 1];

    if (fs.existsSync(code_path)) {
        code = fs.readFileSync(code_path).toString('utf8');
    }
}

if (!code) {
    process.exit(0);
}

YARV.evaluate(code, code_path);

await YARV.deinit();
