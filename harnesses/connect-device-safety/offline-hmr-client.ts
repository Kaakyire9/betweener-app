/** Standalone lab only: no reload socket, console forwarding, or network access. */
const offlineHmrClient = Object.freeze({
  setup(..._args: unknown[]) {},
  enable() {},
  disable() {},
  registerBundle(..._args: unknown[]) {},
  log(..._args: unknown[]) {},
});
export default offlineHmrClient;
