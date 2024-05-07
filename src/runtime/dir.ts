import { BreakError, ExecutionContext } from "../execution_context";
import { Qtrue } from "../runtime";
import { Class, ObjectClass, Qnil, Runtime, RValue, } from "../runtime";
import { String } from "../runtime/string";
import { parse_glob } from "./parse-glob";
import { Proc } from "./proc";
import { RubyArray } from "../runtime/array";
import { Numeric } from "./numeric";
import { Hash } from "./hash";

export class Dir {
    private static wd: string;
    private static wd_val: RValue;

    static getwd() {
        return this.wd;
    }

    static getwd_val() {
        return this.wd_val;
    }

    static async setwd(new_wd: string) {
        this.wd = new_wd;
        this.wd_val = await String.new(this.wd);
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Dir", ObjectClass, async (klass: Class) => {
        klass.define_native_singleton_method("getwd", (_self: RValue): RValue => {
            return Dir.getwd_val();
        });

        klass.define_native_singleton_method("pwd", (_self: RValue): RValue => {
            return Dir.getwd_val();
        });

        klass.define_native_singleton_method("glob", async (_self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const pattern_str = (await Runtime.coerce_to_string(args[0])).get_data<string>();
            const base_path = kwargs && await kwargs.has_symbol("base") ? (await Runtime.coerce_to_string(kwargs.get_by_symbol("base")!)).get_data<string>() : "";
            const sort = kwargs && await kwargs.has_symbol("sort") ? kwargs.get_by_symbol("sort")!.is_truthy() : Qtrue;
            let flags = 0;

            if (kwargs && await kwargs.has_symbol("flags")) {
                const f = kwargs.get_by_symbol("flags")!;
                Runtime.assert_type(f, await Numeric.klass());
                flags = f.get_data<number>();
            }

            const pattern = parse_glob(pattern_str, flags);

            if (block) {
                const proc = block.get_data<Proc>();

                try {
                    await pattern.each_matching_path(base_path, async (path: string) => {
                        await proc.call(ExecutionContext.current, [await String.new(path)]);
                    });
                } catch (e) {
                    if (e instanceof BreakError) {
                        return e.value
                    }

                    throw e;
                }

                return Qnil;
            } else {
                const matching_paths: RValue[] = [];

                await pattern.each_matching_path(base_path, async (path: string) => {
                    matching_paths.push(await String.new(path));
                });

                return await RubyArray.new(matching_paths);
            }
        });

        await klass.get_singleton_class().get_data<Class>().alias_method("[]", "glob");
    });

    inited = true;
};
