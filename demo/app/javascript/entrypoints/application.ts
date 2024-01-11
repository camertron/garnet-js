import * as YARV from "@camertron/yarv-js";
import {Terminal} from "xterm";
import {LocalEchoAddon} from "@gytx/xterm-local-echo";

declare global {
  interface Window {
    yarv_wasm_modules: {[key: string]: string};
  }
}

YARV.WASM.register_module_resolver((locator: string): string => {
  return window.yarv_wasm_modules[`${locator}.wasm`];
});

await YARV.init();

class IRBIO implements YARV.IO {
  static new(local_echo: LocalEchoAddon): YARV.RValue {
    return new YARV.RValue(YARV.IOClass, new IRBIO(local_echo));
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
}

const ec = YARV.ExecutionContext.current;
const terminal = new Terminal({cursorBlink: true, fontSize: 18,   theme: {background: '#222222'}});
terminal.open(document.querySelector(".Console")!);
const local_echo = new LocalEchoAddon();
terminal.loadAddon(local_echo);

ec.globals["$stdout"] = IRBIO.new(local_echo);
ec.globals["$stderr"] = IRBIO.new(local_echo);

// Infinite loop of reading lines
const prompt = "irb> ";
const readLine = async () => {
  const input = await local_echo.read(prompt);

  if (input.trim().length > 0) {
    try {
      const result = await YARV.evaluate(input);
      local_echo.println(`=> ${YARV.Object.send(result, "inspect").get_data<string>()}`)
    } catch (e) {
      if (e instanceof YARV.RubyError) {
        local_echo.println(YARV.ExecutionContext.print_backtrace_to_string(e));
      } else if (e instanceof Error) {
        local_echo.println(`Unhandled JavaScript error: ${e.message}`);
        if (e.stack) local_echo.println(e.stack);
      }
    }
  }

  readLine();
};

readLine();
