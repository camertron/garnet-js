// Taken from https://github.com/flexdinesh/browser-or-node/blob/master/src/index.js

const isBrowser =
  typeof window !== "undefined" && typeof window.document !== "undefined";

const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

const isWebWorker =
  typeof self === "object" &&
  self.constructor &&
  self.constructor.name === "DedicatedWorkerGlobalScope";

export { isBrowser, isWebWorker, isNode };
