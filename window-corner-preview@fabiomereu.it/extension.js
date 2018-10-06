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

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;

// External constants
const GTK_MOUSE_LEFT_BUTTON = 1;
const GTK_MOUSE_MIDDLE_BUTTON = 2;
const GTK_MOUSE_RIGHT_BUTTON = 3;

const GDK_SHIFT_MASK = 1;
const GDK_CONTROL_MASK = 4;
const GDK_MOD1_MASK = 8;
const GDK_ALT_MASK = GDK_MOD1_MASK; // Most cases

// Extension settings
const MIN_ZOOM = 0.10; // User shouldn't be able to make the preview too small or big, as it may break normal experience
const MAX_ZOOM = 0.75;

const MAX_CROP_RATIO = 0.85;

const MAX_TITLE = 25; // Truncate too long window titles on the menu

const CORNER_TOP_LEFT = 0;
const CORNER_TOP_RIGHT = 1;
const CORNER_BOTTOM_RIGHT = 2;
const CORNER_BOTTOM_LEFT = 3;

// Extension default value, in the future some last-settings-memory may be add
const DEFAULT_ZOOM = 0.20;
const DEFAULT_CORNER = CORNER_TOP_RIGHT;

const DEFAULT_CROP_RATIO = 0.0; // [0.0 - 1.0]

// Animation constants
const TWEEN_OPACITY_FULL = 255;
const TWEEN_OPACITY_SEMIFULL = Math.round(TWEEN_OPACITY_FULL * 0.90);
const TWEEN_OPACITY_HALF = Math.round(TWEEN_OPACITY_FULL * 0.50);
const TWEEN_OPACITY_TENTH = Math.round(TWEEN_OPACITY_FULL * 0.10);
const TWEEN_OPACITY_NULL = 0;

const TWEEN_TIME_SHORT = 0.25;
const TWEEN_TIME_MEDIUM = 0.6;
const TWEEN_TIME_LONG = 0.80;

// Settings feature is under development, for now use SETTING_* constants
const SETTING_MAGNIFICATION_ALLOWED = false;

// This is wrapper to maintain compatibility with GNOME-Shell 3.30+ as well as
// previous versions.
var DisplayWrapper = {
    getScreen: function() {
        return global.screen || global.display;
    },
    getWorkspaceManager: function() {
        return global.screen || global.workspace_manager;
    },
    getMonitorManager: function() {
        return global.screen || Meta.MonitorManager.get();
    }
};

// Utilities
function normalizeRange(denormal, min, max, step) {
    if (step !== undefined) denormal = Math.round(denormal / step) * step;
    // To a range 0-1
    return (denormal - min) / (max - min);
};

function deNormalizeRange(normal, min, max, step) {
    // from [0, 1] to MIN - MAX
    let denormal = (max - min) * normal + min;
    if (step !== undefined) denormal = Math.round(denormal / step) * step;
    return denormal;
};

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

// Helper to disconnect more signals at once
const CSignalBundle = new Lang.Class({

    Name: "WindowCornerPreview.signalBundle",

    _init: function () {
        this._connections = [];
    },

    tryConnect: function (actor, signal, callback) {
        try {
            let handle = actor.connect(signal, callback);
            this._connections.push({actor: actor, handle: handle});
        }

        catch(e) {
            logError(e, "CSignalBundle.tryConnect failed");
        }
    },

    disconnectAll: function () {
        for (let i = 0; i < this._connections.length; i++) {
            try {
                let connection = this._connections[i];
                connection.actor.disconnect(connection.handle);
                this._connections[i] = null;
            }

            catch(e) {
                logError(e, "CSignalBundle.disconnectAll failed");
            }
        }
        this._connections = [];
    }
});

