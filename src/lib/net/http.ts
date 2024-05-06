import { Class, ObjectClass, RValue, Runtime } from "../../runtime";
import { String } from "../../runtime/string";

export const init = () => {
    const DEFAULT_PORT: number = 80;

    const net_module = Runtime.define_module("Net");
    const protocol_class = Runtime.define_class_under(net_module, "Protocol", ObjectClass);

    Runtime.define_class_under(net_module, "HTTP", protocol_class, (klass: Class) => {
        klass.define_native_singleton_method("get", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const hostname = await Runtime.coerce_to_string(args[0]);
            const path = await Runtime.coerce_to_string(args[1]);
            const port = args.length > 2 ? args[2].get_data<number>() : DEFAULT_PORT;

            const result = await fetch(`http://${hostname.get_data<string>()}:${port}${path.get_data<string>()}`);
            return await String.new(await result.text());
        });
    });
};
