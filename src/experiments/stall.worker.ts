// Explicit test fixture: deliberately never responds, for the real 10 second deadline experiment.
globalThis.onmessage = () => {};
export {};