const PopupSliderMenuItem = new Lang.Class({
    Name: "WindowCornerPreview.PopupSliderMenuItem",
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (text, value, min, max, step, params) {

        this.min = (min !== undefined ? min : 0.0);
        this.max = (max !== undefined ? max : 1.0);
        this.defaultValue = (value !== undefined ? value : (this.max + this.min) / 2.0);
        // *** KNOWN ISSUE: Scrolling may get stucked if step value > 1.0 (and |min-max| is a low value)
        // due to const SLIDER_SCROLL_STEP = 0.02 on js/ui/slider.js ***
        this.step = step;
        params = params || {};

        params.activate = false;

        this.parent(params);

        this.label = new St.Label({text: text || ""});
        // Setting text to false allow a little bit extra space on the left
        if (text !== false) this.actor.add_child(this.label);
        this.actor.label_actor = this.label;

        this.slider = new Slider.Slider(0.0);
        this.value = this.defaultValue;

        // PopupSliderMenuItem emits its own value-change event which provides a normalized value
        this.slider.connect("value-changed", Lang.bind(this, function (x) {
            let normalValue = this.value;
            // Force the slider to set position on a stepped value (if necessary)
            if (this.step !== undefined) this.value = normalValue;
            // Don't through any event if step rounded it to the same value
            if (normalValue !== this._lastValue) this.emit("value-changed", normalValue);
            this._lastValue = normalValue;
        }));

        this.actor.add(this.slider.actor, {expand: true, align: St.Align.END});
    },

    get value() {
        return deNormalizeRange(this.slider.value, this.min, this.max, this.step);
    },

    set value(newValue) {
        this._lastValue = normalizeRange(newValue, this.min, this.max, this.step);
        this.slider.setValue(this._lastValue);
    }
});

