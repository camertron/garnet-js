import { BlockCallData, CallData, MethodCallData } from "../call_data";
import { Compiler } from "../compiler";
import { ArgumentError, NameError } from "../errors";
import { CallingConvention, ExecutionContext, ReturnError } from "../execution_context";
import { Module, ModuleClass, RValue, Runtime, Visibility, Qnil, Class, Qtrue, Qfalse, TrueClass, FalseClass, ObjectClass, InterpretedCallable, ClassClass } from "../runtime";
import { Kernel } from "./kernel";
import { Object } from "./object";
import { Proc } from "./proc";
import { String } from "../runtime/string";
import { RubyArray } from "../runtime/array";
import { Symbol } from "../runtime/symbol";
import { Integer } from "./integer";
import { Hash } from "./hash";
import { Method, UnboundMethod } from "./method";

let inited = false;

export const init = async () => {
    if (inited) return;

    const mod = (await Object.find_constant("Module"))!.get_data<Module>();

    mod.define_native_singleton_method("new", async (_self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        const mod = new Module(null);
        const mod_rval = new RValue(ModuleClass, mod);
        mod.rval = mod_rval;

        if (block) {
            const proc = block!.get_data<Proc>();
            const binding = proc.binding.with_self(mod_rval);
            await proc.with_binding(binding).call(ExecutionContext.current, [mod_rval]);
        }

        return mod_rval;
    });

    mod.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
        return await String.new(self.get_data<Module>().full_name);
    });

    await mod.alias_method("to_s", "inspect");

    mod.define_native_method("ancestors", async (self: RValue): Promise<RValue> => {
        const result: RValue[] = [];

        await Runtime.each_unique_ancestor(self, true, async (ancestor: RValue): Promise<boolean> => {
            result.push(ancestor);
            return true;
        });

        return await RubyArray.new(result);
    });

    mod.define_native_method("include", async (self: RValue, args: RValue[]): Promise<RValue> => {
        for (const module of args) {
            Runtime.assert_type(module, ModuleClass);
            self.get_data<Module>().include(module);
            await Object.send(module, "included", [self]);
        }

        return self;
    });

    // stub that does nothing
    mod.define_native_method("included", (): RValue => {
        return Qnil;
    });

    mod.define_native_method("prepend", async (self: RValue, args: RValue[]): Promise<RValue> => {
        for (const module of args) {
            Runtime.assert_type(module, ModuleClass);
            self.get_data<Module>().prepend(module);
            await Object.send(module, "prepended", [self]);
        }

        return self;
    });

    // stub that does nothing
    mod.define_native_method("prepended", (): RValue => {
        return Qnil;
    });

    mod.define_native_method("public", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (args.length === 0) {
            self.get_data<Module>().default_visibility = Visibility.public;
        } else {
            Runtime.assert_type(args[0], await Symbol.klass());
            const mtd_name = args[0].get_data<string>();
            self.get_data<Module>().methods[mtd_name].visibility = Visibility.public;
        }

        return Qnil;
    });

    mod.define_native_method("private", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (args.length === 0) {
            self.get_data<Module>().default_visibility = Visibility.private;
        } else {
            Runtime.assert_type(args[0], await Symbol.klass());
            const mtd_name = args[0].get_data<string>();
            self.get_data<Module>().methods[mtd_name].visibility = Visibility.private;
        }

        return Qnil;
    });

    mod.define_native_method("protected", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (args.length === 0) {
            self.get_data<Module>().default_visibility = Visibility.protected;
        } else {
            Runtime.assert_type(args[0], await Symbol.klass());
            const mtd_name = args[0].get_data<string>();
            self.get_data<Module>().methods[mtd_name].visibility = Visibility.private;
        }

        return Qnil;
    });

    mod.define_native_method("const_defined?", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (args[0].klass !== await String.klass() && args[0].klass !== await Symbol.klass()) {
            Runtime.assert_type(args[0], await String.klass());
        }

        const c = args[0].get_data<string>();
        const found = await self.klass.get_data<Class>().find_constant(c);

        return found ? Qtrue : Qfalse;
    });

    mod.define_native_method("attr", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const result: RValue[] = [];

        if (args.length === 1) {
            // equivalent to attr_reader
            result.push(await Runtime.intern(define_attr_reader_on(self, await coerce_to_string(args[0]))));
        } else {
            const second_arg = args[1];

            if (second_arg.klass === TrueClass) {
                // equivalent to attr_accessor, but deprecated
                result.push(await Runtime.intern(define_attr_writer_on(self, await coerce_to_string(args[0]))));
                result.push(await Runtime.intern(define_attr_reader_on(self, await coerce_to_string(args[0]))));
            } else if (second_arg.klass === FalseClass) {
                // equivalent to attr_reader, but deprecated
                result.push(await Runtime.intern(define_attr_reader_on(self, await coerce_to_string(args[0]))));
            } else {
                // equivalent to attr_reader
                await each_string(args, async (arg_s) => {
                    result.push(await Runtime.intern(define_attr_reader_on(self, arg_s)));
                });
            }
        }

        return RubyArray.new(result);
    });

    mod.define_native_method("attr_reader", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const result: RValue[] = [];

        await each_string(args, async (arg_s) => {
            result.push(await Runtime.intern(define_attr_reader_on(self, arg_s)));
        });

        return await RubyArray.new(result);
    });

    mod.define_native_method("attr_writer", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const result: RValue[] = [];

        await each_string(args, async (arg_s) => {
            result.push(await Runtime.intern(define_attr_writer_on(self, arg_s)));
        });

        return await RubyArray.new(result);
    });

    mod.define_native_method("attr_accessor", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const result: RValue[] = [];

        await each_string(args, async (arg_s) => {
            result.push(await Runtime.intern(define_attr_writer_on(self, arg_s)));
            result.push(await Runtime.intern(define_attr_reader_on(self, arg_s)));
        });

        return await RubyArray.new(result);
    });

    mod.define_native_method("alias_method", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const new_method_name = args[0].get_data<string>();
        const existing_method_name = args[1].get_data<string>();
        await self.get_data<Module>().alias_method(new_method_name, existing_method_name);
        return await Runtime.intern(new_method_name);
    });

    mod.define_native_method("===", async (self: RValue, args: RValue[]): Promise<RValue> => {
        return await Kernel.is_a(args[0], self) ? Qtrue : Qfalse;
    });

    mod.define_native_method("module_eval", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            const proc = block!.get_data<Proc>();
            const binding = proc.binding.with_self(self);
            return proc.with_binding(binding).call(ExecutionContext.current, [self]);
        } else {
            Runtime.assert_type(args[0], await String.klass());
            const code = args[0].get_data<string>();
            const ec = ExecutionContext.current;
            let path, line_offset;

            if (args[1]) {
                path = (await Runtime.coerce_to_string(args[1])).get_data<string>();
            } else {
                path = `(eval at ${ec.frame!.iseq.file}:${ec.frame!.line})`;
            }

            if (args[2]) {
                Runtime.assert_type(args[2], await Integer.klass());
                line_offset = args[2].get_data<number>() - 1;  // convert line to offset
            } else {
                line_offset = 0;
            }

            const iseq = Compiler.compile_string(code, path, path, line_offset);
            return await ExecutionContext.current.run_class_frame(iseq, self);
        }
    });

    await mod.alias_method("class_eval", "module_eval");

    mod.define_native_method("define_method", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
        const method_name = (await Runtime.coerce_to_string(args[0])).get_data<string>();
        let body: Proc | Method | UnboundMethod | undefined = undefined;

        if (args.length === 2) {
            if (args[1].klass === await Proc.klass()) {
                body = args[1].get_data<Proc>();
                body.calling_convention = CallingConvention.METHOD_LAMBDA;
            } else if (args[1].klass === await Method.klass()) {
                body = args[1].get_data<Method>();
            } else if (args[1].klass === await UnboundMethod.klass()) {
                body = args[1].get_data<UnboundMethod>();
            } else {
                throw new TypeError(`wrong argument type ${args[1].klass.get_data<Class>().name} (expected Proc/Method/UnboundMethod)`);
            }
        } else {
            body = block?.get_data<Proc>();
        }

        if (!body) {
            throw new ArgumentError("tried to create Proc object without a block");
        }

        self.get_data<Module>().define_native_method(method_name, async (mtd_self: RValue, mtd_args: RValue[], mtd_kwargs?: Hash, mtd_block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
            /* define_method is deceptively tricky to implement because it has to evaluate a block as
             * if it were a method. This is mostly because of the way `return` behaves. Normally, returning
             * from within a block returns from the enclosing method. However, it would be pretty surprising
             * if `return` behaved that way for methods defined via define_method - there's no telling what
             * parent method frame might be calling our defined method. Returning from it would be madness.
             *
             * To prevent chaos, we "fake it" by invoking the block and passing an instance of MethodCallData
             * instead of BlockCallData.
             */

            const new_call_data = new MethodCallData(method_name, call_data!.argc, call_data!.flag, call_data!.kw_arg);

            try {
                if (body instanceof Proc) {
                    const binding = body.binding.with_self(mtd_self);
                    return await body.with_binding(binding).call(ExecutionContext.current, mtd_args, mtd_kwargs, mtd_block, new_call_data, self.get_data<Module>());
                } else {
                    return await body!.call(ExecutionContext.current, mtd_self, mtd_args, mtd_kwargs, mtd_block, new_call_data);
                }
            } catch (e) {
                if (e instanceof ReturnError) {
                    return e.value;
                }

                throw e;
            }
        });

        await Object.send(self, "method_added", [await Runtime.intern(method_name)]);

        return args[0];
    });

    mod.define_native_method("remove_method", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const method_name = await Runtime.coerce_to_string(args[0]);
        self.get_data<Module>().remove_method(method_name.get_data<string>());
        return self;
    });

    mod.define_native_method("undef_method", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const method_name = await Runtime.coerce_to_string(args[0])
        self.get_data<Module>().undef_method(method_name.get_data<string>());
        return self;
    });

    mod.define_native_method("instance_method", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const method_name = await Runtime.coerce_to_string(args[0]);
        const callable = await Object.find_instance_method_under(self, method_name.get_data<string>());

        if (callable) {
            return UnboundMethod.new(method_name.get_data<string>(), callable);
        }

        throw new NameError(`undefined method \`${method_name}' for class ${self.get_data<Module>().name}`);
    });

    mod.define_native_method("method_added", (): RValue => {
        // no-op, should be implemented by derived classes
        return Qnil;
    });

    mod.define_native_method("private_constant", (self: RValue, args: RValue[]): RValue => {
        // @TODO: actually make constant private (what does that even mean??)
        return self;
    });

    mod.define_native_method("private_class_method", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const self_mod = self.get_data<Module>();

        let method_names: string[];

        if (args[0].klass === await RubyArray.klass()) {
            method_names = await Promise.all(
                args[0].get_data<RubyArray>().elements.map(async (method_name) => {
                    return (await Runtime.coerce_to_string(method_name)).get_data<string>();
                })
            )
        } else {
            method_names = [(await Runtime.coerce_to_string(args[0])).get_data<string>()];
        }

        if (!self_mod.has_singleton_class()) {
            const inspect_str = (await Object.send(self, "inspect")).get_data<string>();
            throw new NameError(`undefined method \`${method_names[0]}' for class \`${inspect_str}'`);
        }

        for (const method_name of method_names) {
            const method = await Object.find_method_under(self, method_name);

            if (method) {
                method.visibility = Visibility.private;
            } else {
                const inspect_str = (await Object.send(self, "inspect")).get_data<string>();
                throw new NameError(`undefined method \`${method_name}' for class \`${inspect_str}'`);
            }
        }

        return self;
    });

    mod.define_native_method("module_function", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const mod = self.get_data<Module>();

        for (const arg of args) {
            const name = (await Runtime.coerce_to_string(arg)).get_data<string>();
            const method = await Object.find_instance_method_under(self, name, true);

            if (method) {
                mod.get_singleton_class().get_data<Class>().methods[name] = method;
            } else {
                throw new NameError(`undefined method \`${name}' for module \`${mod.name}'`);
            }
        }

        if (args.length === 1) {
            return args[0]
        } else {
            return RubyArray.new(args);
        }
    });

    mod.define_native_method("deprecate_constant", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const mod = self.get_data<Module>();

        for (const arg of args) {
            const name = (await Runtime.coerce_to_string(arg)).get_data<string>();
            const constant = mod.constants[name];

            if (!constant) {
                throw new NameError(`constant ${name} not defined`);
            }

            mod.deprecate_constant(name, constant);
        }

        return self;
    });

    mod.define_native_method("nesting", async (self: RValue): Promise<RValue> => {
        return await RubyArray.new(ExecutionContext.current.frame?.nesting || []);
    });

    mod.define_native_method("method_defined?", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const method_name = (await Runtime.coerce_to_string(args[0])).get_data<string>();
        const inherit = (args[1] || Qfalse).is_truthy();
        return await Object.find_instance_method_under(self, method_name, true, inherit) ? Qtrue : Qfalse;
    });

    mod.define_native_method("class_exec", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue, call_data?: CallData): Promise<RValue> => {
        const proc = block!.get_data<Proc>();
        const binding = proc.binding.with_self(self);
        let block_call_data: BlockCallData | undefined = undefined;

        if (call_data) {
            block_call_data = BlockCallData.create(call_data.argc, call_data.flag, call_data.kw_arg);
        }

        return await proc.with_binding(binding).call(ExecutionContext.current, args, kwargs, undefined, block_call_data);
    });

    mod.define_native_method("name", async (self: RValue): Promise<RValue> => {
        return await self.get_data<Module>().full_name_rval();
    });

    const instance_methods_from = async (mod: RValue): Promise<RValue[]> => {
        const results = [];
        const mod_methods = mod.get_data<Module>().methods;

        for (const method_name in mod_methods) {
            const method = mod_methods[method_name];

            switch (method.visibility) {
                case Visibility.public:
                case Visibility.protected:
                    results.push(await Runtime.intern(method_name));
                    break;
            }
        }

        return results;
    }

    mod.define_native_method("instance_methods", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const include_super = (args[0] || Qtrue).is_truthy();
        const results = [];

        if (include_super) {
            await Runtime.each_unique_ancestor(self, true, async (ancestor: RValue): Promise<boolean> => {
                results.push(...await instance_methods_from(ancestor));
                return true;
            });
        } else {
            results.push(...await instance_methods_from(self));
        }

        return await RubyArray.new(results);
    });

    mod.define_native_method("set_temporary_name", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const temp_name = (await Runtime.coerce_to_string(args[0] || Qnil)).get_data<string>();
        self.get_data<Module>().temporary_name = temp_name;
        return self;
    });

    mod.define_native_method("<", (self: RValue, args: RValue[]): RValue => {
        if (!args[0] || (args[0].klass != ModuleClass && args[0].klass != ClassClass)) {
            throw new TypeError("compared with non class/module");
        }

        const other = args[0];

        if (self.klass === ClassClass && other.klass === ClassClass) {
            let current_superclass: RValue | null = self.get_data<Class>().superclass;

            while (current_superclass) {
                if (other === current_superclass) {
                    return Qtrue;
                }

                current_superclass = current_superclass.get_data<Class>().superclass;
            }
        }

        return Qfalse;
    });

    inited = true;
};

const define_attr_reader_on = (mod: RValue, name: string): string => {
    mod.get_data<Module>().define_native_method(name, (self: RValue): RValue => {
        return self.iv_get(`@${name}`);
    });

    return name;
}

const define_attr_writer_on = (mod: RValue, name: string): string => {
    const mtd_name = `${name}=`;

    mod.get_data<Module>().define_native_method(mtd_name, (self: RValue, args: RValue[]): RValue => {
        self.iv_set(`@${name}`, args[0]);
        return args[0];
    });

    return name;
}

const each_string = async (args: RValue[], callback: (arg: string) => Promise<void>) => {
    for (const arg of args) {
        await callback(await coerce_to_string(arg));
    }
}

const coerce_to_string = async (obj: RValue): Promise<string> => {
    if (obj.klass !== await String.klass() && obj.klass !== await Symbol.klass()) {
        const arg_s = (await Object.send(obj, "inspect")).get_data<string>();
        throw new TypeError(`${arg_s} is not a symbol nor a string`);
    }

    return obj.get_data<string>();
}
