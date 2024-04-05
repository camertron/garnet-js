import * as Garnet from "./garnet";
import { RValue } from './runtime';

export const evaluate = async (code: string): Promise<RValue> => {
    try {
        return await Garnet.unsafe_evaluate(code);
    } catch (e) {
        if (e instanceof RValue) {
            throw e.get_data<Error>();
        }

        throw e;
    }
};
