export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["icons/icon-192.png","icons/icon-512.png","manifest.webmanifest"]),
	mimeTypes: {".png":"image/png",".webmanifest":"application/manifest+json"},
	_: {
		client: {"start":"_app/immutable/entry/start.Cl7gY2sS.js","app":"_app/immutable/entry/app.DKnX93yh.js","imports":["_app/immutable/entry/start.Cl7gY2sS.js","_app/immutable/chunks/entry.DNR2dQ7m.js","_app/immutable/chunks/scheduler.Dlc_SMu7.js","_app/immutable/entry/app.DKnX93yh.js","_app/immutable/chunks/preload-helper.BqjOJQfC.js","_app/immutable/chunks/scheduler.Dlc_SMu7.js","_app/immutable/chunks/index.xVzthpVW.js"],"stylesheets":[],"fonts":[],"uses_env_dynamic_public":false},
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
