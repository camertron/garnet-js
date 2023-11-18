import { ExecutionContext } from "../execution_context";
import { RValue, Class, Callable } from "../runtime";

export const defineProcBehaviorOn = (klass: Class) => {
    klass.define_native_method("call", (self: RValue, args: RValue[]): RValue => {
        const callable = self.get_data<Callable>();
        return callable.call(ExecutionContext.current, self, args);
    });
};
