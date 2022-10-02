import { ExecutionContext } from "../execution_context";
import { Runtime, RValue, ObjectClass, Class, Callable } from "../runtime";

export abstract class Proc {
    static new(callable: Callable): RValue {
        return new RValue(ProcClass, callable);
    }
}

export const ProcClass = Runtime.define_class("Proc", ObjectClass, (klass: Class) => {
    klass.define_native_method("call", (self: RValue, args: RValue[]): RValue => {
        const callable = self.get_data<Callable>();
        return callable.call(ExecutionContext.current, self, args);
    });
});
