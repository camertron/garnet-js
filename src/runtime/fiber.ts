import { NameError } from "../errors";
import { Class, ObjectClass, RValue, Runtime } from "../garnet";
import { Hash } from "./hash";
import { Object } from "./object";

let inited = false

export class Fiber {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Hash");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Hash`);
        }

        return this.klass_;
    }

    static async new(): Promise<RValue> {
        return new RValue(await this.klass(), new Fiber());
    }

    private storage_: Hash;

    get storage(): Hash {
        if (!this.storage_) {
            this.storage_ = new Hash();
        }

        return this.storage_;
    }
}

export const init = async () => {
    if (inited) return;

    Runtime.define_class("Fiber", ObjectClass, (klass: Class) => {
        klass.define_native_singleton_method("current", (): RValue => {
            return root_fiber_rval;
        });

        klass.define_native_singleton_method("[]", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await root_fiber.storage.get(args[0]);
        });

        klass.define_native_singleton_method("[]=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await root_fiber.storage.set(args[0], args[1]);
        });
    });

    const root_fiber_rval = await Fiber.new();
    const root_fiber = root_fiber_rval.get_data<Fiber>();

    inited = true;
}
