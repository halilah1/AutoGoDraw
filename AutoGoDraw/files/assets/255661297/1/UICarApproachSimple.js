// UiCarApproachSimple.js
var UiCarApproachSimple = pc.createScript('uiCarApproachSimple');

// Tweak these in the Inspector
UiCarApproachSimple.attributes.add('startScale', { type: 'vec2', default: [0.7, 0.7], title: 'Start Scale' });
UiCarApproachSimple.attributes.add('endScale',   { type: 'vec2', default: [1.2, 1.2], title: 'End Scale' });
UiCarApproachSimple.attributes.add('startPos',   { type: 'vec2', default: [0, -80],   title: 'Start Pos (px, XY)' });
UiCarApproachSimple.attributes.add('endPos',     { type: 'vec2', default: [0,   0],   title: 'End Pos (px, XY)' });
UiCarApproachSimple.attributes.add('duration',   { type: 'number', default: 1.2,      title: 'Duration (s)' });
UiCarApproachSimple.attributes.add('delay',      { type: 'number', default: 0.2,      title: 'Delay (s)' });

// Easing: smooth finish
UiCarApproachSimple.prototype._easeOutSine = function (t) {
    return Math.sin((t * Math.PI) * 0.5);
};

UiCarApproachSimple.prototype.initialize = function () {
    // Make sure your Image Element uses center anchor and center pivot
    this.entity.setLocalScale(this.startScale.x, this.startScale.y, 1);
    this.entity.setLocalPosition(this.startPos.x, this.startPos.y, 0);

    this._t = 0;
    this._playing = true; // run once on load
};

UiCarApproachSimple.prototype.update = function (dt) {
    if (!this._playing) return;

    this._t += dt;
    if (this._t < this.delay) return;

    var t = (this._t - this.delay) / Math.max(this.duration, 0.0001);
    if (t >= 1) {
        t = 1;
        this._playing = false; // stop after one run
    }

    var e = this._easeOutSine(pc.math.clamp(t, 0, 1));

    // Scale up - illusion of moving forward
    var sx = pc.math.lerp(this.startScale.x, this.endScale.x, e);
    var sy = pc.math.lerp(this.startScale.y, this.endScale.y, e);
    this.entity.setLocalScale(sx, sy, 1);

    // Optional small position drift to feel like approach
    var px = pc.math.lerp(this.startPos.x, this.endPos.x, e);
    var py = pc.math.lerp(this.startPos.y, this.endPos.y, e);
    this.entity.setLocalPosition(px, py, 0);
};
