var Module = {
	locateFile: function (path) {
		try { return new URL(path, document.baseURI).href; }
		catch (e) { return path; }
	},
	onAbort: function (what) {
		window.__chiakiWasmAbort = String(what);
		console.error(what);
	},
	onRuntimeInitialized: function () {
		window.__chiakiWasmReady = 1;
	}
};
