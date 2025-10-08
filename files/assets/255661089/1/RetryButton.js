// RetryButton.js
var RetryButton = pc.createScript('retryButton');

RetryButton.attributes.add('fallbackLevel', {
    type: 'string',
    default: 'Level1',
    title: 'Fallback Level Name'
});

RetryButton.prototype.initialize = function () {
    if (!this.entity.button) {
        console.error('RetryButton needs a Button component.');
        return;
    }
    this._loading = false;
    this.entity.button.on('click', this._onClick, this);
};

RetryButton.prototype._onClick = function () {
    if (this._loading) return;
    this._loading = true;

    var levelToLoad = this.app._lastLevelScene || this.fallbackLevel;
    try {
        var stored = localStorage.getItem('lastLevelScene');
        if (stored) levelToLoad = stored;
    } catch (e) {}

    // Change scene by name
    if (this.app.scenes.changeScene) {
        this.app.scenes.changeScene(levelToLoad);
    } else {
        var item = this.app.scenes.find(levelToLoad);
        if (item && item.url) {
            this.app.scenes.loadSceneHierarchy(item.url, function (err) {
                if (err) console.error('Failed to load scene:', err);
            });
        } else {
            console.error('Scene not found by name:', levelToLoad);
        }
    }
};
