export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "baustellen-tools/_app",
	assets: new Set([".nojekyll","favicon.ico","icons/icon-192.png","icons/icon-512.png","manifest.webmanifest"]),
	mimeTypes: {".png":"image/png",".webmanifest":"application/manifest+json"},
	_: {
		client: {"start":"_app/immutable/entry/start.B_RfT0Vr.js","app":"_app/immutable/entry/app.nwYK2qyk.js","imports":["_app/immutable/entry/start.B_RfT0Vr.js","_app/immutable/chunks/entry.Ft0171Xe.js","_app/immutable/chunks/scheduler.Dlc_SMu7.js","_app/immutable/entry/app.nwYK2qyk.js","_app/immutable/chunks/preload-helper.D6kgxu3v.js","_app/immutable/chunks/scheduler.Dlc_SMu7.js","_app/immutable/chunks/index.DCbmexn9.js"],"stylesheets":[],"fonts":[],"uses_env_dynamic_public":false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
