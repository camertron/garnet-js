import { Qnil, RValue } from "../runtime";

export type EarlyExitThrowable = { value: RValue };
export type ExitEarlyFn = (value: RValue) => RValue;

export const early_exit_handler = async (cb: (exit_early: ExitEarlyFn) => Promise<RValue>): Promise<RValue> => {
    const throwable: EarlyExitThrowable = { value: Qnil };

    try {
        return await cb((value: RValue) => {
            throwable.value = value;
            throw throwable;
        });
    } catch (e) {
        if (e === throwable) {
            return (e as EarlyExitThrowable).value;
        }

        throw e;
    }
};
