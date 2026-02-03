import { RubyString } from "../runtime/string";
import { Object } from "../runtime/object";
import { Class, Module, ObjectClass, RValue, Runtime } from "../runtime"
import { NameError } from "../errors";

let inited = false;

export class URI {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("URI");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant URI`);
        }

        return this.klass_;
    }

    public url: URL;
    private scheme_: RValue;

    constructor(url: URL) {
        this.url = url;
    }

    async scheme(): Promise<RValue> {
        if (!this.scheme_) {
            // remove trailing colon
            const protocol = this.url.protocol.slice(0, this.url.protocol.length - 1);
            this.scheme_ = await RubyString.new(protocol);
        }

        return this.scheme_;
    }
}

export const init = async () => {
    if (inited) return;

    const uri_module = Runtime.define_module("URI", async (mod: Module) => {
        mod.define_native_singleton_method("parse", (self: RValue, args: RValue[]): RValue => {
            const url = new URL(args[0].get_data<string>());
            const uri = new URI(url);

            switch (url.protocol) {
                case "http:":
                    return new RValue(http_class, uri);
                case "https:":
                    return new RValue(https_class, uri);
                default:
                return new RValue(generic_class, uri);
            }
        });
    });

    const generic_class = await Runtime.define_class_under(uri_module, "Generic", ObjectClass, (klass: Class) => {
        klass.define_native_method("scheme", async (self: RValue): Promise<RValue> => {
            return await self.get_data<URI>().scheme();
        })
    });

    const http_class = await Runtime.define_class_under(uri_module, "HTTP", generic_class);
    const https_class = await Runtime.define_class_under(uri_module, "HTTPS", generic_class);

    inited = true;
};
