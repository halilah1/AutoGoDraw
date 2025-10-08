var CollisionHandler = pc.createScript('collisionHandler');

// Scene switch
CollisionHandler.attributes.add('failureScene', { type: 'string', default: 'Failure', title: 'Failure Scene Name' });
CollisionHandler.attributes.add('switchDelayMs', { type: 'number', default: 100, title: 'Delay before switching (ms)' });

// Knockback tuning (works with or without physics)
CollisionHandler.attributes.add('bounceDistance', { type: 'number', default: 1.0, title: 'Instant nudge distance (units)' });
CollisionHandler.attributes.add('knockSpeed', { type: 'number', default: 6.0, title: 'Knockback speed (units/sec)' });
CollisionHandler.attributes.add('knockDuration', { type: 'number', default: 0.25, title: 'Knockback duration (seconds)' });
CollisionHandler.attributes.add('usePhysicsIfAvailable', { type: 'boolean', default: true, title: 'Use physics if player has Dynamic RB' });

CollisionHandler.prototype.initialize = function () {
    if (!this.entity.collision) return;

    this._switchScheduled = false;
    this._knock = null; // { ent, dir (pc.Vec3), speed, timeLeft }

    this.entity.collision.on('collisionstart', this._onCollisionStart, this);
    this.entity.collision.on('triggerenter', this._onTriggerEnter, this);
};

CollisionHandler.prototype.update = function (dt) {
    if (!this._knock || !this._knock.ent) return;

    var k = this._knock;

    if (k.timeLeft > 0) {
        // move
        var step = k.dir.clone().scale(k.speed * dt);
        k.ent.translate(step);

        // ease out knock speed
        k.speed *= Math.max(0, 1 - 6 * dt); // a bit softer than 8*dt so it lasts longer

        // spin around Z for XY gameplay
        if (k.spinSpeedDeg) {
            var deg = k.spinSpeedDeg * dt;
            k.ent.rotateLocal(0, 0, deg);
        }

        k.timeLeft -= dt; // single decrement
    } else {
        this._knock = null; // done
    }
};


CollisionHandler.prototype._onCollisionStart = function (result) {
    if (result && result.other) this._handleHit(result.other);
};

CollisionHandler.prototype._onTriggerEnter = function (other) {
    if (other) this._handleHit(other);
};

CollisionHandler.prototype._handleHit = function (otherEnt) {
    if (!otherEnt || !otherEnt.tags || !otherEnt.tags.has('player')) return;
    if (this._switchScheduled) return;
    this._switchScheduled = true;

    var player = otherEnt;
    var hazard = this.entity;

    // 1) Stop the follower so it cannot snap back
    this._disableFollower(player);

    // 2) Compute safe direction: push player away from hazard
    var dir = player.getPosition().clone().sub(hazard.getPosition());
    if (dir.lengthSq() < 1e-6) {
        // fallback if perfectly overlapping
        dir.set(1, 0, 0);
    }
    dir.z = 0;
    dir.normalize();

    // 3) Show knockback
    this._knockPlayer(player, dir);

    // 4) signal failure game, do not switch screen
    setTimeout(() => this.app.fire('game:failure'), this.switchDelayMs);
};

CollisionHandler.prototype._disableFollower = function (ent) {
    if (ent.script && ent.script.pathFollower) {
        ent.script.pathFollower.enabled = false;
        // If your follower uses a custom flag, also set it:
        // ent.script.pathFollower.isStunned = true;
    }
};

CollisionHandler.prototype._knockPlayer = function (player, dir) {
    // Instant nudge so the displacement is immediate
    player.translate(dir.clone().scale(this.bounceDistance));

    // Physics kick if available (Dynamic RB only)
    if (this.usePhysicsIfAvailable && player.rigidbody && player.rigidbody.type === pc.BODYTYPE_DYNAMIC) {
        // Use velocity for a guaranteed visible kick
        var v = dir.clone().scale(this.knockSpeed);
        player.rigidbody.linearVelocity = v;
    }

    // Continue moving for a short duration (works even without physics)
this._knock = {
    ent: player,
    dir: dir.clone(),
    speed: this.knockSpeed,
    timeLeft: 0.4,       // was this.knockDuration; try longer so spin reads better
    spinSpeedDeg: 1080   // more spin
};

// physics spin for XY: Z axis
if (this.usePhysicsIfAvailable && player.rigidbody && player.rigidbody.type === pc.BODYTYPE_DYNAMIC) {
    player.rigidbody.angularVelocity = new pc.Vec3(0, 0, 25); // stronger spin impulse
    // make sure angular damping is not killing the spin too fast
    if (player.rigidbody.angularDamping > 0.5) {
        player.rigidbody.angularDamping = 0.2;
    }
}
};

CollisionHandler.prototype._goToFailure = function () {
    if (this.app.scenes.changeScene) {
        this.app.scenes.changeScene(this.failureScene);
    } else {
        var item = this.app.scenes.find(this.failureScene);
        if (item && item.url) {
            this.app.scenes.loadSceneHierarchy(item.url, function (err) {
                if (err) console.error('Failed to load failure scene:', err);
            });
        } else {
            console.error('Failure scene not found by name:', this.failureScene);
        }
    }
    this._switchScheduled = false;
};
