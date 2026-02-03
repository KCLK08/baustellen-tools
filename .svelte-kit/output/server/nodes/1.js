

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.D5eKav7D.js","_app/immutable/chunks/scheduler.Dlc_SMu7.js","_app/immutable/chunks/index.DCbmexn9.js","_app/immutable/chunks/entry.9CHjQ6jQ.js"];
export const stylesheets = [];
export const fonts = [];
