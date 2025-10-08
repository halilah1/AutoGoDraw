var PairSpawnManager = pc.createScript('pairSpawnManager');

/** ===== Inspector ===== */
PairSpawnManager.attributes.add('camera', {
    type: 'entity',
    title: 'Camera (for PathDrawer)'
});

PairSpawnManager.attributes.add('playerRedTemplate', {
    type: 'entity',
    title: 'Player Red Template'
});
PairSpawnManager.attributes.add('playerBlueTemplate', {
    type: 'entity',
    title: 'Player Blue Template'
});
PairSpawnManager.attributes.add('goalRedTemplate', {
    type: 'entity',
    title: 'Goal Red Template'
});
PairSpawnManager.attributes.add('goalBlueTemplate', {
    type: 'entity',
    title: 'Goal Blue Template'
});

PairSpawnManager.attributes.add('pairCount', {
    type: 'number',
    default: 2,
    title: 'How many pairs to spawn'
});

PairSpawnManager.attributes.add('clearOldOnRun', {
    type: 'boolean',
    default: true,
    title: 'Clear previous spawns on initialize()'
});

PairSpawnManager.attributes.add('plane', {
    type: 'string',
    enum: [{ 'XZ': 'XZ' }, { 'XY': 'XY' }],
    default: 'XZ',
    title: 'Gameplay Plane'
});

PairSpawnManager.attributes.add('playerMarkers', {
    type: 'entity',
    array: true,
    title: 'Player Spawn Markers (world positions)'
});

PairSpawnManager.attributes.add('goalMarkers', {
    type: 'entity',
    array: true,
    title: 'Goal Spawn Markers (world positions)'
});

