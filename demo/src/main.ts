import "./style.css";
import "./assets/lequire-webfont.woff";
import "./assets/lequire-webfont.woff2";
import onigmo_url from "./assets/onigmo.wasm";
import prism_url from "./assets/prism.wasm";

import * as Garnet from "@camertron/garnet-js/src/garnet";
import { Terminal } from "xterm";
import { LocalEchoAddon } from "@gytx/xterm-local-echo";

declare global {
  interface Window {
    garnet_wasm_modules: {[key: string]: string};
  }
}

const locator_map: {[key: string]: string} = {
  onigmo: onigmo_url,
  prism: prism_url,
}

Garnet.WASM.register_module_resolver((locator: string): string => {
  if (locator_map[locator]) {
    return locator_map[locator]
  } else {
    throw new Error(`Could not resolve WASM module named ${locator}`);
  }
});

await Garnet.init();

class IRBIO implements Garnet.IO {
  static new(local_echo: LocalEchoAddon): Garnet.RValue {
    return new Garnet.RValue(Garnet.IOClass, new IRBIO(local_echo));
  }

  private local_echo: LocalEchoAddon;

  constructor(local_echo: LocalEchoAddon) {
    this.local_echo = local_echo;
  }

  puts(val: string): void {
    this.local_echo.println(val);
  }

  write(val: string): void {
    this.local_echo.print(val);
  }

  is_tty(): boolean {
    return true;
  }
}

const ec = Garnet.ExecutionContext.current;
const terminal = new Terminal({cursorBlink: true, fontSize: 18, theme: {background: '#222222', foreground: "#33ff33"}});
terminal.open(document.querySelector(".Console")!);
const local_echo = new LocalEchoAddon();
terminal.loadAddon(local_echo);

ec.globals["$stdout"] = IRBIO.new(local_echo);
ec.globals["$stderr"] = IRBIO.new(local_echo);

// for remembering locals across top frame evals
ec.globals["$__GARNET_DEMO_LOCALS"] = await Garnet.Hash.new();

// Infinite loop of reading lines
const prompt = "irb> ";
const readLine = async () => {
  let input = await local_echo.read(prompt);

  if (input.trim().length > 0) {
    try {
      const toplevel_binding = Garnet.ObjectClass
        .get_data<Garnet.Class>()
        .constants["TOPLEVEL_BINDING"]
        ?.get_data<Garnet.Binding>();

      if (toplevel_binding) {
        // "remember" locals
        const local_names = toplevel_binding.local_variables();
        const local_reads = [];

        for (const [local_idx, local_name] of local_names.entries()) {
          const stack_index = toplevel_binding.parent_frame!.stack_index + local_idx;

          ec.globals["$__GARNET_DEMO_LOCALS"].get_data<Garnet.Hash>().set_by_symbol(
            local_name,
            ec.stack.at(stack_index)?.rval || Garnet.Qnil,
          );

          const local_name_sym = Garnet.Symbol.inspect(local_name);

          local_reads.push(`${local_name} = $__GARNET_DEMO_LOCALS[${local_name_sym}]`);
        }

        input = `${local_reads.join(";")};${input}`;
      }

      const result = await Garnet.evaluate(input);
      local_echo.println(`=> ${(await Garnet.Object.send(result, "inspect")).get_data<string>()}`)
    } catch (e) {
      if (e instanceof Garnet.RubyError) {
        local_echo.println(Garnet.ExecutionContext.print_backtrace_to_string(e));
      } else if (e instanceof Error) {
        local_echo.println(`Unhandled JavaScript error: ${e.message}`);
        if (e.stack) local_echo.println(e.stack);
      }
    }
  }

  readLine();
};

readLine();
