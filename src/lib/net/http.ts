import { Hash } from "../../garnet";
import { Class, ObjectClass, RValue, Runtime } from "../../runtime";
import { Args } from "../../runtime/arg-scanner";
import { RubyString } from "../../runtime/string";
import { URI } from "../uri";

export const init = async () => {
    const DEFAULT_PORT: number = 80;

    const net_module = await Runtime.define_module("Net");
    const protocol_class = await Runtime.define_class_under(net_module, "Protocol", ObjectClass);
    const response_class = await Runtime.define_class_under(net_module, "HTTPResponse", ObjectClass);

    await Runtime.define_class_under(net_module, "HTTP", protocol_class, async (klass: Class) => {
        klass.define_native_singleton_method("get", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            const [hostname_rval, path_rval, port_rval] = await Args.scan("21", args);
            const hostname = await Runtime.coerce_to_string(hostname_rval);
            const path = await Runtime.coerce_to_string(path_rval);
            const port = port_rval ? (await Runtime.coerce_to_int(port_rval)).get_data<number>() : DEFAULT_PORT;

            const result = await fetch(`http://${hostname.get_data<string>()}:${port}${path.get_data<string>()}`);
            return await RubyString.new(await result.text());
        });

        klass.define_native_singleton_method("post_form", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            const [url_rval, form_data_hash_rval] = await Args.scan("2", args);
            await Runtime.assert_type(url_rval, await URI.klass());
            await Runtime.assert_type(form_data_hash_rval, await Hash.klass());

            const url = url_rval.get_data<URI>().url;
            const form_data_hash = form_data_hash_rval.get_data<Hash>();
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
