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

// Global modules
const Lang = imports.lang;
const Main = imports.ui.main;

// Internal modules
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Preview = Me.imports.preview;
const Indicator = Me.imports.indicator;
const Settings = Me.imports.settings;
const Signaling = Me.imports.signaling;

const WindowCornerPreview = Preview.WindowCornerPreview;
const WindowCornerIndicator = Indicator.WindowCornerIndicator;
const WindowCornerSettings = Settings.WindowCornerSettings;
const SignalConnector = Signaling.SignalConnector;

function onZoomChanged() {
    settings.initialZoom = this.zoom;
}

function onCropChanged() {
    settings.initialLeftCrop = this.leftCrop;
    settings.initialRightCrop = this.rightCrop;
    settings.initialTopCrop = this.topCrop;
    settings.initialBottomCrop = this.bottomCrop;
}

function onCornerChanged() {
    settings.initialCorner = this.corner;
}

function onSettingsChanged(settings, property) {
    if (["focusHidden"].indexOf(property) > -1) {
        // this = preview
        this[property] = settings[property];
    }
}

let preview, menu;
let settings, signals;

function init() {
    settings = new WindowCornerSettings();
    signals = new SignalConnector();
}

function enable() {
    preview = new WindowCornerPreview();
    signals.tryConnect(settings, "changed", Lang.bind(preview, onSettingsChanged));
    signals.tryConnect(preview, "zoom-changed", Lang.bind(preview, onZoomChanged));
    signals.tryConnect(preview, "crop-changed", Lang.bind(preview, onCropChanged));
    signals.tryConnect(preview, "corner-changed", Lang.bind(preview, onCornerChanged));

    // Initialize props
    preview.zoom = settings.initialZoom;
    preview.leftCrop = settings.initialLeftCrop;
    preview.rightCrop = settings.initialRightCrop;
    preview.topCrop = settings.initialTopCrop;
    preview.bottomCrop = settings.initialBottomCrop;
    preview.focusHidden = settings.focusHidden;
    preview.corner = settings.initialCorner;

    menu = new WindowCornerIndicator();
    menu.preview = preview;

    menu.enable();
    Main.panel.addToStatusArea("WindowCornerIndicator", menu);
}

function disable() {
    preview.passAway();
    signals.disconnectAll();
    menu.disable();
    menu.destroy();
    preview = null;
    menu = null;
}
