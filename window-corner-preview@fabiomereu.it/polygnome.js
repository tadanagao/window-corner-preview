// Contributor:
// Scott Ames https://github.com/scottames

// Global modules
const Meta = imports.gi.Meta;

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
