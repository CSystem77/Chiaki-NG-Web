// Run with: node --test wasm/proxy/profiles.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import "../www/profiles.js";

const base = () => ({
	bitrate: "15000", language: "en", psnId: "abc",
	keyboardEnabled: true, keymap: { cross: ["Space"] }, mousemap: { r2: ["Mouse0"] },
	mouseTouchEnabled: true, mouseStick: "rs", mouseSens: 80, mouseInvertY: false
});

test("a Default profile is created from the live controls", () => {
	const st = ChiakiProfiles.state(base());
	assert.equal(st.list.length, 1);
	assert.equal(st.list[0].name, "Default");
	assert.equal(st.list[0].controls.mouseSens, 80);
	assert.equal(st.list[0].controls.bitrate, undefined, "non-control settings stay global");
});

test("new profiles copy current controls, and switching swaps only controls", () => {
	let s = ChiakiProfiles.create(base(), "Shooter");
	const shooter = s.controlProfiles.active;
	s = { ...s, mouseSens: 200, mouseInvertY: true, keymap: { cross: ["KeyJ"] }, bitrate: "50000" };
	s = ChiakiProfiles.switchTo(s, "p1");
	assert.equal(s.mouseSens, 80);
	assert.equal(s.mouseInvertY, false);
	assert.deepEqual(s.keymap, { cross: ["Space"] });
	assert.equal(s.bitrate, "50000", "switching must not touch stream settings");
	s = ChiakiProfiles.switchTo(s, shooter);
	assert.equal(s.mouseSens, 200, "edits made while a profile was active are kept");
	assert.deepEqual(s.keymap, { cross: ["KeyJ"] });
});

test("profile objects are not shared with live settings", () => {
	let s = ChiakiProfiles.create(base(), "Copy");
	s.keymap.cross.push("KeyX");
	s = ChiakiProfiles.switchTo(s, "p1");
	assert.deepEqual(s.keymap, { cross: ["Space"] });
});

test("names are required and unique; at least one profile remains", () => {
	let s = ChiakiProfiles.create(base(), "Racing");
	assert.throws(() => ChiakiProfiles.create(s, "  racing "), (e) => e.code === "profiles.errExists");
	assert.throws(() => ChiakiProfiles.create(s, "   "), (e) => e.code === "profiles.errName");
	s = ChiakiProfiles.rename(s, s.controlProfiles.active, "Racing games");
	assert.equal(ChiakiProfiles.state(s).list.find((p) => p.id === s.controlProfiles.active).name, "Racing games");
	s = ChiakiProfiles.remove(s, s.controlProfiles.active);
	assert.equal(s.controlProfiles.active, "p1");
	assert.equal(s.mouseSens, 80);
	assert.throws(() => ChiakiProfiles.remove(s, "p1"), (e) => e.code === "profiles.errLast");
});

test("syncActive stores the live controls in the active profile only", () => {
	let s = ChiakiProfiles.create(base(), "Other");
	s = ChiakiProfiles.syncActive({ ...s, mouseSens: 5 });
	const st = ChiakiProfiles.state(s);
	assert.equal(st.list.find((p) => p.id === st.active).controls.mouseSens, 5);
	assert.equal(st.list.find((p) => p.id === "p1").controls.mouseSens, 80);
});

test("settings a profile lacks fall back instead of leaking from the previous profile", () => {
	let s = ChiakiProfiles.create(base(), "Inverted");
	const inverted = s.controlProfiles.active;
	s = { ...s, controlProfiles: { ...s.controlProfiles, list: s.controlProfiles.list.map((p) => p.id === "p1" ? { ...p, controls: { mouseSens: 60 } } : p) } };
	s = ChiakiProfiles.switchTo({ ...s, mouseInvertY: true }, "p1");
	assert.equal(s.mouseInvertY, undefined, "app defaults apply on load");
	assert.equal(s.mouseSens, 60);
	s = ChiakiProfiles.switchTo(s, inverted);
	assert.equal(s.mouseInvertY, true);
});

test("corrupt profile data falls back safely", () => {
	const st = ChiakiProfiles.state({ ...base(), controlProfiles: { active: "nope", list: [null, { id: 3 }, { id: "x", name: "", controls: {} }] } });
	assert.equal(st.list.length, 1);
	assert.equal(st.active, st.list[0].id);
});