function CWindowPreview() {

    let self = this;

    // Defaulting
    let _corner = DEFAULT_CORNER;
    let _zoom = DEFAULT_ZOOM;

    let _leftCropRatio = DEFAULT_CROP_RATIO;
    let _rightCropRatio = DEFAULT_CROP_RATIO;
    let _topCropRatio = DEFAULT_CROP_RATIO;
    let _bottomCropRatio = DEFAULT_CROP_RATIO;

    // The preview is hidden when the overview is shown or the top window is on top, this property is used to restore visibility or not
    let _naturalVisibility = false;
    let _focusHidden = true;

    let _container;
    let _window;

    let _windowSignals = new CSignalBundle();
    let _environmentSignals = new CSignalBundle();

    self._onClick = function (actor, event) {
        let button = event.get_button();
        let state = event.get_state();

        // CTRL + LEFT BUTTON activate the window on top
        if (button === GTK_MOUSE_LEFT_BUTTON && (state & GDK_CONTROL_MASK)) {
            _window.activate(global.get_current_time());
        }

        // Otherwise move the preview to another corner
        else {
            switch(button) {
                case GTK_MOUSE_RIGHT_BUTTON:
                    self.corner += 1;
                break;

                case GTK_MOUSE_MIDDLE_BUTTON:
                    self.corner += -1;
                    break;

                default: // GTK_MOUSE_LEFT_BUTTON:
                    self.corner += 2;
            }
        }
    };

    self._onScroll = function (actor, event) {
        let scroll_direction = event.get_scroll_direction();

        let direction;
        switch (scroll_direction) {

            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                direction = +1.0
                break;

            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                direction = -1.0
                break;

            default:
                direction = 0.0;
        }

        if (! direction) return Clutter.EVENT_PROPAGATE;

        // On mouse over it's normally pretty transparent, but user needs to see more for adjusting it
        Tweener.addTween(_container, {opacity: TWEEN_OPACITY_SEMIFULL, time: TWEEN_TIME_SHORT, transition: "easeOutQuad"});

        // Coords are absolute, screen related
        let [mouseX, mouseY] = event.get_coords();

        // _container absolute rect
        let [actorX1, actorY1] = _container.get_transformed_position();
        let [actorWidth, actorHeight] = _container.get_transformed_size();
        let actorX2 = actorX1 + actorWidth;
        let actorY2 = actorY1 + actorHeight;

        // Distance of pointer from each side
        let deltaLeft = Math.abs(actorX1 - mouseX);
        let deltaRight = Math.abs(actorX2 - mouseX);
        let deltaTop = Math.abs(actorY1 - mouseY);
        let deltaBottom = Math.abs(actorY2 - mouseY);

        const SCROLL_ACTOR_MARGIN = 0.2; // 20% margin length
        const SCROLL_ZOOM_STEP = 0.01; // 1% zoom for step
        const SCROLL_CROP_STEP = 0.0063; // 0.005;


        let sortedDeltas = [
            {property: "leftCropRatio", pxDistance: deltaLeft, comparedDistance: deltaLeft / actorWidth, direction: -direction},
            {property: "rightCropRatio", pxDistance: deltaRight, comparedDistance: deltaRight / actorWidth, direction: -direction},
            {property: "topCropRatio", pxDistance: deltaTop, comparedDistance: deltaTop / actorHeight, direction: -direction /* feels more natural */},
            {property: "bottomCropRatio", pxDistance: deltaBottom, comparedDistance: deltaBottom / actorHeight, direction: -direction}
        ];
        sortedDeltas.sort(function (a, b) {return a.pxDistance - b.pxDistance});
        let deltaMinimum = sortedDeltas[0];

        // Scrolling inside the preview triggers the zoom
        if (deltaMinimum.comparedDistance > SCROLL_ACTOR_MARGIN) {

            self.zoom += direction * SCROLL_ZOOM_STEP;
        }

        // Scrolling along the margins triggers the cropping instead
        else {

            self[deltaMinimum.property] += deltaMinimum.direction * SCROLL_CROP_STEP;
        }
    };

    self._onEnter = function (actor, event) {

        let [x, y, state] = global.get_pointer();

        // SHIFT: ignore standard behavior
        if (state & GDK_SHIFT_MASK) {
            return Clutter.EVENT_PROPAGATE;
        }

        Tweener.addTween(_container, {
            opacity: TWEEN_OPACITY_TENTH,
            time: TWEEN_TIME_MEDIUM,
            transition: "easeOutQuad"
        });
    };

    self._onLeave = function () {
        Tweener.addTween(_container, {
            opacity: TWEEN_OPACITY_FULL,
            time: TWEEN_TIME_MEDIUM,
            transition: "easeOutQuad"
        });
    };

    self._onParamsChange = function () {
        // Zoom or crop properties changed
        if (self.isEnabled()) {
            self._setThumbnail();
        }
    };

    self._onWindowUnmanaged = function () {
        if (self.onWindowUnmanaged) self.onWindowUnmanaged(_window);
        self._disable();
    };

    self._adjustVisibility = function (options) {
        options = options || {};

        if (! _container) {
            if (options.onComplete) options.onComplete();
            return;
        }


        if (!self._overviewHidden !== !Main.overview.visibleTarget) log ("Main.overview.visible", Main.overview.visibleTarget);
        // Hide when overView is shown, or source window is on top, or user related reasons


        let canBeShownOnFocus = (! _focusHidden) || (global.display.focus_window !== _window);

        let calculatedVisibility =  _naturalVisibility && canBeShownOnFocus && (! Main.overview.visibleTarget);

        let calculatedOpacity = (calculatedVisibility ? TWEEN_OPACITY_FULL : TWEEN_OPACITY_NULL);
//log("containter visibile", _container.visible, "to set visible", calculatedVisibility, "opacity container", _container.get_opacity());



        if ((calculatedVisibility === _container.visible) && (calculatedOpacity === _container.get_opacity())) {
            // log("ALREADY OK");
            if (options.onComplete) options.onComplete();
        }

        else if (options.noAnimate) {
            // log("PLAIN");
            _container.set_opacity(calculatedOpacity)
            _container.visible = calculatedVisibility;
            if (options.onComplete) options.onComplete();
        }

        else {
            _container.reactive = false;
            if (! _container.visible) {
                _container.set_opacity(TWEEN_OPACITY_NULL);
                _container.visible = true;
            }
            Tweener.addTween(_container, {
                opacity: calculatedOpacity,
                time: TWEEN_TIME_SHORT,
                transition: "easeOutQuad",
                onComplete: function () {
                    _container.visible = calculatedVisibility;
                    _container.reactive = true;
                    if (options.onComplete) options.onComplete();
                }
            });
            // log("Traditional show/hide");
        }
    }

    self._onNotifyFocusWindow = function () {
        self._adjustVisibility();
    };

    self._onOverviewShowing = function () {
        self._adjustVisibility();
    };

    self._onOverviewHiding = function () {
        self._adjustVisibility();
    };


    // Create window preview
    self._enable = function(window) {
        let isSwitchingWindow = self.isEnabled();

        self._disable();

        if (! window) return;

        _window = window;

        _windowSignals.tryConnect(_window, "unmanaged", self._onWindowUnmanaged);
        // Version 3.10 does not support size-changed
        _windowSignals.tryConnect(_window, "size-changed", self._setThumbnail);
        //_windowSignals.tryConnect(_window, "notify::minimized", log.bind(null, "minimized"));
        _windowSignals.tryConnect(_window, "notify::maximized-vertically", self._setThumbnail);
        _windowSignals.tryConnect(_window, "notify::maximized-horizontally", self._setThumbnail);

        // Hide (but don't destroy) it when user is not on a normal desktop area
        _environmentSignals.tryConnect(Main.overview, "showing", self._onOverviewShowing);
        _environmentSignals.tryConnect(Main.overview, "hiding", self._onOverviewHiding);
        _environmentSignals.tryConnect(global.display, "notify::focus-window", self._onNotifyFocusWindow);

        _container = new St.Button({style_class: "window-corner-preview"});

        _container.connect("enter-event", self._onEnter);
        _container.connect("leave-event",  self._onLeave);
        // Don't use button-press-event, as set_position conflicts and Gtk would react for enter and leave event of ANY item on the chrome area
        _container.connect("button-release-event",  self._onClick);
        _container.connect("scroll-event",  self._onScroll);

        _container.visible = false;
        Main.layoutManager.addChrome(_container);
        self._setThumbnail();

        // isSwitchingWindow = false means user only changed window, but preview was on, so does not animate
        self._adjustVisibility({noAnimate: isSwitchingWindow});
    };

    // Destroy window preview
    self._disable = function() {
        if (_window) _window = null;

        _windowSignals.disconnectAll();
        _environmentSignals.disconnectAll();

        if (!_container) return;

        Main.layoutManager.removeChrome(_container);
        _container.destroy();
        _container = null;
    };

    // Align the preview along the chrome area
    self._setPosition = function() {
        let _posX, _posY;

        let rectMonitor = Main.layoutManager.getWorkAreaForMonitor(DisplayWrapper.getScreen().get_current_monitor());

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
    self._setThumbnail = function() {
        let mutw = _window.get_compositor_private();

        if (! mutw) return;

        let windowTexture = mutw.get_texture();
        let [windowWidth, windowHeight] =  windowTexture.get_size();

        /* To crop the window texture, for now I've found that:
           1. Using a clip rect on Clutter.clone will hide the outside portion but also will KEEP the space along it
           2. The Clutter.clone is stretched to fill all of its room when it's painted, so the transparent area outside
                cannot be easily left out by only adjusting the actor size (empty space only gets reproportioned).

           My current workaround:
           - Define a margin rect by using some proportional [0.0 - 1.0] trimming values for left, right, ... Zero: no trimming 1: all trimmed out
           - Set width and height of the Clutter.clone based on the crop rect and apply a translation to anchor it the top left margin
                (set_clip_to_allocation must be set true on the container to get rid of the translated texture overflow)
           - Ratio of the cropped texture is different from the original one, so this must be compensated with Clutter.clone scale_x/y parameters

           Known issues:
           - Strongly cropped textual windows like terminals get a little bit blurred. However, I was told this feature
                 was useful for framed videos to peel off, particularly. So shouldn't affect that much.

           Hopefully, some kind guy will soon explain to me how to clone just a portion of the source :D
        */

        // Get absolute margin values for cropping
        let margins = {
            left: windowWidth * self.leftCropRatio,
            right: windowWidth * self.rightCropRatio,
            top: windowHeight * self.topCropRatio,
            bottom: windowHeight * self.bottomCropRatio,
        };

        // Calculate the size of the cropped rect (based on the 100% window size)
        let croppedWidth = windowWidth - (margins.left + margins.right);
        let croppedHeight = windowHeight - (margins.top + margins.bottom);

        // To mantain a similar thumbnail size whenever the user selects a different window to preview,
        // instead of zooming out based on the window size itself, it takes the window screen as a standard unit (= 100%)
        let rectMonitor = Main.layoutManager.getWorkAreaForMonitor(DisplayWrapper.getScreen().get_current_monitor());
        let targetRatio = rectMonitor.width * self.zoom / windowWidth;

        // No magnification allowed (KNOWN ISSUE: there's no height control if used, it still needs optimizing)
        if (! SETTING_MAGNIFICATION_ALLOWED && targetRatio > 1.0) {
            targetRatio = 1.0;
            _zoom = windowWidth / rectMonitor.width; // do NOT set self.zoom or it will be looping!
        }

        let thumbnail = new Clutter.Clone({ // list parameters https://www.roojs.org/seed/gir-1.2-gtk-3.0/seed/Clutter.Clone.html
            source: windowTexture,
            reactive: false,

            magnification_filter: Clutter.ScalingFilter.NEAREST, //NEAREST, //TRILINEAR,

            translation_x: -margins.left * targetRatio,
            translation_y: -margins.top * targetRatio,

            // Compensating scales due the different ratio of the cropped window texture
            scale_x: windowWidth / croppedWidth,
            scale_y: windowHeight / croppedHeight,

            width: croppedWidth * targetRatio,
            height: croppedHeight * targetRatio,

            margin_left: 0,
            margin_right: 0,
            margin_bottom: 0,
            margin_top: 0

        });

        _container.foreach(function (actor) {
            actor.destroy();
        });

       //
_container.set_clip_to_allocation(true);

        _container.add_actor(thumbnail);

        self._setPosition();
    };

    // xCropRatio properties normalize their opposite counterpart, so that margins won't ever overlap
    self.__defineSetter__("leftCropRatio", function(value) {

        // [0, MAX] range
        _leftCropRatio = Math.min(MAX_CROP_RATIO, Math.max(0.0, value));

        // Decrease the opposite margin if necessary
        _rightCropRatio = Math.min(_rightCropRatio, MAX_CROP_RATIO - _leftCropRatio);

        self._onParamsChange();
    });

    self.__defineSetter__("rightCropRatio", function(value) {
        _rightCropRatio = Math.min(MAX_CROP_RATIO, Math.max(0.0, value));
        _leftCropRatio = Math.min(_leftCropRatio, MAX_CROP_RATIO - _rightCropRatio);
        self._onParamsChange();
    });

    self.__defineSetter__("topCropRatio", function(value) {
        _topCropRatio = Math.min(MAX_CROP_RATIO, Math.max(0.0, value));
        _bottomCropRatio = Math.min(_bottomCropRatio, MAX_CROP_RATIO - _topCropRatio);
        self._onParamsChange();
    });

    self.__defineSetter__("bottomCropRatio", function(value) {
        _bottomCropRatio = Math.min(MAX_CROP_RATIO, Math.max(0.0, value));
        _topCropRatio = Math.min(_topCropRatio, MAX_CROP_RATIO - _bottomCropRatio);
        self._onParamsChange();
    });

    self.__defineGetter__("leftCropRatio", function() {
        return _leftCropRatio;
    });

    self.__defineGetter__("rightCropRatio", function() {
        return _rightCropRatio;
    });

    self.__defineGetter__("topCropRatio", function() {
        return _topCropRatio;
    });

    self.__defineGetter__("bottomCropRatio", function() {
        return _bottomCropRatio;
    });

    self.__defineSetter__("zoom", function(value) {
        _zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
        self._onParamsChange();
    });

    self.__defineGetter__("zoom", function() {
        return _zoom;
    });

    self.__defineSetter__("focusHidden", function(value) {
        _focusHidden = !!value;
        self._adjustVisibility();
    });

    self.__defineGetter__("focusHidden", function() {
        return _focusHidden;
    });

    self.__defineSetter__("corner", function(value) {
        _corner = value % 4;
        if (_corner < 0) _corner += 4;
        self._setPosition();
    });

    self.__defineGetter__("corner", function() {
        return _corner;
    });

    self.isEnabled = function () {
        return !! _container;
    };

    self.show = function (window) {
        _naturalVisibility = true;
        self._enable(window);
    };

    self.passAway = function () {
        _naturalVisibility = false;
        self._adjustVisibility({onComplete: self._disable});
    };
}




const CWindowCornerPreviewMenu = new Lang.Class({
    Name: "WindowCornerPreview.indicator",
    Extends: PanelMenu.Button,

    _init: function () {
        this.parent(null, "WindowCornerPreview.indicator");
    },

    // Handler to turn preview on / off
    _onMenuIsEnabled: function (item) {
        if (! item.state) {
            this.preview.passAway();
        }
        else if (this.lastPreviewedWindow) {
            this.preview.show(this.lastPreviewedWindow);
        }
    },

    _updateSliders: function () {
        this.menuZoom.value = this.preview.zoom;
        this.menuZoomLabel.label.set_text("Monitor Zoom:  " + Math.floor(this.preview.zoom * 100).toString() + "%");

        this.menuLeftCrop.value = this.preview.leftCropRatio;
        this.menuRightCrop.value = this.preview.rightCropRatio;
        this.menuTopCrop.value = this.preview.topCropRatio;
        this.menuBottomCrop.value = this.preview.bottomCropRatio;
    },

    _onZoomChanged: function (source, value) {
        this.preview.zoom = value;
        this._updateSliders();
    },

    _onLeftCropChanged: function (source, value) {
        this.preview.leftCropRatio = value;
        this._updateSliders();
    },

    _onRightCropChanged: function (source, value) {
        this.preview.rightCropRatio = value;
        this._updateSliders();
    },

    _onTopCropChanged: function (source, value) {
        this.preview.topCropRatio = value;
        this._updateSliders();
    },

    _onBottomCropChanged: function (source, value) {
        this.preview.bottomCropRatio = value;
        this._updateSliders();
    },

    _onSettings: function () {
        Main.Util.trySpawnCommandLine("gnome-shell-extension-prefs window-corner-preview@fabiomereu.it");
    },

    // Update windows list and other menus before menu pops up
    _onUserTriggered: function() {
        this.menuIsEnabled.setToggleState(this.preview.isEnabled());
        this._updateSliders();
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
                    this.preview.show(window);
                    this.lastPreviewedWindow = window;
                }));

                this.menuWindows.menu.addMenuItem(winMenuItem);
            }, this);
        }
    },

    _onWindowUnmanaged: function () {
        this.lastPreviewedWindow = null;
    },

    _onSettingsChanged: function (settings, key) {

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

    enable: function () {
        this.preview = new CWindowPreview();
        // If a window on preview is closed, don't let user reshow it
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

        /* TODO Under development  */
        // 5. Settings
        this.menuSettings = new PopupMenu.PopupMenuItem("Settings");
        this.menuSettings.connect("activate", Lang.bind(this, this._onSettings));
        this.menu.addMenuItem(this.menuSettings);

        this.actor.connect("enter-event", Lang.bind(this, this._onUserTriggered));

        this.settings = Convenience.getSettings();

        this.settings.connect("changed", Lang.bind(this, this._onSettingsChanged));
        this._onSettingsChanged();

    },

    disable: function () {
        this.preview.passAway();
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
