// Named control profiles: key/mouse bindings plus mouse tuning, switchable per game.
// The live settings always hold the active profile; switching saves them back first.
globalThis.ChiakiProfiles = (() => {
	const CONTROL_KEYS = Object.freeze(["keyboardEnabled", "keymap", "mousemap", "mouseTouchEnabled",
		"mouseStick", "mouseSens", "mouseInvertY"]);
	const MAX_PROFILES = 32;
	const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
	const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
	const fail = (code, vars) => Object.assign(new Error(code), { code, vars });

	function capture(settings) {
		const out = {};
		for (const k of CONTROL_KEYS) if (settings[k] !== undefined) out[k] = clone(settings[k]);
		return out;
	}

	function cleanName(name) {
		return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
	}

	function newId(list) {
		let n = list.length + 1;
		while (list.some((p) => p.id === `p${n}`)) n++;
		return `p${n}`;
	}

	// Returns a valid { active, list } state, creating "Default" from the live settings if needed.
	function state(settings) {
		const raw = isObject(settings.controlProfiles) ? settings.controlProfiles : {};
		const list = (Array.isArray(raw.list) ? raw.list : [])
			.filter((p) => isObject(p) && typeof p.id === "string" && cleanName(p.name) && isObject(p.controls))
			.map((p) => ({ id: p.id, name: cleanName(p.name), controls: p.controls }))
			.slice(0, MAX_PROFILES);
		if (!list.length) list.push({ id: "p1", name: "Default", controls: capture(settings) });
		const active = list.some((p) => p.id === raw.active) ? raw.active : list[0].id;
		return { active, list };
	}

	const withState = (settings, st) => ({ ...settings, controlProfiles: st });

	// Keys a profile doesn't define fall back to defaults instead of leaking from the previous one.
	function applyControls(settings, controls) {
		const next = { ...settings };
		for (const k of CONTROL_KEYS) delete next[k];
		return { ...next, ...clone(controls) };
	}

	function validateName(st, name, exceptId) {
		const clean = cleanName(name);
		if (!clean) throw fail("profiles.errName");
		if (st.list.some((p) => p.id !== exceptId && p.name.toLowerCase() === clean.toLowerCase()))
			throw fail("profiles.errExists", { name: clean });
		return clean;
	}

	function syncActive(settings) {
		const st = state(settings);
		st.list = st.list.map((p) => p.id === st.active ? { ...p, controls: capture(settings) } : p);
		return withState(settings, st);
	}

	function switchTo(settings, id) {
		const synced = syncActive(settings);
		const st = synced.controlProfiles;
		const target = st.list.find((p) => p.id === id);
		if (!target) throw fail("profiles.errMissing");
		const next = applyControls(synced, target.controls);
		next.controlProfiles = { ...st, active: id };
		return next;
	}

	// New profiles start as a copy of the current controls.
	function create(settings, name) {
		const synced = syncActive(settings);
		const st = synced.controlProfiles;
		if (st.list.length >= MAX_PROFILES) throw fail("profiles.errMax", { n: MAX_PROFILES });
		const id = newId(st.list);
		const profile = { id, name: validateName(st, name), controls: capture(synced) };
		return withState(synced, { active: id, list: [...st.list, profile] });
	}

	function rename(settings, id, name) {
		const st = state(settings);
		const clean = validateName(st, name, id);
		return withState(settings, { ...st, list: st.list.map((p) => p.id === id ? { ...p, name: clean } : p) });
	}

	function remove(settings, id) {
		const st = state(settings);
		if (st.list.length <= 1) throw fail("profiles.errLast");
		const list = st.list.filter((p) => p.id !== id);
		if (st.active !== id) return withState(settings, { ...st, list });
		const next = applyControls(settings, list[0].controls);
		next.controlProfiles = { active: list[0].id, list };
		return next;
	}

	return Object.freeze({ CONTROL_KEYS, state, capture, syncActive, switchTo, create, rename, remove });
})();

