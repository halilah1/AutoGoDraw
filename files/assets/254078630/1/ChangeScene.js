var ChangeScene = pc.createScript('changeScene');

ChangeScene.attributes.add('sceneName', {
    type: 'string',
    default: '',
    title: 'Scene Name'
});

ChangeScene.prototype.initialize = function () {
    if (!this.entity.button) {
        console.warn('ChangeScene: entity has no Button component:', this.entity.name);
        return;
    }

    this._onClick = this._onClick.bind(this);
    this.entity.button.on('click', this._onClick);
    this.on('destroy', () => this.entity.button.off('click', this._onClick));
};

ChangeScene.prototype._onClick = function () {
    if (!this.sceneName) {
        console.warn('ChangeScene: sceneName is empty');
        return;
    }
    this.app.scenes.changeScene(this.sceneName);
};
