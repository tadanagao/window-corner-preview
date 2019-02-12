"use strict";

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
