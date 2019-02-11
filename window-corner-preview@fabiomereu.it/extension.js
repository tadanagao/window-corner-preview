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
const Main = imports.ui.main;

// Internal modules
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Preview = Me.imports.preview;
const Indicator = Me.imports.indicator;

const WindowCornerPreview = Preview.WindowCornerPreview;
const WindowCornerIndicator = Indicator.WindowCornerIndicator;

let menu;

function init() {
    // nothing
}

function enable() {
    menu = new WindowCornerIndicator();
    menu.preview = new WindowCornerPreview();
    menu.enable();
    Main.panel.addToStatusArea("WindowCornerIndicator", menu);
}

function disable() {
    menu.preview.passAway();
    menu.disable();
    menu.destroy();
}
