import { Class, NumericClass, Runtime } from "../runtime"

export const init = () => {
    NumericClass.get_data<Class>().include(Runtime.constants["Comparable"]);
}
