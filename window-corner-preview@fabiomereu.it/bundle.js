"use strict";

// Global modules
const Lang = imports.lang;

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

// Truncate too long window titles on the menu
function spliceTitle(text, max) {
    text = text || "";
    max = max || 25;
    if (text.length > max) {
        return text.substr(0, max - 2) + "...";
    }
    else {
        return text;
    }
};

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
