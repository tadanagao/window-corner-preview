// Copyright (c) 2017 Fabius <fabio@mereu.info>
// Released under the MIT license
//
// Window Corner Preview Gnome Extension
//
// Purpose: It adds a menu to Gnome panel from which you can turn on a preview of any desktop window
//          helping you watch a movie or a video while studying or working
//
// This is a fork of https://github.com/Exsul/float-youtube-for-gnome by "Enelar" Kirill Berezin
// which was originally forked itself from https://github.com/Shou/float-mpv by "Shou" Benedict Aas
//

/////// https://github.com/GNOME/gnome-shell/blob/fbc60199bc67de9cdabcb123802142f2ba9e0a5b/js/ui/status/system.js
////// https://github.com/GNOME/gnome-shell/blob/695bfb96160033be55cfb5ac41c121998f98c328/js/ui/magnifier.js
///// https://github.com/GNOME/gnome-shell/blob/695bfb96160033be55cfb5ac41c121998f98c328/js/ui/pointerWatcher.js



// Imports
const Lang = imports.lang;
const Main = imports.ui.main;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const Slider = imports.ui.slider;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;

// External constants
const GTK_MOUSE_LEFT_BUTTON = 1;
const GTK_MOUSE_MIDDLE_BUTTON = 2;
const GTK_MOUSE_RIGHT_BUTTON = 3;

// Extension settings
const MIN_ZOOM = 0.10; // User shouldn't be able to make the preview too small or big, as it may break normal experience
const MAX_ZOOM = 0.75;

const MAX_TITLE = 25; // Truncate too long window titles on the menu

const CORNER_TOP_LEFT = 0;
const CORNER_TOP_RIGHT = 1;
const CORNER_BOTTOM_RIGHT = 2;
const CORNER_BOTTOM_LEFT = 3;
const CORNER_TOT = 4; // Future: will be added middle top, bottom, left, right side; this is used for mod %

// Extension default value, in the future some last-settings-memory may be add
const DEFAULT_ZOOM = 0.20;
const DEFAULT_CORNER = CORNER_TOP_RIGHT;


// Utilities
function normalizeRange(denormal, min, max) {
    // To a range 0-1
    return (denormal - min) / (max - min);
};

function deNormalizeRange(normal, min, max) {
    // from [0, 1] to MIN - MAX
    return (max - min) * normal + min;
};

function CSignalBundle() {
  // Helper to disconnect more signals at once
  var _connections = [];

  this.tryConnect = function (actor, signal, callback) {

    try {
      var handle = actor.connect(signal, callback);
      _connections.push({actor: actor, handle: handle});
    }

    catch(e) {
      log("CSignalBundle.tryConnect failed", e);
    }
  };

  this.disconnectAll = function () {

    for (var i = 0; i < _connections.length; i++) {
      try {
        var connection = _connections[i];
        connection.actor.disconnect(connection.handle);
        _connections[i] = null;
      }

      catch(e) {
        log("CSignalBundle.disconnectAll failed", e);
      }
    }
    _connections = [];
  };


}

