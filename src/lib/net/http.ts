import { Hash } from "../../garnet";
import { Class, ObjectClass, RValue, Runtime } from "../../runtime";
import { String } from "../../runtime/string";
import { URI } from "../uri";

export const init = () => {
    const DEFAULT_PORT: number = 80;

    const net_module = Runtime.define_module("Net");
    const protocol_class = Runtime.define_class_under(net_module, "Protocol", ObjectClass);
    const response_class = Runtime.define_class_under(net_module, "HTTPResponse", ObjectClass);

    Runtime.define_class_under(net_module, "HTTP", protocol_class, (klass: Class) => {
        klass.define_native_singleton_method("get", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const hostname = await Runtime.coerce_to_string(args[0]);
            const path = await Runtime.coerce_to_string(args[1]);
            const port = args.length > 2 ? args[2].get_data<number>() : DEFAULT_PORT;

            const result = await fetch(`http://${hostname.get_data<string>()}:${port}${path.get_data<string>()}`);
            return await String.new(await result.text());
        });

        klass.define_native_singleton_method("post_form", async (self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await URI.klass());
            Runtime.assert_type(args[0], await Hash.klass());

            const url = args[0].get_data<URI>().url;
            const form_data_hash = args[1].get_data<Hash>();
            const form_data: {[key: string]: string} = {};

            await form_data_hash.each(async (k: RValue, v: RValue) => {
                const key = (await Runtime.coerce_to_string(k)).get_data<string>();
                const value = (await Runtime.coerce_to_string(v)).get_data<string>();
                form_data[key] = value;
            });

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams(form_data)
            });

            return new RValue(response_class, response);
        });
    });
};
