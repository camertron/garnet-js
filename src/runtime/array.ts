import { Runtime, RValue, ObjectClass } from "../runtime";

export abstract class Array {
    static new(arr?: RValue[]): RValue {
        return new RValue(ArrayClass.klass, arr || []);
    }
}

export const ArrayClass = Runtime.define_class("Array", ObjectClass);
