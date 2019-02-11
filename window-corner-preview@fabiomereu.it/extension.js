/*
    Copyright (c) 2017 Fabius <fabio@mereu.info>
    Released under the MIT license

    Window Corner Preview Gnome Extension

    Purpose: It adds a menu to the GNOME main panel from which you can turn the
             preview of any desktop window on.
             It can help you watch a movie or a video while studying or working.

    This is a fork of https://github.com/Exsul/float-youtube-for-gnome
        by "Enelar" Kirill Berezin which was originally forked itself
        from https://github.com/Shou/float-mpv by "Shou" Benedict Aas.

    Contributors:
        Scott Ames https://github.com/scottames
        Jan Tojnar https://github.com/jtojnar

*/

"use strict";

// Imports
const Lang = imports.lang;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const Slider = imports.ui.slider;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;
const Polygnome = Me.imports.polygnome;
const Bundle = Me.imports.bundle;
const Preview = Me.imports.preview;
const WindowCornerPreview = Preview.WindowCornerPreview;

const DisplayWrapper = Polygnome.DisplayWrapper;
const normalizeRange = Bundle.normalizeRange;
const deNormalizeRange = Bundle.deNormalizeRange;
const spliceTitle = Bundle.spliceTitle;

// Preview default values
const MIN_ZOOM = Preview.MIN_ZOOM;
const MAX_ZOOM = Preview.MAX_ZOOM;
const MAX_CROP_RATIO = Preview.MAX_CROP_RATIO;
const DEFAULT_ZOOM = Preview.DEFAULT_ZOOM;
const DEFAULT_CROP_RATIO = Preview.DEFAULT_CROP_RATIO;


// Result: [{windows: [{win1}, {win2}, ...], workspace: {workspace}, index: nWorkspace, isActive: true|false}, ..., {...}]
// Omit empty (with no windows) workspaces from the array
function getWorkspaceWindowsArray() {
    let array = [];

    let wsActive = DisplayWrapper.getWorkspaceManager().get_active_workspace_index();

    for (let i = 0; i < DisplayWrapper.getWorkspaceManager().n_workspaces; i++) {
        let workspace = DisplayWrapper.getWorkspaceManager().get_workspace_by_index(i);
        let windows = workspace.list_windows();
        if (windows.length) array.push({
            workspace: workspace,
            windows: windows,
            index: i,
            isActive: (i === wsActive)
        });
    }
    return array;
};

const PopupSliderMenuItem = new Lang.Class({
    Name: "WindowCornerPreview.PopupSliderMenuItem",
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(text, value, min, max, step, params) {

        this.min = (min !== undefined ? min : 0.0);
        this.max = (max !== undefined ? max : 1.0);
        this.defaultValue = (value !== undefined ? value : (this.max + this.min) / 2.0);
        // *** KNOWN ISSUE: Scrolling may get stucked if step value > 1.0 (and |min-max| is a low value)
        // due to const SLIDER_SCROLL_STEP = 0.02 on js/ui/slider.js ***
        this.step = step;
        params = params || {};

        params.activate = false;

        this.parent(params);

        this.label = new St.Label({
            text: text || ""
        });
        // Setting text to false allow a little bit extra space on the left
        if (text !== false) this.actor.add_child(this.label);
        this.actor.label_actor = this.label;

        this.slider = new Slider.Slider(0.0);
        this.value = this.defaultValue;

        // PopupSliderMenuItem emits its own value-change event which provides a normalized value
        this.slider.connect("value-changed", Lang.bind(this, function(x) {
            let normalValue = this.value;
            // Force the slider to set position on a stepped value (if necessary)
            if (this.step !== undefined) this.value = normalValue;
            // Don't through any event if step rounded it to the same value
            if (normalValue !== this._lastValue) this.emit("value-changed", normalValue);
            this._lastValue = normalValue;
        }));

        this.actor.add(this.slider.actor, {
            expand: true,
            align: St.Align.END
        });
    },

    get value() {
        return deNormalizeRange(this.slider.value, this.min, this.max, this.step);
    },

    set value(newValue) {
        this._lastValue = normalizeRange(newValue, this.min, this.max, this.step);
        this.slider.setValue(this._lastValue);
    }
});