PairSpawnManager.prototype.initialize = function () {
    // Hide templates in the scene
    if (this.playerRedTemplate) this.playerRedTemplate.enabled = false;
    if (this.playerBlueTemplate) this.playerBlueTemplate.enabled = false;
    if (this.goalRedTemplate) this.goalRedTemplate.enabled = false;
    if (this.goalBlueTemplate) this.goalBlueTemplate.enabled = false;

    if (this.clearOldOnRun) this._clearSpawned();
    this.spawnedPlayers = [];
    this.spawnedGoals = [];

    if (!(this.playerRedTemplate && this.playerBlueTemplate && this.goalRedTemplate && this.goalBlueTemplate)) {
        console.warn('[PairSpawnManager] Missing one or more of: playerRedTemplate, playerBlueTemplate, goalRedTemplate, goalBlueTemplate.');
        return;
    }

    // Use manual spawn markers if provided
    if (this.playerMarkers && this.goalMarkers &&
        this.playerMarkers.length && this.goalMarkers.length) {

        var usablePairs = Math.min(this.playerMarkers.length, this.goalMarkers.length, this.pairCount);

        for (var i = 0; i < usablePairs; i++) {
            var pPos = this.playerMarkers[i].getPosition().clone();
            var gPos = this.goalMarkers[i].getPosition().clone();

            // Alternate red/blue players and goals
            var isBlue = (i % 2 === 1);
            var playerTemplate = isBlue ? this.playerBlueTemplate : this.playerRedTemplate;
            var goalTemplate = isBlue ? this.goalBlueTemplate : this.goalRedTemplate;

            var player = this._spawnClone(playerTemplate, pPos);
            var goal = this._spawnClone(goalTemplate, gPos);

            this.spawnedPlayers.push(player);
            this.spawnedGoals.push(goal);

            // AFTER (use actual final positions — correct after reset)
            player.startPos = player.getPosition().clone();
            goal.startPos = goal.getPosition().clone();
            player.startRot = player.getRotation().clone();
            goal.startRot = goal.getRotation().clone();


            if (player.tags && !player.tags.has('player')) player.tags.add('player');
            player.tags.add('spawned');
            if (goal.tags && !goal.tags.has('goal')) goal.tags.add('goal');
            if (goal.tags && !goal.tags.has('spawned')) goal.tags.add('spawned');
            // Link PathDrawer to goal
            var pd = player.script && player.script.pathDrawer;
            if (pd) {
                pd.camera = this.camera || pd.camera;
                pd.drawingPlane = this.plane;
                pd.planeZ = this.plane === 'XY';

                pd.goal = goal;
                pd.requireGoal = true;
                pd.autoExtendToGoal = true;
                pd.follower = player;

                pd.lineColor = (isBlue)
                    ? new pc.Color(0.0, 0.4, 1.0)   // blue-ish
                    : new pc.Color(1.0, 0.0, 0.0);  // red

                if (pd.clearLine) pd.clearLine();
            }

            // Reset follower state
            var pf = player.script && player.script.pathFollower;
            if (pf) {
                pf.following = false;
                if (typeof pf.setPath === 'function') pf.setPath([]);
            }
        }

        console.log('[PairSpawnManager] Spawned red/blue pairs:', usablePairs);

        // Tell GoalSuccess the true number of players, once, after spawn is done
        this.app.fire('players:spawnedCount', this.spawnedPlayers.length);


    } else {
        console.warn("[PairSpawnManager] No markers assigned!");
    }

    // After spawning, set up sync start
    this._allPlayers = this.spawnedPlayers.slice();
    this._readyPlayers = new Set();

    this._onReady = (playerEnt) => {
        if (this._allPlayers.indexOf(playerEnt) !== -1) {
            this._readyPlayers.add(playerEnt);
            if (this._readyPlayers.size === this._allPlayers.length) {
                this._startAllFollowers();
            }
        }
    };

    this._onCancel = (playerEnt) => {
        if (this._readyPlayers.has(playerEnt)) this._readyPlayers.delete(playerEnt);
    };

    this._onDestroyed = (playerEnt) => {
        if (this._readyPlayers) this._readyPlayers.delete(playerEnt);
        if (this._allPlayers) {
            var k = this._allPlayers.indexOf(playerEnt);
            if (k !== -1) this._allPlayers.splice(k, 1);
        }
        var idx = this.spawnedPlayers.indexOf(playerEnt);
        if (idx !== -1) this.spawnedPlayers.splice(idx, 1);
    };

    this.app.on('path:ready', this._onReady, this);
    this.app.on('path:cancel', this._onCancel, this);
    this.app.on('player:destroyed', this._onDestroyed, this);
};

/** ===== Helpers ===== */

// Destroy previously spawned entities
PairSpawnManager.prototype._clearSpawned = function () {
    // Destroy any entities from a previous run tagged 'spawned'
    var olds = this.app.root.findByTag('spawned');
    for (var i = 0; i < olds.length; i++) {
        if (olds[i] && olds[i].destroy) olds[i].destroy();
    }

    // Also destroy anything we were tracking in arrays (belt & suspenders)
    var lists = [this.spawnedPlayers, this.spawnedGoals];
    for (var a = 0; a < lists.length; a++) {
        var list = lists[a];
        if (!list) continue;
        for (var j = 0; j < list.length; j++) {
            if (list[j] && list[j].destroy) list[j].destroy();
        }
    }
};


// Clone a template and add it under root (keeping local world)
PairSpawnManager.prototype._spawnClone = function (template, worldPos) {
    var clone = template.clone();
    clone.enabled = true;
    this.app.root.addChild(clone);
    clone.setPosition(worldPos);
    return clone;
};

PairSpawnManager.prototype._startAllFollowers = function () {
    for (var i = 0; i < this._allPlayers.length; i++) {
        var p = this._allPlayers[i];
        var pf = p.script && p.script.pathFollower;
        if (pf) {
            pf._wasFollowing = false;
            pf.following = true;
        }
    }
};

PairSpawnManager.prototype.destroy = function () {
    if (this._onReady) this.app.off('path:ready', this._onReady, this);
    if (this._onCancel) this.app.off('path:cancel', this._onCancel, this);
    if (this._onDestroyed) this.app.off('player:destroyed', this._onDestroyed, this);
};
