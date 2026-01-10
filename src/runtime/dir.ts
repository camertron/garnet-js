import { BreakError, ExecutionContext } from "../execution_context";
import { Qfalse, Qtrue } from "../runtime";
import { Class, ObjectClass, Qnil, Runtime, RValue, } from "../runtime";
import { RubyString } from "../runtime/string";
import { parse_glob } from "./parse-glob";
import { Proc } from "./proc";
import { RubyArray } from "../runtime/array";
import { Numeric } from "./numeric";
import { Hash } from "./hash";
import { vmfs } from "../vmfs";
import { Args } from "./arg-scanner";

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
        this.wd_val = await RubyString.new(this.wd);
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
            let flags = 0;
            let base_path;

            if (!vmfs.is_relative(pattern_str)) {
                // indicates an absolute path
                base_path = "";
            } else if (kwargs && await kwargs.has_symbol("base")) {
                base_path = (await Runtime.coerce_to_string(kwargs.get_by_symbol("base")!)).get_data<string>();
            } else {
                base_path = Dir.getwd();
            }

            if (kwargs && await kwargs.has_symbol("flags")) {
                const f = kwargs.get_by_symbol("flags")!;
                await Runtime.assert_type(f, await Numeric.klass());
                flags = f.get_data<number>();
            }

            const pattern = parse_glob(pattern_str, flags);

            if (block) {
                const proc = block.get_data<Proc>();

                try {
                    await pattern.each_matching_path(base_path, async (path: string) => {
                        await proc.call(ExecutionContext.current, [await RubyString.new(path)]);
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
                    matching_paths.push(await RubyString.new(path));
                });

                return await RubyArray.new(matching_paths);
            }
        });

        klass.define_native_singleton_method("exist?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            Args.check_arity(args.length, 1, 1);
            const path = (await Runtime.coerce_to_string(args[0])).get_data<string>();
            return vmfs.path_exists(path) && vmfs.is_directory(path) ? Qtrue : Qfalse;
        });

        await klass.get_singleton_class().get_data<Class>().alias_method("[]", "glob");
    });

    inited = true;
};
