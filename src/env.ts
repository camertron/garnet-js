// Taken from https://github.com/flexdinesh/browser-or-node/blob/master/src/index.js

const is_browser =
  typeof window !== "undefined" && typeof window.document !== "undefined";

const is_node =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

const is_web_worker =
  typeof self === "object" &&
  self.constructor &&
  self.constructor.name === "DedicatedWorkerGlobalScope";

export { is_browser, is_web_worker, is_node };