// Keys tab UI (browser only). Relies on app.js globals, which load before this file.
if (typeof document !== "undefined") (() => {
	const page = document.querySelector('[data-page="keys"]');
	if (!page || typeof loadSettings !== "function") return;
	const tr = (key, vars) => (typeof t === "function" ? t(key, vars) : key);
	const bar = document.createElement("div");
	bar.className = "profile-bar";
	bar.innerHTML = `<div class="form-row">
	<label for="profile-select" data-i18n="profiles.label">Control profile:</label>
	<select id="profile-select"></select>
</div>
<div class="profile-actions">
	<button type="button" class="ghost" id="profile-new" data-i18n="profiles.new">New</button>
	<button type="button" class="ghost" id="profile-rename" data-i18n="profiles.rename">Rename</button>
	<button type="button" class="ghost" id="profile-delete" data-i18n="profiles.delete">Delete</button>
</div>
<div class="form-row profile-edit hidden" id="profile-edit">
	<input type="text" id="profile-name" maxlength="40" data-i18n-placeholder="profiles.namePh" placeholder="Profile name">
	<button type="button" class="ghost" id="profile-save" data-i18n="profiles.save">Save</button>
	<button type="button" class="ghost" id="profile-cancel" data-i18n="profiles.cancel">Cancel</button>
</div>
<p class="hint" id="profile-status" role="status" aria-live="polite" data-i18n="profiles.hint">Bindings and mouse settings on this page belong to the selected profile.</p>`;
	page.prepend(bar);
	// Keep these controls away from the settings page's auto-save and stream key handling.
	for (const type of ["input", "change"]) bar.addEventListener(type, (e) => e.stopPropagation());
	const $p = (id) => bar.querySelector("#" + id);
	const select = $p("profile-select"), edit = $p("profile-edit"), nameInput = $p("profile-name"), del = $p("profile-delete");
	let editing = null; // "new" | "rename"
	const say = (msg) => { $p("profile-status").textContent = msg; };
	const sayError = (err) => say(err.code ? tr(err.code, err.vars) : err.message);

	function render() {
		const st = ChiakiProfiles.state(settings);
		select.replaceChildren(...st.list.map((p) => {
			const o = document.createElement("option");
			o.value = p.id; o.textContent = p.name; o.selected = p.id === st.active;
			return o;
		}));
		del.disabled = st.list.length <= 1;
	}

	function commit(next, message) {
		settings = next;
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		loadSettings();
		if (typeof renderKeymap === "function") renderKeymap();
		if (typeof mouseLook !== "undefined") mouseLook = { x: 0, y: 0 };
		if (typeof scheduleCloudPush === "function") scheduleCloudPush();
		render();
		say(message);
	}

	function openEditor(mode) {
		editing = mode;
		nameInput.value = mode === "rename" ? select.selectedOptions[0]?.textContent || "" : "";
		edit.classList.remove("hidden");
		nameInput.focus();
	}
	function closeEditor() { editing = null; edit.classList.add("hidden"); }
	function resetDelete() { delete del.dataset.confirm; del.textContent = tr("profiles.delete"); }

	select.addEventListener("change", () => {
		closeEditor();
		try { commit(ChiakiProfiles.switchTo(settings, select.value), tr("profiles.switched", { name: select.selectedOptions[0]?.textContent || "" })); }
		catch (err) { sayError(err); render(); }
	});
	$p("profile-new").addEventListener("click", () => openEditor("new"));
	$p("profile-rename").addEventListener("click", () => openEditor("rename"));
	$p("profile-cancel").addEventListener("click", closeEditor);
	$p("profile-save").addEventListener("click", () => {
		try {
			const name = nameInput.value.replace(/\s+/g, " ").trim();
			const renaming = editing === "rename";
			const next = renaming ? ChiakiProfiles.rename(settings, select.value, name) : ChiakiProfiles.create(settings, name);
			closeEditor();
			commit(next, tr(renaming ? "profiles.renamed" : "profiles.created", { name }));
		} catch (err) { sayError(err); }
	});
	nameInput.addEventListener("keydown", (e) => {
		e.stopPropagation(); // typing a name must not trigger controller bindings
		if (e.key === "Enter") $p("profile-save").click();
		if (e.key === "Escape") closeEditor();
	});
	del.addEventListener("click", () => {
		const name = select.selectedOptions[0]?.textContent || "";
		if (del.dataset.confirm !== select.value) {
			del.dataset.confirm = select.value;
			del.textContent = tr("profiles.confirmDelete");
			say(tr("profiles.confirmHint", { name }));
			setTimeout(resetDelete, 4000);
			return;
		}
		resetDelete();
		try { commit(ChiakiProfiles.remove(settings, select.value), tr("profiles.deleted", { name })); }
		catch (err) { sayError(err); }
	});

	// app.js reads saved settings after this file loads (and again after account sync),
	// so refresh the list whenever settings are (re)loaded.
	const originalLoad = loadSettings;
	loadSettings = function (...args) {
		const result = originalLoad.apply(this, args);
		render();
		return result;
	};
	// Keep the active profile current as controls change, so account sync includes it.
	if (typeof saveSettings === "function") {
		const originalSave = saveSettings;
		saveSettings = function (...args) {
			const result = originalSave.apply(this, args);
			const synced = ChiakiProfiles.syncActive(settings);
			if (JSON.stringify(synced.controlProfiles) !== JSON.stringify(settings.controlProfiles)) {
				settings = synced;
				localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
			}
			return result;
		};
	}
	render();
})();
