

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.DE5Op9dY.js","_app/immutable/chunks/scheduler.Dlc_SMu7.js","_app/immutable/chunks/index.DCbmexn9.js"];
export const stylesheets = ["_app/immutable/assets/0.SaJtw-y8.css"];
export const fonts = [];
