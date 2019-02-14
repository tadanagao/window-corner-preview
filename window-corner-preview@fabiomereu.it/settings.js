"use strict";

// Global modules
const Lang = imports.lang;
const Signals = imports.signals;

// Internal modules
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

// Schema keys
const SETTING_BEHAVIOR_MODE = "behavior-mode";
const SETTING_FOCUS_HIDDEN = "focus-hidden";
const SETTING_INITIAL_ZOOM = "initial-zoom";
const SETTING_INITIAL_LEFT_CROP = "initial-left-crop";
const SETTING_INITIAL_RIGHT_CROP = "initial-right-crop";
const SETTING_INITIAL_TOP_CROP = "initial-top-crop";
const SETTING_INITIAL_BOTTOM_CROP = "initial-bottom-crop";
const SETTING_INITIAL_CORNER = "initial-corner";
const SETTING_LAST_WINDOW_HASH = "last-window-hash";

const WindowCornerSettings = new Lang.Class({

    Name: "WindowCornerPreview.settings",

    _init: function() {
        this._settings = Convenience.getSettings();
        this._settings.connect("changed", Lang.bind(this, this._onChanged));
    },

    _onChanged: function(settings, key) {
        // "my-property-name" => myPropertyName
        const property = key.replace(/-[a-z]/g, function (az) {
            return az.substr(1).toUpperCase();
        });
        this.emit("changed", property);
    },

    get focusHidden() {
        return this._settings.get_boolean(SETTING_FOCUS_HIDDEN);
    },

    set focusHidden(value) {
        this._settings.set_boolean(SETTING_FOCUS_HIDDEN, value);
    },

    get initialZoom() {
        return this._settings.get_double(SETTING_INITIAL_ZOOM);
    },

    set initialZoom(value) {
        this._settings.set_double(SETTING_INITIAL_ZOOM, value);
    },

    get initialLeftCrop() {
        return this._settings.get_double(SETTING_INITIAL_LEFT_CROP);
    },

    set initialLeftCrop(value) {
        this._settings.set_double(SETTING_INITIAL_LEFT_CROP, value);
    },

    get initialRightCrop() {
        return this._settings.get_double(SETTING_INITIAL_RIGHT_CROP);
    },

    set initialRightCrop(value) {
        this._settings.set_double(SETTING_INITIAL_RIGHT_CROP, value);
    },

    get initialTopCrop() {
        return this._settings.get_double(SETTING_INITIAL_TOP_CROP);
    },

    set initialTopCrop(value) {
        this._settings.set_double(SETTING_INITIAL_TOP_CROP, value);
    },

    get initialBottomCrop() {
        return this._settings.get_double(SETTING_INITIAL_BOTTOM_CROP);
    },

    set initialBottomCrop(value) {
        this._settings.set_double(SETTING_INITIAL_BOTTOM_CROP, value);
    },

    get initialCorner() {
        return this._settings.get_enum(SETTING_INITIAL_CORNER);
    },

    set initialCorner(value) {
        this._settings.set_enum(SETTING_INITIAL_CORNER, value);
    },

    get behaviorMode() {
        return this._settings.get_string(SETTING_BEHAVIOR_MODE);
    },

    set behaviorMode(value) {
        this._settings.set_string(SETTING_BEHAVIOR_MODE, value);
    },

    get lastWindowHash() {
        return this._settings.get_string(SETTING_LAST_WINDOW_HASH);
    },

    set lastWindowHash(value) {
        this._settings.set_string(SETTING_LAST_WINDOW_HASH, value);
    }
});

Signals.addSignalMethods(WindowCornerSettings.prototype);
