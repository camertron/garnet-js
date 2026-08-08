import { Args } from "./arg-scanner";
import { Class, IO, ObjectClass, Qnil, RValue, Runtime, STDIN } from "../runtime";
import { Enumerable } from "./enumerable";
import { Enumerator } from "./enumerator";
import { Hash } from "./hash";
import { Integer } from "./integer";
import { IOError } from "../errors";
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

    async read_byte(): Promise<Uint8Array | null> {
        while (true) {
            const file = await this.file();
            const io = file.get_data<IO>();
            if (!io.read_byte) throw new IOError("not opened for reading");
            const byte = io.read_byte();

            if (byte) {
                return byte;
            }

            if (this.argv.get_data<RubyArray>().elements.length === 0) {
                return null;
            }

            this.current_file = null;
        }
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    await Runtime.define_class("ARGF.class", ObjectClass, async (klass: Class) => {
        klass.include(await Enumerable.module());

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

        klass.define_native_method("each_byte", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const argf = self.get_data<Argf>();

            if (block) {
                while (true) {
                    const byte = await argf.read_byte();
                    if (!byte) break;

                    const int_byte = await Integer.get(byte[0]);
                    await Object.send(block, "call", [int_byte]);
                }
                return self;
            } else {
                return await Enumerator.for_native_generator(async function* () {
                    while (true) {
                        const byte = await argf.read_byte();
                        if (!byte) break;

                        const int_byte = await Integer.get(byte[0]);
                        yield int_byte;
                    }
                });
            }
        });
    });

    inited = true;
};
