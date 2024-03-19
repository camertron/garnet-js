import { ExecutionContext } from "../execution_context";
import { Class, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { hash_string } from "../util/string_utils";
import { Integer } from "./integer";
import { Object } from "./object";
import { Proc } from "./proc";
import { String } from "../runtime/string";
import { Regexp } from "./regexp";
import { NameError } from "../errors";

export class Symbol {
    private static to_proc_table: Map<string, RValue> = new Map();

    static to_proc(symbol: RValue): RValue {
        const sym = symbol.get_data<string>();

        if (!this.to_proc_table.has(sym)) {
            this.to_proc_table.set(
                sym,
                Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
                    return Object.send(args[0], sym);
                })
            );
        }

        return this.to_proc_table.get(sym)!;
    }

    private static klass_: RValue;

    static get klass(): RValue {
        const klass = Object.find_constant("Symbol");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Symbol`);
        }

        return this.klass_;
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Symbol", ObjectClass, (klass: Class) => {
        klass.define_native_method("inspect", (self: RValue): RValue => {
            const str = self.get_data<string>();
            const quote = !/^\w+$/.test(str);
            const escaped_str = str.replace(/\"/g, "\\\"");

            return String.new(quote ? `:"${escaped_str}"` : `:${escaped_str}`);
        });

        klass.define_native_method("hash", (self: RValue): RValue => {
            return Integer.new(hash_string(self.get_data<string>()));
        });

        klass.define_native_method("==", (self: RValue, args: RValue[]): RValue => {
            if (args[0].klass != Symbol.klass) return Qfalse;
            return args[0].get_data<string>() === self.get_data<string>() ? Qtrue : Qfalse;
        });

        klass.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
            if (args[0].klass != Symbol.klass) return Qfalse;
            return args[0].get_data<string>() === self.get_data<string>() ? Qtrue : Qfalse;
        });

        klass.define_native_method("to_s", (self: RValue): RValue => {
            return String.new(self.get_data<string>());
        });

        klass.alias_method("name", "to_s");

        klass.define_native_method("to_sym", (self: RValue): RValue => {
            return self;
        });

        klass.define_native_method("to_proc", (self: RValue): RValue => {
            return Symbol.to_proc(self);
        });

        klass.define_native_method("=~", (self: RValue, args: RValue[]): RValue => {
            if (args[0].klass === Regexp.klass) {
                const regexp = args[0].get_data<Regexp>();
                const result = regexp.search(self.get_data<string>());

                if (result) {
                    Regexp.set_svars(result);
                    return Integer.get(result.begin(0));
                } else {
                    return Qnil;
                }
            } else {
                return Object.send(args[0], "=~", [self]);
            }
        });
    });

    inited = true;
};
