var PathFollower = pc.createScript('pathFollower');

PathFollower.attributes.add('speed', { type: 'number', default: 3, title: 'Speed (m/s)' });
PathFollower.attributes.add('faceForward', { type: 'boolean', default: true, title: 'Face Forward' });
PathFollower.attributes.add('headingOffsetDeg', {
    type: 'number',
    default: 0,
    title: 'Heading Offset (deg)'
});
PathFollower.attributes.add('alignToGoalRotation', { type: 'boolean', default: true, title: 'Align To Goal Rotation' });



// Helper: combined world AABB for an entity
PathFollower.prototype._getWorldAabb = function (ent) {
    var mi = null;
    if (ent.render && ent.render.meshInstances && ent.render.meshInstances.length) {
        mi = ent.render.meshInstances;
    } else if (ent.model && ent.model.meshInstances && ent.model.meshInstances.length) {
        mi = ent.model.meshInstances; // legacy Model component
    }
    if (!mi || !mi.length) return null;

    var aabb = mi[0].aabb.clone();
    for (var i = 1; i < mi.length; i++) aabb.add(mi[i].aabb);
    return aabb;
};

// Helper: world scale
PathFollower.prototype._getWorldScale = function (ent, out) {
    out = out || new pc.Vec3();
    ent.getWorldTransform().getScale(out);
    return out;
};

// Helper: compute world-top Y of a box collision by transforming its 8 corners
PathFollower.prototype._getCollisionBoxTopY = function (ent) {
    if (!(ent.collision && ent.collision.type === 'box')) return null;

    var half = ent.collision.halfExtents;      // local
    var scale = this._getWorldScale(ent);      // world scale
    var hx = half.x * scale.x, hy = half.y * scale.y, hz = half.z * scale.z;

    var m = ent.getWorldTransform().clone();   // world matrix
    var corner = new pc.Vec3();
    var maxY = -Infinity;

    // 8 corners in local space
    var sx = [ -hx,  hx ];
    var sy = [ -hy,  hy ];
    var sz = [ -hz,  hz ];

    for (var ix = 0; ix < 2; ix++) {
        for (var iy = 0; iy < 2; iy++) {
            for (var iz = 0; iz < 2; iz++) {
                corner.set(sx[ix], sy[iy], sz[iz]);
                m.transformPoint(corner, corner);   // to world
                if (corner.y > maxY) maxY = corner.y;
            }
        }
    }
    return maxY; // true world-space top of the rotated box
};

// Main snap: box goal + cylinder player, plane-aware, rotation-safe
PathFollower.prototype._snapToGoalFit = function () {
    var pd = this.entity.script && this.entity.script.pathDrawer;
    if (!(pd && pd.goal)) return;

    var goal = pd.goal;
    if (!(goal.collision && goal.collision.type === 'box')) return;
    if (!(this.entity.collision && this.entity.collision.type === 'cylinder')) return;

    // 1) True top Y of the goal box, regardless of rotation
    var goalTopY = this._getCollisionBoxTopY(goal);
    if (goalTopY == null) return;

    // 2) Player half height in world space
    var pScale = this._getWorldScale(this.entity);
    var playerHalfHeight = 0.5 * this.entity.collision.height * pScale.y;

    // 3) Choose plane layout
    var plane = pd.drawingPlane || 'XZ';
    var goalPos = goal.getPosition();

    // 4) Build target position
    var target;
    if (plane === 'XY') {
        // Side view: center in X on goal center, place on top in Y, keep Z as is
        var keepZ = this.entity.getPosition().z;
        target = new pc.Vec3(goalPos.x, goalTopY + playerHalfHeight, keepZ);
    } else {
        // Top-down: center in XZ on goal center, place on top in Y
        target = new pc.Vec3(goalPos.x, goalTopY + playerHalfHeight, goalPos.z);
    }

    // 5) Apply
    this.entity.setPosition(target);
    if (this.alignToGoalRotation) {
        this.entity.setRotation(goal.getRotation());
    }
};


PathFollower.prototype.initialize = function () {
    this.path = [];
    this.segmentIndex = 0;
    this.segmentT = 0;
    this.following = false;
    this._wasFollowing = false;

    // cache temp vectors to avoid per-frame allocations
    this._tmpVec = new pc.Vec3();
    this._pos = new pc.Vec3();
    this._look = new pc.Vec3();
};


