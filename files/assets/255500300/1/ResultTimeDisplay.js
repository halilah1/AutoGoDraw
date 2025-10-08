// resultTimeDisplay.js
var ResultTimeDisplay = pc.createScript('resultTimeDisplay');

ResultTimeDisplay.attributes.add('textEntity', {
    type: 'entity',
    title: 'UI Text Entity (Element)'
});
ResultTimeDisplay.attributes.add('successStorageKey', {
    type: 'string',
    default: 'lastSuccessTimeSec',
    title: 'Storage Key (Success Only)'
});
ResultTimeDisplay.attributes.add('prefix', {
    type: 'string',
    default: 'Time ',
    title: 'Label Prefix'
});
ResultTimeDisplay.attributes.add('clearAfterRead', {
    type: 'boolean',
    default: true,
    title: 'Clear Storage After Read'
});
ResultTimeDisplay.attributes.add('holdForMs', {
    type: 'number',
    default: 1500,
    title: 'Keep overriding text for (ms)'
});

ResultTimeDisplay.prototype.postInitialize = function () {
    // Default to this.entity if textEntity not assigned
    this.label = (this.textEntity && this.textEntity.element) ? this.textEntity : this.entity;

    if (!this.label || !this.label.element) {
        console.error('ResultTimeDisplay: assign a Text Element to "textEntity" or attach this script to one.');
        this.enabled = false;
        return;
    }

    // Read once
    var raw = null;
    try { raw = localStorage.getItem(this.successStorageKey); } catch (e) {}

    if (raw == null) {
        // Nothing saved. Do not touch existing UI.
        this._lockText = null;
        this._holdLeft = 0;
        return;
    }

    var sec = Math.max(0, Math.floor(parseFloat(raw)));
    this._lockText = this.prefix + formatMMSS(sec);
    this._holdLeft = Math.max(0, this.holdForMs);

    // Apply immediately
    this.label.element.text = this._lockText;

    // Also apply on the very next frame to beat late writers
    this.app.once('postupdate', function () {
        if (this._lockText) this.label.element.text = this._lockText;
    }, this);
};

ResultTimeDisplay.prototype.update = function (dt) {
    if (!this._lockText || this._holdLeft <= 0) return;

    // Keep asserting the same text during the hold window
    this.label.element.text = this._lockText;
    this._holdLeft -= dt * 1000;

    // When the hold ends, optionally clear storage
    if (this._holdLeft <= 0 && this.clearAfterRead) {
        try { localStorage.removeItem(this.successStorageKey); } catch (e) {}
    }
};

// Helper
function formatMMSS(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    var mm = (m < 10 ? '0' : '') + m;
    var ss = (s < 10 ? '0' : '') + s;
    return mm + ':' + ss;
}
