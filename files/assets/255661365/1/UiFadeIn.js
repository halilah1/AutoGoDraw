// UiFadeIn.js
var UiFadeIn = pc.createScript('UiFadeIn');

UiFadeIn.attributes.add('delay', { type: 'number', default: 1.0, title: 'Delay (s)' });
UiFadeIn.attributes.add('duration', { type: 'number', default: 1.0, title: 'Fade Duration (s)' });
UiFadeIn.attributes.add('startAlpha', { type: 'number', default: 0.0, title: 'Start Alpha 0-1' });
UiFadeIn.attributes.add('endAlpha', { type: 'number', default: 1.0, title: 'End Alpha 0-1' });

UiFadeIn.prototype.initialize = function () {
    if (!this.entity.sprite) {
        console.warn('[UiFadeIn] No Sprite component on this entity');
        this.enabled = false;
        return;
    }

    // Start invisible
    this.entity.sprite.opacity = pc.math.clamp(this.startAlpha, 0, 1);

    this._t = 0;
    this._playing = true;
};

UiFadeIn.prototype._easeOutSine = function (t) {
    return Math.sin((t * Math.PI) * 0.5);
};

UiFadeIn.prototype.update = function (dt) {
    if (!this._playing) return;

    this._t += dt;
    if (this._t < this.delay) return;

    var t = (this._t - this.delay) / Math.max(this.duration, 0.0001);
    if (t >= 1) {
        t = 1;
        this._playing = false;
    }

    var eased = this._easeOutSine(pc.math.clamp(t, 0, 1));
    var a = pc.math.lerp(this.startAlpha, this.endAlpha, eased);

    // Apply directly to Sprite component
    this.entity.sprite.opacity = a;
};
