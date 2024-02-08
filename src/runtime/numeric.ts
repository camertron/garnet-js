import { Class, NumericClass } from "../runtime"
import { Object } from "../runtime/object";

export const init = () => {
    NumericClass.get_data<Class>().include(Object.find_constant("Comparable")!);
}
