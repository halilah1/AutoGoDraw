// LevelMarker.js
var LevelMarker = pc.createScript('levelMarker');

LevelMarker.attributes.add('levelSceneName', {
    type: 'string',
    title: 'This Level Scene Name'
});

LevelMarker.prototype.initialize = function () {
    // keep in-memory on the app
    this.app._lastLevelScene = this.levelSceneName || this.app._lastLevelScene;

    // fallback that survives scene changes and reloads
    try {
        if (this.levelSceneName) localStorage.setItem('lastLevelScene', this.levelSceneName);
    } catch (e) {}
};
