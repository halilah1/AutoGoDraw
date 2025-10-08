var GoalSuccess = pc.createScript('goalSuccess');

/** Inspector */
GoalSuccess.attributes.add('totalPlayers', {
    type: 'number',
    default: 2,
    title: 'Total Players (0 = detect from ready players)'
});
GoalSuccess.attributes.add('successSceneName', {
    type: 'string',
    default: '',
    title: 'Success Scene Name (optional)'
});
GoalSuccess.attributes.add('autoAdvanceDelayMs', {
    type: 'number',
    default: 1200,
    title: 'Delay before changing scene (ms)'
});
GoalSuccess.attributes.add('extraGoalTolerance', {
    type: 'number',
    default: 0.12, // was 0.08
    title: 'Extra Goal Tolerance (m)'
});
GoalSuccess.attributes.add('debug', {
    type: 'boolean',
    default: false,
    title: 'Console Debug'
});

// Add these fields in initialize()
GoalSuccess.prototype.initialize = function () {
    // State
    this.participants = new Set();
    this.readySet = new Set();
    this.arrived = new Set();

    this.expected = Math.max(0, this.totalPlayers || 0);
    this.armed = false;
    this.done = false;

    // New: debounce timer to "lock" expected
    this._armTimer = null;
    this._armDelayMs = 250; // small window to allow both ready events to come in

    // Listeners
    this._onReady = (ent) => this._onPathReady(ent);
    this._onEnd = (ent) => this._onPathEnd(ent);
    this._onReset = () => this._resetRound();

    this.app.on('path:ready', this._onReady, this);
    this.app.on('player:pathEnd', this._onEnd, this);
    this.app.on('game:reset', this._onReset, this);

    // Optional initial guess left as-is...
    setTimeout(() => {
        if (!this.totalPlayers) {
            var players = this.app.root.findByTag('player');
            if (!players.length) players = this.app.root.findByTag('spawned');
            if (players.length > this.expected) this.expected = players.length;
            if (this.debug) console.log('[GoalSuccess] initial expected (guess):', this.expected);
        }
    }, 0);
};

GoalSuccess.prototype.destroy = function () {
    if (this._onReady) this.app.off('path:ready', this._onReady, this);
    if (this._onEnd) this.app.off('player:pathEnd', this._onEnd, this);
    if (this._onReset) this.app.off('game:reset', this._onReset, this);
};

// Reset also clears timer
GoalSuccess.prototype._resetRound = function () {
    this.participants.clear();
    this.readySet.clear();
    this.arrived.clear();
    this.armed = false;
    this.done = false;
    if (this._armTimer) { clearTimeout(this._armTimer); this._armTimer = null; }
    if (!this.totalPlayers) this.expected = 0;
    if (this.debug) console.log('[GoalSuccess] reset');
};

// Ready handler now debounces arming and freezes expected once armed
GoalSuccess.prototype._onPathReady = function (ent) {
    if (!ent) return;

    this.participants.add(ent);
    this.readySet.add(ent);

    // Only grow expected before arming and only when totalPlayers == 0
    if (!this.armed && !this.totalPlayers && this.expected < this.readySet.size) {
        this.expected = this.readySet.size;
    }

    if (this.debug) {
        console.log(`[GoalSuccess] path:ready ${ent.name} | ready=${this.readySet.size} expected=${this.expected}`);
    }

    // Debounce arming so both players can announce
    if (!this.armed) {
        if (this._armTimer) clearTimeout(this._armTimer);
        this._armTimer = setTimeout(() => {
            // Lock expected to the current ready count if not fixed
            if (!this.totalPlayers) this.expected = this.readySet.size;

            if (this.expected > 0 && this.readySet.size === this.expected) {
                this.armed = true; // freeze expected from now on
                if (this.debug) console.log('[GoalSuccess] ARMED (all players ready and expected locked to', this.expected, ')');
            } else if (this.debug) {
                console.log('[GoalSuccess] not arming yet: ready', this.readySet.size, 'expected', this.expected);
            }
            this._armTimer = null;
        }, this._armDelayMs);
    }
};

// Do not count arrivals until everyone is ready and expected is locked
GoalSuccess.prototype._onPathEnd = function (ent) {
    if (!this.armed || this.done || !ent) return;
    // Extra guard: require that the number of ready players equals expected
    if (this.readySet.size !== this.expected) return;
    this._maybeMarkArrived(ent);
};


// Arrival logic unchanged except final check is strict equality for clarity
GoalSuccess.prototype._maybeMarkArrived = function (playerEnt) {
    if (this.done || this.arrived.has(playerEnt)) return;

    var pd = playerEnt.script && playerEnt.script.pathDrawer;
    if (!pd || !pd.goal) return;

    var p = playerEnt.getPosition().clone();
    var g = pd.getGoalPosFromEntity(pd.goal);
    if (!g) return;

    var plane = pd.drawingPlane || 'XZ';
    var dist = (plane === 'XZ')
        ? Math.hypot(p.x - g.x, p.z - g.z)
        : Math.hypot(p.x - g.x, p.y - g.y);

    var tol = (pd.goalRadius || 0.35) + (this.extraGoalTolerance || 0);

    if (dist <= tol) {
        this.arrived.add(playerEnt);
        if (this.debug) {
            console.log(
                `[GoalSuccess] ARRIVED ${playerEnt.name} | ${this.arrived.size}/${this.expected} (dist=${dist.toFixed(3)}, tol=${tol.toFixed(3)})`
            );
        }
        if (this.arrived.size === this.expected) this._onAllArrived();
    } else if (this.debug) {
        console.log(
            `[GoalSuccess] close but not in tol for ${playerEnt.name} (dist=${dist.toFixed(3)}, tol=${tol.toFixed(3)})`
        );
    }
};
GoalSuccess.prototype._onAllArrived = function () {
    if (this.done) return;
    // Final sanity guard
    if (this.readySet.size !== this.expected) return;

    this.done = true;
    if (this.debug) console.log('[GoalSuccess] ALL ARRIVED -> game:success');
    this.app.fire('game:success');
};
