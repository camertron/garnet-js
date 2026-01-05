import { ExecutionContext } from "../execution_context";
import { Class, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { hash_string } from "../util/string_utils";
import { Integer } from "./integer";
import { Object } from "./object";
import { Proc } from "./proc";
import { RubyString } from "../runtime/string";
import { Regexp } from "./regexp";
import { NameError } from "../errors";
import { mix_shared_string_methods_into } from "./string-shared";

export class Symbol {
    private static to_proc_table: Map<string, RValue> = new Map();

    static async to_proc(symbol: RValue): Promise<RValue> {
        const sym = symbol.get_data<string>();

        if (!this.to_proc_table.has(sym)) {
            this.to_proc_table.set(
                sym,
                await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
                    return await Object.send(args[0], sym);
                })
            );
        }

        return this.to_proc_table.get(sym)!;
    }

    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Symbol");

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

    Runtime.define_class("Symbol", ObjectClass, async (klass: Class) => {
        await mix_shared_string_methods_into(klass);

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const str = self.get_data<string>();
            const quote = !/^\w+$/.test(str);
            const escaped_str = str.replace(/\"/g, "\\\"");

            return await RubyString.new(quote ? `:"${escaped_str}"` : `:${escaped_str}`);
        });

        klass.define_native_method("hash", async (self: RValue): Promise<RValue> => {
            return await Integer.new(hash_string(self.get_data<string>()));
        });

        klass.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            if (args[0].klass !== await Symbol.klass()) return Qfalse;
            return args[0].get_data<string>() === self.get_data<string>() ? Qtrue : Qfalse;
        });

        klass.define_native_method("===", async (self: RValue, args: RValue[]): Promise<RValue> => {
            if (args[0].klass !== await Symbol.klass()) return Qfalse;
            return args[0].get_data<string>() === self.get_data<string>() ? Qtrue : Qfalse;
        });

        klass.define_native_method("to_s", async (self: RValue): Promise<RValue> => {
            return await RubyString.new(self.get_data<string>());
        });

        await klass.alias_method("name", "to_s");

        klass.define_native_method("to_sym", (self: RValue): RValue => {
            return self;
        });

        klass.define_native_method("to_proc", async (self: RValue): Promise<RValue> => {
            return await Symbol.to_proc(self);
        });

        klass.define_native_method("=~", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const string_klass = await Object.find_constant("String");
            const match_method = await Object.find_instance_method_under(string_klass!, "=~");
            return await match_method!.call(await ExecutionContext.current, self, args);
        });

        klass.define_native_method("match?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const string_klass = await Object.find_constant("String");
            const match_method = await Object.find_instance_method_under(string_klass!, "match?");
            return await match_method!.call(await ExecutionContext.current, self, args);
        });
    });

    inited = true;
};
