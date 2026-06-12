import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Disassembler } from "../disassembler";
import Send from "./send";

export default class OptSendWithoutBlock extends Instruction {
    public call_data: MethodCallData;
    private _send: Send;

    constructor(call_data: MethodCallData) {
        super();
        this.call_data = call_data;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        return this.send.call(context);
    }

    get send(): Send {
        if (!this._send) {
            this._send = new Send(this.call_data, null);
        }

        return this._send;
    }

    pops(): number {
        return this.send.pops();
    }

    pushes(): number {
        return this.send.pushes();
    }

    length(): number {
        return this.send.length();
    }

    disasm(fmt: Disassembler): string {
        return fmt.instruction("opt_send_without_block", [
            fmt.calldata(this.call_data)
        ]);
    }
}