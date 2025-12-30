import { NotImplementedError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, Module, ModuleClass, Qnil, RValue, Runtime } from "../runtime";
import { Object } from "../runtime/object";

export enum DefinedType {
    NIL,
    IVAR,
    LVAR,
    GVAR,
    CVAR,
    CONST,
    METHOD,
    YIELD,
    ZSUPER,
    SELF,
    TRUE,
    FALSE,
    ASGN,
    EXPR,
    REF,
    FUNC,
    CONST_FROM
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

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const object = context.pop()!;
        let result: RValue | null = null;

        switch (this.type) {
            case DefinedType.NIL:
            case DefinedType.SELF:
            case DefinedType.TRUE:
            case DefinedType.FALSE:
            case DefinedType.ASGN:
            case DefinedType.EXPR:
                result = this.message;
                break;

            case DefinedType.IVAR:
                if (context.frame!.self.iv_exists(this.name)) {
                    result = this.message;
                }

                break;

            case DefinedType.LVAR:
                throw new NotImplementedError("defined LVAR");

            case DefinedType.GVAR:
                if (context.globals[this.name]) {
                    result = this.message;
                }

                break;

            case DefinedType.CVAR:
                let klass = context.frame!.self;
                if (klass.klass !== ModuleClass) klass = klass.get_data<Class>().get_singleton_class();

                if (await klass.cvar_exists(this.name)) {
                    result = this.message;
                }

                break;

            case DefinedType.CONST:
                let klass2 = context.frame!.self;

                if (klass2.klass !== ModuleClass) {
                    const klass2_class = klass2.get_data<Class>();

                    if (klass2_class) {
                        klass2 = klass2_class.get_singleton_class();
                    } else {
                        result = Qnil;
                        break;
                    }
                }

                if (await klass2.get_data<Class>().find_constant(this.name)) {
                    result = this.message;
                }

                break;

            case DefinedType.METHOD:
                throw new NotImplementedError("defined METHOD");

            case DefinedType. YIELD:
                throw new NotImplementedError("defined YIELD");

            case DefinedType.ZSUPER:
                throw new NotImplementedError("defined ZSUPER");

            case DefinedType.REF:
                throw new NotImplementedError("defined REF");

            case DefinedType.FUNC:
                if (await Object.find_method_under(object.klass, this.name)) {
                    result = this.message;
                }

                break;

            case DefinedType.CONST_FROM:
                if (await object.get_data<Module>().find_constant(this.name)) {
                    result = this.message;
                }

                break;
        }

        context.push(result || Qnil);
        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 2;
    }
}
