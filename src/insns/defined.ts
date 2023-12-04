import { NotImplementedError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, ModuleClass, Object, Qnil, RValue, Runtime } from "../runtime";

export enum DefinedType {
    TYPE_NIL,
    TYPE_IVAR,
    TYPE_LVAR,
    TYPE_GVAR,
    TYPE_CVAR,
    TYPE_CONST,
    TYPE_METHOD,
    TYPE_YIELD,
    TYPE_ZSUPER,
    TYPE_SELF,
    TYPE_TRUE,
    TYPE_FALSE,
    TYPE_ASGN,
    TYPE_EXPR,
    TYPE_REF,
    TYPE_FUNC,
    TYPE_CONST_FROM
}

export default class Defined extends Instruction {
    private type: DefinedType;
    private name: string;
    private message: RValue;

    constructor(type: DefinedType, name: string, message: RValue) {
        super();

        this.type = type;
        this.name = name;
        this.message = message;
    }

    call(context: ExecutionContext): ExecutionResult {
        const object = context.stack.pop()!;
        let result: RValue | null = null;

        switch (this.type) {
            case DefinedType.TYPE_NIL:
            case DefinedType.TYPE_SELF:
            case DefinedType.TYPE_TRUE:
            case DefinedType.TYPE_FALSE:
            case DefinedType.TYPE_ASGN:
            case DefinedType.TYPE_EXPR:
                result = this.message;
                break;

            case DefinedType.TYPE_IVAR:
                if (context.frame!.self.iv_exists(this.name)) {
                    result = this.message;
                }

                break;

            case DefinedType.TYPE_LVAR:
                throw new NotImplementedError("defined TYPE_LVAR");

            case DefinedType.TYPE_GVAR:
                if (context.globals[this.name]) {
                    result = this.message;
                }

                break;

            case DefinedType.TYPE_CVAR:
                let klass = context.frame!.self;
                if (klass.klass !== ModuleClass) klass = klass.get_data<Class>().get_singleton_class();

                if (klass.iv_exists(this.name)) {
                    result = this.message;
                }

                break;

            case DefinedType.TYPE_CONST:
                let klass2 = context.frame!.self;
                if (klass2.klass !== ModuleClass) klass2 = klass2.get_data<Class>().get_singleton_class();

                if (klass2.get_data<Class>().find_constant(this.name)) {
                    result = this.message;
                }

                break;

            case DefinedType.TYPE_METHOD:
                throw new NotImplementedError("defined TYPE_METHOD");

            case DefinedType. TYPE_YIELD:
                throw new NotImplementedError("defined TYPE_YIELD");

            case DefinedType.TYPE_ZSUPER:
                throw new NotImplementedError("defined TYPE_ZSUPER");

            case DefinedType.TYPE_REF:
                throw new NotImplementedError("defined TYPE_REF");

            case DefinedType.TYPE_FUNC:
                if (Object.find_method_under(object.klass, this.name)) {
                    result = this.message;
                }

                break;

            case DefinedType.TYPE_CONST_FROM:
                throw new NotImplementedError("defined TYPE_CONST_FROM");
        }

        context.stack.push(result || Qnil);
        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 2;
    }
}
