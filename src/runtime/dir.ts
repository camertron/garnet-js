import { BreakError } from "../execution_context";
import { ExecutionContext, Qtrue } from "../garnet";
import { Class, Kwargs, NumericClass, ObjectClass, Qnil, Runtime, RValue, } from "../runtime";
import { String } from "../runtime/string";
import { parse_glob } from "./parse-glob";
import { Proc } from "./proc";
import { RubyArray } from "../runtime/array";

export class Dir {
    private static wd: string;
    private static wd_val: RValue;

    static getwd() {
        return this.wd;
    }

    static getwd_val() {
        return this.wd_val;
    }

    static setwd(new_wd: string) {
        this.wd = new_wd;
        this.wd_val = String.new(this.wd);
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Dir", ObjectClass, (klass: Class) => {
        klass.define_native_singleton_method("getwd", (_self: RValue): RValue => {
            return Dir.getwd_val();
        });

        klass.define_native_singleton_method("pwd", (_self: RValue): RValue => {
            return Dir.getwd_val();
        });

        klass.define_native_singleton_method("glob", (_self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue): RValue => {
            const pattern_str = Runtime.coerce_to_string(args[0]).get_data<string>();
            const base_path = kwargs && kwargs.has("base") ? Runtime.coerce_to_string(kwargs.get("base")!).get_data<string>() : ".";
            const sort = kwargs && kwargs.has("sort") ? kwargs.get("sort")!.is_truthy() : Qtrue;
            let flags = 0;

            if (kwargs && kwargs.has("flags")) {
                const f = kwargs.get("flags")!;
                Runtime.assert_type(f, NumericClass);
                flags = f.get_data<number>();
            }

            const pattern = parse_glob(pattern_str, flags);

            if (block) {
                const proc = block.get_data<Proc>();

                try {
                    pattern.each_matching_path(base_path, (path: string) => {
                        proc.call(ExecutionContext.current, [String.new(path)]);
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

                pattern.each_matching_path(base_path, (path: string) => {
                    matching_paths.push(String.new(path));
                });

                return RubyArray.new(matching_paths);
            }
        });

        klass.get_singleton_class().get_data<Class>().alias_method("[]", "glob");
    });

    inited = true;
};
