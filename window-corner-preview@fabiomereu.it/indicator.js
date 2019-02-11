"use strict";

// Global modules
const Lang = imports.lang;
const St = imports.gi.St;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

// Internal modules
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const PopupSliderMenuItem = Me.imports.popupSliderMenuItem.PopupSliderMenuItem;
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;
const Bundle = Me.imports.bundle;
const Polygnome = Me.imports.polygnome;
const Preview = Me.imports.preview;

// Wrapper for GNOME display cross versions
const DisplayWrapper = Polygnome.DisplayWrapper;

// Utilities
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

const WindowCornerIndicator = new Lang.Class({

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
