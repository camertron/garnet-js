import { argv } from "process";
import * as Garnet from "../src/garnet";
import { ExecutionContext, Runtime, vmfs, RubyArray, String } from "../src/garnet";
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
await ExecutionContext.current.push_onto_load_path(process.env.PWD!);
// path to stdlib
await ExecutionContext.current.push_onto_load_path(path.resolve(path.join(__dirname, "..", "src", "lib")));

await Dir.setwd(process.env.PWD!);

for (let i = 0; i < argv.length; i ++) {
    if (argv[i] == "-I") {
        const p = path.resolve(argv[i + 1])
        await ExecutionContext.current.push_onto_load_path(p);
        i ++;
    } else if (argv[i].startsWith("-I")) {
        const p = path.resolve(argv[i].substring(2));
        await ExecutionContext.current.push_onto_load_path(p);
    } else if (argv[i] == '-e') {
        code = argv[i + 1];
        i ++;
    } else if (argv[i] == "-r") {
        await Runtime.require(argv[i + 1]);
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

        dir = path.resolve(dir);
        await Dir.setwd(dir);
        await ExecutionContext.current.push_onto_load_path(dir);
        process.chdir(dir);

        i ++;
    } else if (argv[i] === "--") {
        script_argv = argv.splice(i + 1);
        argv.pop(); // remove "--"
        break;
    }
}

Garnet.ObjectClass.get_data<Garnet.Class>().constants["ARGV"] = await RubyArray.new(
    await Promise.all(
        script_argv.map((arg) => {
            return String.new(arg);
        })
    )
);

let absolute_code_path;

if (code) {
    code_path = "-e";
    absolute_code_path = "-e"
} else {
    code_path = argv[argv.length - 1];
    absolute_code_path = vmfs.real_path(code_path);
    ExecutionContext.current.globals["$0"] = await String.new(code_path);

    if (fs.existsSync(code_path)) {
        code = fs.readFileSync(code_path).toString('utf8');
    }
}

if (!code) {
    process.exit(0);
}

try {
    await Garnet.evaluate(code, code_path, absolute_code_path);
} catch(e) {
    // Garnet.evaluate should have printed the stack trace, etc, so all we
    // have to do is exit abnormally
    process.exit(1);
}

await Garnet.deinit();
