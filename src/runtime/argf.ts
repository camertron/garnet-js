import { Args } from "./arg-scanner";
import { Class, ObjectClass, Qnil, RValue, Runtime, STDIN } from "../runtime";
import { Integer } from "./integer";
import { Object } from "../runtime/object";
import { RubyArray } from "./array";
import { RubyFile } from "./file";
import { RubyString } from "./string";

export class Argf {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        this.klass_ = (await Object.find_constant("ARGF.class"))!;
        return this.klass_;
    }

    public argv: RValue;
    public current_file: RValue | null;

    static async new(argv: RValue): Promise<RValue> {
        return new RValue(await Argf.klass(), new Argf(argv));
    }

    constructor(argv: RValue) {
        this.argv = argv;
        this.current_file = null;
    }

    async file(): Promise<RValue> {
        if (this.current_file) {
            return this.current_file;
        }

        const read_mode = await RubyString.new("r");
        const default_permission = await Integer.get(0o666);
        const file_name = this.argv.get_data<RubyArray>().elements.shift();

        if (!file_name) {
            return STDIN;
        }

        this.current_file = await RubyFile.new(file_name, read_mode, default_permission);

        return this.current_file;
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    await Runtime.define_class("ARGF.class", ObjectClass, async (klass: Class) => {
        klass.define_native_method("initialize", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [file_names] = await Args.scan("*", args);
            self.data = new Argf(await RubyArray.new(file_names));
            return Qnil;
        });

        klass.define_native_method("argv", (self: RValue): RValue => {
            return self.get_data<Argf>().argv;
        });

        klass.define_native_method("file", async (self: RValue): Promise<RValue> => {
            return await self.get_data<Argf>().file();
        });
    });

    inited = true;
};