const WindowCornerPreviewMenu = new Lang.Class({

    Name: "WindowCornerPreview.indicator",
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(null, "WindowCornerPreview.indicator");
    },

    // Handler to turn preview on / off
    _onMenuIsEnabled: function(item) {
        this.preview.toggle(item.state);
    },

    _updateSliders: function() {
        this.menuZoom.value = this.preview.zoom;
        this.menuZoomLabel.label.set_text("Monitor Zoom:  " + Math.floor(this.preview.zoom * 100).toString() + "%");

        this.menuLeftCrop.value = this.preview.leftCropRatio;
        this.menuRightCrop.value = this.preview.rightCropRatio;
        this.menuTopCrop.value = this.preview.topCropRatio;
        this.menuBottomCrop.value = this.preview.bottomCropRatio;
    },

    _onZoomChanged: function(source, value) {
        this.preview.zoom = value;
        this._updateSliders();
    },

    _onLeftCropChanged: function(source, value) {
        this.preview.leftCropRatio = value;
        this._updateSliders();
    },

    _onRightCropChanged: function(source, value) {
        this.preview.rightCropRatio = value;
        this._updateSliders();
    },

    _onTopCropChanged: function(source, value) {
        this.preview.topCropRatio = value;
        this._updateSliders();
    },

    _onBottomCropChanged: function(source, value) {
        this.preview.bottomCropRatio = value;
        this._updateSliders();
    },

    _onSettings: function() {
        Main.Util.trySpawnCommandLine("gnome-shell-extension-prefs window-corner-preview@fabiomereu.it");
    },

    // Update windows list and other menus before menu pops up
    _onUserTriggered: function() {
        this.menuIsEnabled.setToggleState(this.preview.enabled);
        this._updateSliders();
        this.menuWindows.menu.removeAll();
        getWorkspaceWindowsArray().forEach(function(workspace, i) {
            if (i > 0) {
                this.menuWindows.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

            // Populate window list on submenu
            workspace.windows.forEach(function(window) {
                let winMenuItem = new PopupMenu.PopupMenuItem(spliceTitle(window.get_title()));
                winMenuItem.connect("activate", Lang.bind(this, function() {
                    this.preview.window = window;
                    this.preview.show();
                }));

                this.menuWindows.menu.addMenuItem(winMenuItem);
            }, this);
        }, this);
    },

    _onSettingsChanged: function(settings, key) {
        this.preview.focusHidden = this.settings.get_boolean(Prefs.SETTING_FOCUS_HIDDEN);

        switch (key) {
            case Prefs.SETTING_BEHAVIOR_MODE:
                //log("behaviour", key);
                break;

            case Prefs.SETTING_FOCUS_HIDDEN:
                //log("focus", key);
                break;
        }

    },

    enable: function() {

        // Add icon
        this.icon = new St.Icon({
            icon_name: "face-monkey-symbolic",
            style_class: "system-status-icon"
        });
        this.actor.add_actor(this.icon);

        // Prepare Menu...

        // 1. Preview ON/OFF
        this.menuIsEnabled = new PopupMenu.PopupSwitchMenuItem("Preview", false, {
            hover: false,
            reactive: true
        });
        this.menuIsEnabled.connect("toggled", Lang.bind(this, this._onMenuIsEnabled));
        this.menu.addMenuItem(this.menuIsEnabled);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 2. Windows list
        this.menuWindows = new PopupMenu.PopupSubMenuMenuItem("Windows");
        this.menu.addMenuItem(this.menuWindows);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 3a. Zoom label
        this.menuZoomLabel = new PopupMenu.PopupMenuItem("", {
            activate: false,
            reactive: false
        });
        this.menu.addMenuItem(this.menuZoomLabel);

        // 3b, Zoom slider
        this.menuZoom = new PopupSliderMenuItem(false, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, 0.005); // slider step: 0.5%
        this.menuZoom.connect("value-changed", Lang.bind(this, this._onZoomChanged));
        this.menu.addMenuItem(this.menuZoom);

        // 4. Crop Sliders
        this.menuCrop = new PopupMenu.PopupSubMenuMenuItem("Crop");
        this.menu.addMenuItem(this.menuCrop);

        this.menuTopCrop = new PopupSliderMenuItem("Top", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuTopCrop.connect("value-changed", Lang.bind(this, this._onTopCropChanged));
        this.menuCrop.menu.addMenuItem(this.menuTopCrop);

        this.menuLeftCrop = new PopupSliderMenuItem("Left", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuLeftCrop.connect("value-changed", Lang.bind(this, this._onLeftCropChanged));
        this.menuCrop.menu.addMenuItem(this.menuLeftCrop);

        this.menuRightCrop = new PopupSliderMenuItem("Right", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuRightCrop.connect("value-changed", Lang.bind(this, this._onRightCropChanged));
        this.menuCrop.menu.addMenuItem(this.menuRightCrop);

        this.menuBottomCrop = new PopupSliderMenuItem("Bottom", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuBottomCrop.connect("value-changed", Lang.bind(this, this._onBottomCropChanged));
        this.menuCrop.menu.addMenuItem(this.menuBottomCrop);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 5. Settings
        this.menuSettings = new PopupMenu.PopupMenuItem("Settings");
        this.menuSettings.connect("activate", Lang.bind(this, this._onSettings));
        this.menu.addMenuItem(this.menuSettings);

        this.actor.connect("enter-event", Lang.bind(this, this._onUserTriggered));

        this.settings = Convenience.getSettings();

        this.settings.connect("changed", Lang.bind(this, this._onSettingsChanged));
        this._onSettingsChanged();

    },

    disable: function() {
        this.menu.removeAll();
    }
});


let menu;

function init() {
    // nothing
}

function enable() {
    menu = new WindowCornerPreviewMenu();
    menu.preview = new WindowCornerPreview();
    menu.enable();
    Main.panel.addToStatusArea("WindowCornerPreviewMenu", menu);
}

function disable() {
    menu.preview.passAway();
    menu.disable();
    menu.destroy();
}
