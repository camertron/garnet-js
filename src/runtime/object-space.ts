import { Runtime, RValue, ObjectClass, ClassClass, ModuleClass, Module } from "../runtime"
import { Object } from "./object";
import { Kernel } from "./kernel";
import { Enumerator } from "./enumerator";
import { Integer } from "./integer";

let inited = false;

export const init = async () => {
    if (inited) return;

    Runtime.define_module("ObjectSpace", (mod: Module) => {
        // Since we currently don't track all created objects, this method only searches for
        // Classes and Modules. That's fine for now since we don't need anything more, but
        // eventually it'll need to work the way CRuby does.
        mod.define_native_singleton_method("each_object", async (_self: RValue, args: RValue[], _kwargs?: any, block?: RValue): Promise<RValue> => {
            const klass = args.length > 0 ? args[0] : null;

            if (!block) {
                return await Enumerator.for_native_generator(async function* () {
                    for (const obj of await collect_objects(klass)) {
                        yield obj;
                    }
                });
            }

            const objects = await collect_objects(klass);

            for (const obj of objects) {
                await Object.send(block, "call", [obj]);
            }

            return await Integer.get(objects.length);
        });
    });

    inited = true;
};

async function collect_objects(klass: RValue | null): Promise<RValue[]> {
    const objects: RValue[] = [];

    if (!klass) {
        // If no class is specified, we would need to iterate over ALL objects which we
        // can't do yet. We will eventually need to keep track of every object at creation
        // time, which is going to be quite a bit of overhead.
        return objects;
    }

    // for Class and Module objects, we can walk the constant tree
    const klass_data = klass.get_data<any>();
    const is_class_or_module =
        klass === ClassClass ||
        klass === ModuleClass ||
        (klass_data?.name === "Class") ||
        (klass_data?.name === "Module");

    if (is_class_or_module) {
        await walk_constants(ObjectClass, klass, objects, new Set());
    }

    return objects;
}

async function walk_constants(mod: RValue, target_klass: RValue, objects: RValue[], visited: Set<number>): Promise<void> {
    if (visited.has(mod.object_id)) {
        return;
    }

    visited.add(mod.object_id);

    const mod_data = mod.get_data<any>();

    if (!mod_data || !mod_data.constants) {
        return;
    }

    for (const const_name in mod_data.constants) {
        const const_val = mod_data.constants[const_name];

        if (!const_val || typeof const_val !== 'object' || !const_val.klass) {
            continue;
        }

        if (await Kernel.is_a(const_val, target_klass)) {
            objects.push(const_val);
        }

        const const_data = const_val.get_data();

        if (const_data?.constants) {
            await walk_constants(const_val, target_klass, objects, visited);
        }
    }
}
