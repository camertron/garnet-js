import { ArgumentError, NotImplementedError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Class, Qnil, RValue, Runtime } from "../runtime"
import { Hash } from "./hash";
import { Integer } from "./integer";
import { Proc } from "./proc";
import { String } from "../runtime/string";

let inited = false;

export const init = async () => {
    if (inited) return;

    const signal_list = {
        "EXIT": 0,
        "HUP": 1,
        "INT": 2,
        "QUIT": 3,
        "ILL": 4,
        "TRAP": 5,
        "ABRT": 6,
        "IOT": 6,
        "EMT": 7,
        "FPE": 8,
        "KILL": 9,
        "BUS": 10,
        "SEGV": 11,
        "SYS": 12,
        "PIPE": 13,
        "ALRM": 14,
        "TERM": 15,
        "URG": 16,
        "STOP": 17,
        "TSTP": 18,
        "CONT": 19,
        "CHLD": 20,
        "CLD": 20,
        "TTIN": 21,
        "TTOU": 22,
        "IO": 23,
        "XCPU": 24,
        "XFSZ": 25,
        "VTALRM": 26,
        "PROF": 27,
        "WINCH": 28,
        "USR1": 30,
        "USR2": 31,
        "INFO": 29
    };

    const signal_list_rvalue = await Hash.new();
    const signal_list_hash = signal_list_rvalue.get_data<Hash>();

    Object.keys(signal_list).forEach(async (signal_str) => {
        await signal_list_hash.set(
            await String.new(signal_str),
            await Integer.get(signal_list[signal_str as keyof typeof signal_list])
        );
    });

    // Ignore ts errors here because Signal inherits from nothing, which define_class doesn't support and which
    // would force us to add a bunch of null checks everywhere. Maybe a little messy, but it gets the job done.
    /* @ts-ignore */
    Runtime.define_class("Signal", null, (klass: Class) => {
        klass.define_native_singleton_method("trap", async (_self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (!block) {
                throw new ArgumentError("tried to create Proc object without a block");
            }

            const sig_no = args[0] || Qnil;

            if (sig_no.klass === await String.klass()) {
                let sig_str = sig_no.get_data<string>().toUpperCase();
                if (sig_str.startsWith("SIG")) sig_str = sig_str.slice(3);

                if (!signal_list[sig_str as keyof typeof signal_list]) {
                    throw new ArgumentError(`unsupported signal \`SIG${sig_str}'`);
                }

                process.on(`SIG${sig_str}`, async () => {
                    await block.get_data<Proc>().call(ExecutionContext.current, []);
                });

                return block;
            } else if (sig_no.klass === await Integer.klass()) {
                // not implemented yet
                throw new NotImplementedError("Signal.trap cannot accept integer signal codes yet");
            } else {
                throw new ArgumentError(`bad signal type ${sig_no.klass.get_data<Class>().name}`);
            }
        });
    });

    inited = true;
};
