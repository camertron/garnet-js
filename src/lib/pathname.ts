import { Class, ObjectClass, Runtime, RValue } from "../runtime"
import { RubyString } from "../runtime/string";
import { Object } from "../runtime/object";
import { Args } from "../runtime/arg-scanner";
import { vmfs } from "../vmfs";
import { RubyArray } from "../runtime/array";

export class Pathname {
    private static klass_: RValue;
    private static file_klass_: RValue;

    static async new(path: string): Promise<RValue> {
        return this.subclass_new(await this.klass(), path);
    }

    static subclass_new(klass_rval: RValue, path: string): RValue {
        return new RValue(klass_rval, new Pathname(path));
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant("Pathname");
            if (klass) {
                this.klass_ = klass;
            }
        }

        return this.klass_;
    }

    static async file_klass(): Promise<RValue> {
        if (!this.file_klass_) {
            const klass = await Object.find_constant("File");

            if (klass) {
                this.file_klass_ = klass;
            }
        }

        return this.file_klass_;
    }

    public path: string;

    constructor(path: string) {
        this.path = path;
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    Runtime.define_class("Pathname", ObjectClass, async (klass: Class): Promise<void> => {
        klass.define_native_singleton_method("new", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [path_arg] = await Args.scan("1", args);
            let path_str: string;

            if (path_arg.klass === await Pathname.klass()) {
                path_str = path_arg.get_data<Pathname>().path;
            } else {
                path_str = (await Runtime.coerce_to_string(path_arg)).get_data<string>();
            }

            if (path_str.includes('\0')) {
                throw new Error("pathname contains null byte");
            }

            return Pathname.subclass_new(self, path_str);
        });

        klass.define_native_method("to_s", async (self: RValue): Promise<RValue> => {
            return await RubyString.new(self.get_data<Pathname>().path);
        });

        await klass.alias_method("to_path", "to_s");

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const path = self.get_data<Pathname>().path;
            return await RubyString.new(`#<Pathname:${path}>`);
        });

        klass.define_native_method("+", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const self_path = self.get_data<Pathname>().path;
            const [other_arg] = await Args.scan("1", args);
            let other_path: string;

            if (other_arg.klass === await Pathname.klass()) {
                other_path = other_arg.get_data<Pathname>().path;
            } else {
                other_path = (await Runtime.coerce_to_string(other_arg)).get_data<string>();
            }

            // return other path if absolute
            if (!vmfs.is_relative(other_path)) {
                return await Pathname.new(other_path);
            }

            return await Pathname.new(vmfs.join_paths(self_path, other_path));
        });

        await klass.alias_method("/", "+");

        klass.define_native_method("directory?", async (self: RValue): Promise<RValue> => {
            const path = self.get_data<Pathname>().path;
            const path_str = await RubyString.new(path);

            return await Object.send(await Pathname.file_klass(), "directory?", [path_str]);
        });

        klass.define_native_method("expand_path", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const path = self.get_data<Pathname>().path;
            const path_str = await RubyString.new(path);
            const file_class = await Pathname.file_klass();

            // second arg is base path
            const expanded_str = args.length > 0
                ? await Object.send(file_class, "expand_path", [path_str, args[0]])
                : await Object.send(file_class, "expand_path", [path_str]);

            const expanded_path = expanded_str.get_data<string>();
            return await Pathname.new(expanded_path);
        });

        klass.define_native_method("dirname", async (self: RValue): Promise<RValue> => {
            const path = self.get_data<Pathname>().path;
            return await Pathname.new(vmfs.dirname(path));
        });

        klass.define_native_method("basename", async (self: RValue): Promise<RValue> => {
            const path = self.get_data<Pathname>().path;
            return await Pathname.new(vmfs.basename(path));
        });

        klass.define_native_method("children", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const base_path = self.get_data<Pathname>().path;
            let with_directory = true;

            if (args.length > 0) {
                with_directory = args[0].is_truthy();
            }

            const result: RValue[] = [];

            await vmfs.each_child_path(base_path, async (child_path: string) => {
                if (with_directory) {
                    result.push(await Pathname.new(vmfs.join_paths(base_path, child_path)));
                } else {
                    result.push(await Pathname.new(child_path));
                }
            });

            return await RubyArray.new(result);
        });
    });

    inited = true;
};
