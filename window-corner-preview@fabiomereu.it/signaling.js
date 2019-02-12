"use strict";

// Global modules
const Lang = imports.lang;

// Helper to disconnect more signals at once
const SignalConnector = new Lang.Class({

    Name: "WindowCornerPreview.SignalConnector",

    _init: function() {
        this._connections = [];
    },

    tryConnect: function(actor, signal, callback) {
        try {
            let handle = actor.connect(signal, callback);
            this._connections.push({
                actor: actor,
                handle: handle
            });
        }

        catch (e) {
            logError(e, "SignalConnector.tryConnect failed");
        }
    },

    disconnectAll: function() {
        for (let i = 0; i < this._connections.length; i++) {
            try {
                let connection = this._connections[i];
                connection.actor.disconnect(connection.handle);
                this._connections[i] = null;
            }

            catch (e) {
                logError(e, "SignalConnector.disconnectAll failed");
            }
        }
        this._connections = [];
    }
});