// Result: [{windows: [{win1}, {win2}, ...], workspace: {workspace}, index: nWorkspace, isActive: true|false}, ..., {...}]
// Omit empty (with no windows) workspaces from the array
function getWorkspaceWindowsArray() {
    let array = [];

    let wsActive = global.screen.get_active_workspace_index();

    for (let i = 0; i < global.screen.n_workspaces; i++) {
        let workspace = global.screen.get_workspace_by_index(i);
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

// Char based, so not very precise for now
function spliceTitle(text) {
    text = text || "";
    if (text.length > MAX_TITLE) {
        return text.substr(0, MAX_TITLE - 2) + "...";
    }
    else {
        return text;
    }
};

function CWindowPreview() {

    let self = this;

    // Defaulting
    let _corner = DEFAULT_CORNER;
    let _zoom = DEFAULT_ZOOM;

    let _container;
    let _window;

    let _windowSignals;

    // Event handlers
    let _onClick = function (s, event) {
        switch(event.get_button()) {
            case GTK_MOUSE_RIGHT_BUTTON:
                _corner += 1;
            break;

            case GTK_MOUSE_MIDDLE_BUTTON:
                _corner += (-1 + 4);
                break;

            default: // GTK_MOUSE_LEFT_BUTTON:
                _corner += 2;
        }
        _corner %= CORNER_TOT;
        _setPosition();
    };

    let _onEnter = function () {
        Tweener.addTween(_container, {
            opacity: 25,
            time: 0.6,
            transition: "easeInCubic"
        });
    };

    let _onLeave = function () {
        Tweener.addTween(_container, {
            opacity: 255,
            time: 0.6,
            transition: "easeInCubic"
        });
    };

    let _onWindowUnmanaged = function () {
        if (self.onWindowUnmanaged) self.onWindowUnmanaged(_window); 
        _disable();
    };

    // Create window preview
    let _enable = function(window, zoom) {
        _disable();

        if (! window) return;

        _window = window;

        _windowSignals = new CSignalBundle();

        if (zoom) _zoom = zoom;

        _windowSignals.tryConnect(_window, "unmanaged", _onWindowUnmanaged);
        // Version 3.10 does not support size-changed
        _windowSignals.tryConnect(_window, "size-changed", _setThumbnail);


        _container = new St.Button({style_class: "window-corner-preview"});

        // Attatch events
        _container.connect("enter-event", _onEnter);
        _container.connect("leave-event", _onLeave);
        // Don't use button-press-event, as set_position conflicts and Gtk would react for enter and leave event of ANY item on the chrome area
        _container.connect("button-release-event", _onClick);

        Main.layoutManager.addChrome(_container);

        _setThumbnail();
    };

    // Destroy window preview
    let _disable = function() {
        if (_window) _window = null;

        if (_windowSignals) _windowSignals.disconnectAll();

        if (!_container) return;

        Main.layoutManager.removeChrome(_container);
        _container.destroy();
        _container = null;
    };

    // Align the preview along the chrome area
    let _setPosition = function() {
        let _posX, _posY;

        let rectMonitor = Main.layoutManager.getWorkAreaForMonitor(global.screen.get_current_monitor());

        let rectChrome = {
            x1: rectMonitor.x,
            y1: rectMonitor.y,
            x2: rectMonitor.width + rectMonitor.x - _container.get_width(),
            y2: rectMonitor.height + rectMonitor.y - _container.get_height()
        };

        switch (_corner) {

            case CORNER_TOP_LEFT:
                _posX = rectChrome.x1;
                _posY = rectChrome.y1;
                break;

            case CORNER_BOTTOM_LEFT:
                _posX = rectChrome.x1;
                _posY = rectChrome.y2;
                break;

            case CORNER_BOTTOM_RIGHT:
                _posX = rectChrome.x2;
                _posY = rectChrome.y2;
                break;

            default: // CORNER_TOP_RIGHT:
                _posX = rectChrome.x2;
                _posY = rectChrome.y1;
        }
        _container.set_position(_posX, _posY);
    };

    // Create a window thumbnail and adds it to the container
    let _setThumbnail = function() {
        let mutw = _window.get_compositor_private();

        if (! mutw) return;

        let windowTexture = mutw.get_texture();
        let [windowWidth, windowHeight] =  windowTexture.get_size();

        // Calculate width of the preview
        let targetWidth;
        let rectMonitor = Main.layoutManager.getWorkAreaForMonitor(global.screen.get_current_monitor());
        if (_zoom) {
            targetWidth = rectMonitor.width * _zoom; // Screen-width proportioned
        }
        else {
            targetWidth = self.width || 0.0; // Fixed pixels
        }

        // No magnification allowed
        if (windowWidth < targetWidth) targetWidth = windowWidth;
        // Height of target keeps 1:1 ratio
        let targetHeight = windowHeight * targetWidth / windowWidth;

        let thumbnail = new Clutter.Clone({
            source: windowTexture,
            reactive: true,
            width: targetWidth,
            height: targetHeight
        });

        _container.foreach(function (actor) {
            actor.destroy();
        });

        _container.add_actor(thumbnail);
        _setPosition();
    };

    self.enable = _enable;
    self.disable = _disable;
    self.isEnabled = function () {
        return !! _container;
    };
}



const CWindowCornerPreviewMenu = new Lang.Class({
    Name: "WindowCornerPreview.menu",
    Extends: PanelMenu.Button,

    _init: function () {
        this.parent(null, "WindowCornerPreview.menu");

        // Defaulting
        this.zoom = DEFAULT_ZOOM; 
    },

    // Handler to turn preview on / off
    _onMenuIsEnabled: function (item) {
        if (! item.state) {
            this.preview.disable();
        }
        else if (this.lastPreviewedWindow) {
            this.preview.enable(this.lastPreviewedWindow, this.zoom);
        }
    },

    // Recreate preview when zoom slider value changes
    _onMenuZoomSlider: function (slider) {
        this.zoom = deNormalizeRange(slider.value, MIN_ZOOM, MAX_ZOOM);
        this.menuZoomLabel.label.set_text("Monitor Zoom:  " + Math.floor(this.zoom * 100).toString() + "%");
        if (this.lastPreviewedWindow && this.preview.isEnabled()) {
            this.preview.enable(this.lastPreviewedWindow, this.zoom);
        }
    },

    // Update windows list and other menus before menu pops up
    _onUserTriggered: function() {
        this.menuIsEnabled.setToggleState(this.preview.isEnabled());
        this.menuWindows.menu.removeAll();
        let workspaces = getWorkspaceWindowsArray();
        for (let i = 0; i < workspaces.length; i++) {
            let workspace = workspaces[i];
            // Cannot use nested submenus, for now it adds a separator after each workspace
            if (i > 0) {
                this.menuWindows.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
            // Populate window list on submenu
            workspace.windows.forEach(function (window) {
                let winMenuItem = new PopupMenu.PopupMenuItem(spliceTitle(window.get_title()));
                winMenuItem.connect("activate", Lang.bind(this, function () {
                    this.preview.enable(window, this.zoom);
                    this.lastPreviewedWindow = window;
                }));

                this.menuWindows.menu.addMenuItem(winMenuItem);
            }, this);
        }
    },

    _onWindowUnmanaged: function () {
        this.lastPreviewedWindow = null;
    },

    enable: function () {
        this.preview = new CWindowPreview();
        // If a window on previews is closed, does not remeber it
        this.preview.onWindowUnmanaged = Lang.bind(this, this._onWindowUnmanaged);

        // Add icon
        this.icon = new St.Icon({ icon_name: "face-monkey-symbolic", style_class: "system-status-icon"});
        this.actor.add_actor(this.icon);

        // Prepare Menu...

        // 1. Preview ON/OFF
        this.menuIsEnabled = new PopupMenu.PopupSwitchMenuItem("Preview", false, {hover: false, reactive: true});
        this.menuIsEnabled.connect("toggled", Lang.bind(this, this._onMenuIsEnabled));
        this.menu.addMenuItem(this.menuIsEnabled);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 2. Windows list
        this.menuWindows = new PopupMenu.PopupSubMenuMenuItem("Windows");
        this.menu.addMenuItem(this.menuWindows);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 3a. Zoom label
        this.menuZoomLabel = new PopupMenu.PopupMenuItem("", {activate: false, reactive: false});
        this.menu.addMenuItem(this.menuZoomLabel);

        // 3b, Zoom slider
        this.menuSliderZoom = new PopupMenu.PopupBaseMenuItem({activate: false});
        this.sliderZoom = new Slider.Slider(normalizeRange(this.zoom, MIN_ZOOM, MAX_ZOOM));
        this.sliderZoom.connect("value-changed", Lang.bind(this, this._onMenuZoomSlider));
        this.menuSliderZoom.actor.add(this.sliderZoom.actor, {expand: true});
        this.menu.addMenuItem(this.menuSliderZoom);
        // Initialize the slider label
        this._onMenuZoomSlider(this.sliderZoom);
        this.actor.connect("enter-event", Lang.bind(this, this._onUserTriggered));
    },

    disable: function () {
        this.preview.disable();
        this.menu.removeAll();
    }
});


let menu;
 
function init() {
    // nothing
}
 
function enable() {
    menu = new CWindowCornerPreviewMenu();
    menu.enable();
    Main.panel.addToStatusArea("CWindowCornerPreviewMenu", menu);
}
 
function disable() {
    menu.disable();
    menu.destroy();
}