PathFollower.prototype._sanitize = function (points, minSegLen) {
    var out = [];
    if (!points || !points.length) return out;
    out.push(points[0].clone());
    for (var i = 1; i < points.length; i++) {
        if (points[i].distance(out[out.length - 1]) >= (minSegLen || 0.05)) {
            out.push(points[i].clone());
        }
    }
    return out;
};

PathFollower.prototype.setPath = function (points) {
    // Drop zero-length hops; 5cm default threshold
    this.path = this._sanitize(points, 0.05);

    this.segmentIndex = 0;
    this.segmentT = 0;
    this.following = false;              // manager starts it
    this._wasFollowing = false;          // reset

    if (this.entity.rigidbody) {
        this.entity.rigidbody.linearVelocity.set(0, 0, 0);
        this.entity.rigidbody.angularVelocity.set(0, 0, 0);
    }
};

PathFollower.prototype.update = function (dt) {
    if (!this.following) return;

    if (!this._wasFollowing) {
        this._wasFollowing = true;
        // Snap to the true path start without advancing
        if (this.path && this.path.length > 0) {
            this.entity.setPosition(this.path[0]);
        }
        this.segmentT = 0; // do NOT pre-advance
    }

    var a, b, segLen;

    // Skip degenerate segments before moving
    while (this.segmentIndex < this.path.length - 1) {
        a = this.path[this.segmentIndex];
        b = this.path[this.segmentIndex + 1];
        segLen = this._tmpVec.sub2(b, a).length();
        if (segLen >= 1e-3) break;        // ~1mm threshold
        this.segmentIndex++;
        this.segmentT = 0;
    }

    // END CASE #1: at top of update()
    if (this.segmentIndex >= this.path.length - 1) {
        var last = (this.path.length > 0) ? this.path[this.path.length - 1] : this.entity.getPosition();
        if (last) this.entity.setPosition(last);
        this._snapToGoalFit();            // <— add this
        this.following = false;
        if (this.app) this.app.fire('player:pathEnd', this.entity);
        return;
    }

    // Advance along current segment
    segLen = this._tmpVec.sub2(b, a).length();
    if (segLen < 1e-4) {
        this.segmentIndex++;
        this.segmentT = 0;
        return;
    }

    var step = (this.speed * dt) / segLen;
    this.segmentT += step;

    // Handle crossing segment boundaries
    while (this.segmentT >= 1 && this.segmentIndex < this.path.length - 1) {
        this.segmentT -= 1;
        this.segmentIndex++;

        // END CASE #2: stepped past final segment boundary
        if (this.segmentIndex >= this.path.length - 1) {
            var endPos = this.path[this.path.length - 1];
            if (endPos) this.entity.setPosition(endPos);
            this._snapToGoalFit();            // <— add this
            this.following = false;
            if (this.app) this.app.fire('player:pathEnd', this.entity);
            return;
        }

        // prepare next segment
        a = this.path[this.segmentIndex];
        b = this.path[this.segmentIndex + 1];
        segLen = this._tmpVec.sub2(b, a).length();
        if (segLen < 1e-4) continue;
    }

    // Interpolate position
    this._pos.lerp(a, b, this.segmentT);
    this.entity.setPosition(this._pos);

    this.app.fire('path:progress', this.entity, this.segmentIndex, this.segmentT, this._pos.clone());

    if (this.faceForward && segLen >= 1e-4) {
        var pd = this.entity.script && this.entity.script.pathDrawer;
        var plane = pd ? pd.drawingPlane : 'XZ';

        if (plane === 'XY') {
            // side-view: rotate around Z
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var ang = Math.atan2(dy, dx); // radians
            var deg = pc.math.RAD_TO_DEG * ang + (this.headingOffsetDeg || 0);
            this.entity.setLocalEulerAngles(0, 0, deg);
        } else {
            // top-down: rotate around Y
            var dx = b.x - a.x;
            var dz = b.z - a.z;
            var yaw = Math.atan2(dx, dz); // radians (0 faces -Z)
            var deg = pc.math.RAD_TO_DEG * yaw + (this.headingOffsetDeg || 0);
            this.entity.setEulerAngles(0, deg, 0);
        }
    }
};
