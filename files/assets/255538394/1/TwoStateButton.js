var TwoImageButton = pc.createScript('twoImageButton');

// Attributes to assign your images
TwoImageButton.attributes.add('idleImage', { type: 'asset', assetType: 'texture' });
TwoImageButton.attributes.add('pressedImage', { type: 'asset', assetType: 'texture' });

// scale feedback
TwoImageButton.attributes.add('pressScale', { type: 'number', default: 0.94 });
TwoImageButton.attributes.add('animTime', { type: 'number', default: 0.08 });

TwoImageButton.prototype.initialize = function () {
    this.entity.element.useInput = true;
    this._origScale = this.entity.getLocalScale().clone();

    // Events for mouse + touch
    this.entity.element.on('mousedown', this._onDown, this);
    this.entity.element.on('mouseup', this._onUp, this);
    this.entity.element.on('mouseleave', this._onUp, this);
    this.entity.element.on('touchstart', this._onDown, this);
    this.entity.element.on('touchend', this._onUp, this);
};

TwoImageButton.prototype._onDown = function () {
    if (this.pressedImage) {
        this.entity.element.textureAsset = this.pressedImage;
    }
    this._scaleTo(this.pressScale);
};

TwoImageButton.prototype._onUp = function () {
    if (this.idleImage) {
        this.entity.element.textureAsset = this.idleImage;
    }
    this._scaleTo(1.0);
};

TwoImageButton.prototype._scaleTo = function (target) {
    var start = this.entity.getLocalScale().clone();
    var end = this._origScale.clone().scale(target);
    var t = 0;
    var duration = this.animTime;

    if (this._handler) this.app.off('update', this._handler, this);

    this._handler = function (dt) {
        t += dt;
        var k = Math.min(t / duration, 1);
        var eased = 1 - Math.pow(1 - k, 3);
        this.entity.setLocalScale(
            pc.math.lerp(start.x, end.x, eased),
            pc.math.lerp(start.y, end.y, eased),
            start.z
        );
        if (k >= 1) this.app.off('update', this._handler, this);
    };
    this.app.on('update', this._handler, this);
};
