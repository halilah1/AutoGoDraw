// levelTimer.js
var LevelTimer = pc.createScript('levelTimer');

LevelTimer.attributes.add('autoStart', { type: 'boolean', default: true });
LevelTimer.attributes.add('textEntity', { type: 'entity', title: 'UI Text Entity (Element)' });
LevelTimer.attributes.add('successScene', { type: 'string', default: 'Success' });
LevelTimer.attributes.add('failureScene', { type: 'string', default: 'Failure' });
LevelTimer.attributes.add('successStorageKey', {
  type: 'string', default: 'lastSuccessTimeSec', title: 'Storage Key (success only)'
});

LevelTimer.prototype.initialize = function () {
  this.elapsed = 0;
  this.running = !!this.autoStart;
  this._ended = false;
  this._updateText();
  this._onSuccessBound = this._onSuccess.bind(this);
  this._onFailureBound = this._onFailure.bind(this);
  this.app.on('game:success', this._onSuccessBound, this);
  this.app.on('game:failure', this._onFailureBound, this);
};

LevelTimer.prototype.update = function (dt) {
  if (!this.running || this._ended) return;
  this.elapsed += dt;
  this._updateText();
};

LevelTimer.prototype._displaySeconds = function () {
  // single source of truth for rounding
  return Math.floor(this.elapsed + 0.5); // round to nearest second
};

LevelTimer.prototype._setTextFromSeconds = function (sec) {
  if (!this.textEntity || !this.textEntity.element) return;
  var m = Math.floor(sec / 60), s = sec % 60;
  this.textEntity.element.text =
    (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
};

LevelTimer.prototype._updateText = function () {
  this._setTextFromSeconds(this._displaySeconds());
};

LevelTimer.prototype._cleanup = function () {
  this.app.off('game:success', this._onSuccessBound, this);
  this.app.off('game:failure', this._onFailureBound, this);
};

LevelTimer.prototype._onSuccess = function () {
  if (this._ended) return;
  this._ended = true;
  this.running = false;

  // freeze HUD to the same value we will save
  var sec = this._displaySeconds();
  this._setTextFromSeconds(sec);

  try { localStorage.setItem(this.successStorageKey, String(sec)); } catch (e) {}
  this._cleanup();
  this._switchScene(this.successScene);
};

LevelTimer.prototype._onFailure = function () {
  if (this._ended) return;
  this._ended = true;
  this.running = false;
  try { localStorage.removeItem(this.successStorageKey); } catch (e) {}
  this._cleanup();
  this._switchScene(this.failureScene);
};

LevelTimer.prototype._switchScene = function (name) {
  if (this.app.scenes.changeScene) { this.app.scenes.changeScene(name); return; }
  var item = this.app.scenes.find(name);
  if (item && item.url) this.app.scenes.loadSceneHierarchy(item.url, function (err) {
    if (err) console.error('Failed to load scene:', err);
  });
};
