var PathDrawer = pc.createScript('pathDrawer');

// === Attributes ===
PathDrawer.attributes.add('camera', { type: 'entity', title: 'Camera' });
PathDrawer.attributes.add('follower', { type: 'entity', title: 'Follower (with PathFollower)' });
PathDrawer.attributes.add('groundY', { type: 'number', default: 0, title: 'Ground Y (when drawingPlane=XZ)' });
PathDrawer.attributes.add('minPointSpacing', { type: 'number', default: 0.25, title: 'Min Point Spacing (m)' });
PathDrawer.attributes.add('markerScale', { type: 'number', default: 0.08, title: 'Marker Scale' });
PathDrawer.attributes.add('startOnObject', { type: 'boolean', default: true, title: 'Must Start On Object?' });
PathDrawer.attributes.add('lineWidth', { type: 'number', default: 0.15, title: 'Line Width (world units)' });
PathDrawer.attributes.add('targetTag', { type: 'string', default: 'goal', title: 'Target Tag' });
PathDrawer.attributes.add('goalRadius', { type: 'number', default: 0.35, title: 'Goal Radius' });
PathDrawer.attributes.add('requireGoal', { type: 'boolean', default: true, title: 'Require Reaching Goal To Accept Path' });
PathDrawer.attributes.add('autoExtendToGoal', { type: 'boolean', default: true, title: 'Auto-extend Final Segment To Goal' });
PathDrawer.attributes.add('clearOldPathOnStart', { type: 'boolean', default: true, title: 'Clear Old Path On New Draw' });
PathDrawer.attributes.add('deferStart', { type: 'boolean', default: true, title: 'Defer Start (manager will start all together)' });
PathDrawer.attributes.add('goalHitPadding', {
    type: 'number',
    default: 0.08,
    title: 'Goal Hit Padding (m)'
});


PathDrawer.attributes.add('drawingPlane', {
    type: 'string',
    enum: [{ 'XZ': 'XZ' }, { 'XY': 'XY' }],
    default: 'XZ',
    title: 'Drawing Plane'
});
PathDrawer.attributes.add('planeZ', {
    type: 'number',
    default: 0,
    title: 'Plane Z (when drawingPlane=XY)'
});

PathDrawer.attributes.add('blockTopPixels', { type: 'number', default: 150, title: 'Block Top Screen Pixels' });

// === Init / Teardown ===
// === Init / Teardown ===
PathDrawer.prototype.initialize = function () {
    this.drawing = false;
    this.points = [];
    this._lastPoint = null;
    this.lastTarget = null;
    this.lineColor = this._getLineColor();
    this._activeTouchId = null; // track a single finger

    this.markerTemplate = new pc.Entity();
    this.markerTemplate.addComponent('render', { type: 'sphere' });
    this.markerTemplate.setLocalScale(this.markerScale, this.markerScale, this.markerScale);

    // Mouse
    this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
    this.app.mouse.on(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
    this.app.mouse.on(pc.EVENT_MOUSEUP, this.onMouseUp, this);

    // Touch
    if (this.app.touch) {
        this._onTouchStart = this.onTouchStart.bind(this);
        this._onTouchMove = this.onTouchMove.bind(this);
        this._onTouchEnd = this.onTouchEnd.bind(this);

        this.app.touch.on(pc.EVENT_TOUCHSTART, this._onTouchStart, this);
        this.app.touch.on(pc.EVENT_TOUCHMOVE, this._onTouchMove, this);
        this.app.touch.on(pc.EVENT_TOUCHEND, this._onTouchEnd, this);
        this.app.touch.on(pc.EVENT_TOUCHCANCEL, this._onTouchEnd, this);
    }

    this._onProgress = (ent, segIdx, segT, pos) => {
        if (ent === this.follower) this._updateRemainingLine(segIdx, segT, pos);
    };
    this.app.on('path:progress', this._onProgress, this);
};

PathDrawer.prototype.destroy = function () {
    if (this._onProgress) this.app.off('path:progress', this._onProgress, this);

    // Unhook mouse
    this.app.mouse.off(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
    this.app.mouse.off(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
    this.app.mouse.off(pc.EVENT_MOUSEUP, this.onMouseUp, this);

    // Unhook touch
    if (this.app.touch) {
        this.app.touch.off(pc.EVENT_TOUCHSTART, this._onTouchStart, this);
        this.app.touch.off(pc.EVENT_TOUCHMOVE, this._onTouchMove, this);
        this.app.touch.off(pc.EVENT_TOUCHEND, this._onTouchEnd, this);
        this.app.touch.off(pc.EVENT_TOUCHCANCEL, this._onTouchEnd, this);
    }
};


PathDrawer.prototype._getLineColor = function () {
    if (this.lineColor instanceof pc.Color) return this.lineColor;
    return Math.random() < 0.5 ? new pc.Color(1, 0, 0) : new pc.Color(0, 0.4, 1);
};


// === Line Build ===
PathDrawer.prototype.buildLine = function (pts) {
    if (this.lineEntity) { this.lineEntity.destroy(); this.lineEntity = null; }
    const points = pts || this.points;
    const n = points.length;
    if (n < 2) return;

    const gd = this.app.graphicsDevice;
    const halfW = (this.lineWidth || 0.15) * 0.5;
    const EPS = 0.001;

    function perpXZ(dx, dz) { return new pc.Vec3(-dz, 0, dx); }
    function perpXY(dx, dy) { return new pc.Vec3(-dy, dx, 0); }

    const positions = new Float32Array(n * 2 * 3);
    const normals = new Float32Array(n * 2 * 3);
    const indices = new Uint16Array((n - 1) * 6);

    for (let i = 0; i < n; i++) {
        const p = points[i];
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(n - 1, i + 1)];
        const t = new pc.Vec3().sub2(next, prev).normalize();

        let perp;
        if (this.drawingPlane === 'XZ') perp = perpXZ(t.x, t.z).normalize();
        else perp = perpXY(t.x, t.y).normalize();

        const left = new pc.Vec3().copy(p).add(new pc.Vec3().copy(perp).scale(halfW));
        const right = new pc.Vec3().copy(p).add(new pc.Vec3().copy(perp).scale(-halfW));

        if (this.drawingPlane === 'XZ') { left.y -= EPS; right.y -= EPS; }
        else { left.z -= EPS; right.z -= EPS; }

        const base = i * 2 * 3;
        positions[base + 0] = left.x; positions[base + 1] = left.y; positions[base + 2] = left.z;
        positions[base + 3] = right.x; positions[base + 4] = right.y; positions[base + 5] = right.z;

        let nx = 0, ny = 0, nz = 0;
        if (this.drawingPlane === 'XZ') ny = 1; else nz = 1;
        normals[base + 0] = nx; normals[base + 1] = ny; normals[base + 2] = nz;
        normals[base + 3] = nx; normals[base + 4] = ny; normals[base + 5] = nz;
    }

    for (let i = 0; i < n - 1; i++) {
        const l0 = i * 2, r0 = l0 + 1;
        const l1 = (i + 1) * 2, r1 = l1 + 1;
        const idx = i * 6;
        indices[idx + 0] = l0; indices[idx + 1] = r0; indices[idx + 2] = l1;
        indices[idx + 3] = r0; indices[idx + 4] = r1; indices[idx + 5] = l1;
    }

    const mesh = new pc.Mesh(gd);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES, true, false);

    const mat = new pc.StandardMaterial();
    mat.useLighting = false;

    const col = this.lineColor || new pc.Color(1, 0, 0);
    mat.diffuse.copy(col);
    mat.emissive.copy(col);
    mat.emissiveIntensity = 1;
    mat.blendType = pc.BLEND_NORMAL; // enable transparency blending
    mat.depthTest = true;            // still test depth so it hides behind obstacles
    mat.depthWrite = false;          // but don’t block later renders
    mat.update();


    const node = new pc.GraphNode();
    const mi = new pc.MeshInstance(mesh, mat, node);
    mi.drawOrder = 1;

    this.lineEntity = new pc.Entity('DrawnPath');
    this.lineEntity.addComponent('render', { meshInstances: [mi] });
    this.lineEntity.render.layers = [0];
    if (this.camera && this.camera.camera) {
        this.lineEntity.render.layers = this.camera.camera.layers.slice();
    }
    this.lineEntity.render.castShadows = false;
    this.lineEntity.render.receiveShadows = false;

    this.app.root.addChild(this.lineEntity);

};

// Tail update while follower moves
PathDrawer.prototype._updateRemainingLine = function (segIdx, segT, worldPos) {
    if (!this.points || this.points.length < 2) return;

    const remaining = []; // <-- FIX: declare it
    const start = worldPos.clone();
    if (this.drawingPlane === 'XZ') start.y = this.groundY;
    else start.z = this.planeZ;
    remaining.push(start);

    for (let i = Math.max(0, segIdx + 1); i < this.points.length; i++) {
        const p = this.points[i].clone();
        if (this.drawingPlane === 'XZ') p.y = this.groundY;
        else p.z = this.planeZ;
        remaining.push(p);
    }

    if (remaining.length < 2) {
        this.clearLine();
        return;
    }
    this.buildLine(remaining);
};

PathDrawer.prototype._isGoalHit = function (pt /* pc.Vec3 */) {
    if (!this.goal) return false;

    // Plane reduction: pick the two axes we care about
    var plane = this.drawingPlane || 'XZ';
    var gx, gy, px, py;

    var gpos = this.goal.getPosition();
    if (plane === 'XZ') {
        gx = gpos.x; gy = gpos.z;
        px = pt.x; py = pt.z;
    } else { // 'XY'
        gx = gpos.x; gy = gpos.y;
        px = pt.x; py = pt.y;
    }

    var pad = this.goalHitPadding || 0;

    // Prefer precise check if the goal has a Collision component
    var col = this.goal.collision;
    if (col) {
        switch (col.type) {
            case 'box': {
                // Use half extents projected to the plane
                var he = col.halfExtents; // x,y,z in world axes
                var hx = (plane === 'XZ') ? he.x : he.x;
                var hy = (plane === 'XZ') ? he.z : he.y;
                return (Math.abs(px - gx) <= hx + pad) && (Math.abs(py - gy) <= hy + pad);
            }
            case 'sphere': {
                var r = (col.radius || 0) + pad;
                var dx = px - gx, dy = py - gy;
                return (dx * dx + dy * dy) <= r * r;
            }
            case 'capsule': {
                // Capsule axis is along world Y; projection footprint on XZ is a circle of radius=r
                // For XY plane, we’ll approximate as a rectangle + round ends by using max(r, halfWidth)
                var r = (col.radius || 0) + pad;
                if (plane === 'XZ') {
                    var dx = px - gx, dy = py - gy;
                    return (dx * dx + dy * dy) <= r * r;
                } else { // XY approximation as AABB
                    var heX = r; // horizontal reach
                    var heY = (col.height ? col.height * 0.5 : r) + r; // body half-height + cap radius
                    return (Math.abs(px - gx) <= heX) && (Math.abs(py - gy) <= heY);
                }
            }
        }
    }

    // Fallback: use worldPos (from spawner) + radius
    var goalPos = this.goal.worldPos ? this.goal.worldPos.clone()
        : this.getGoalPosFromEntity(this.goal);
    if (!goalPos) return false;

    // reduce to plane
    var gpx, gpy;
    if (plane === 'XZ') { gpx = goalPos.x; gpy = goalPos.z; }
    else { gpx = goalPos.x; gpy = goalPos.y; }

    var dx = px - gpx, dy = py - gpy;
    var r2 = (this.goalRadius + pad);
    return (dx * dx + dy * dy) <= r2 * r2;
};


PathDrawer.prototype.clearLine = function () {
    if (this.lineEntity) { this.lineEntity.destroy(); this.lineEntity = null; }
};

PathDrawer.prototype.stopFollower = function () {
    var pf = this.follower && this.follower.script && this.follower.script.pathFollower;
    if (pf) pf.following = false;
};

PathDrawer.prototype.getGoalPosFromEntity = function (ent) {
    if (!ent) return null;
    var g = ent.getPosition().clone();
    if (this.drawingPlane === 'XZ') g.y = this.groundY;
    else g.z = this.planeZ;
    return g;
};

// Ray → plane hit
PathDrawer.prototype.screenToGround = function (x, y) {
    if (!this.camera || !this.camera.camera) return null;
    var cam = this.camera.camera;
    var from = new pc.Vec3(), to = new pc.Vec3();
    cam.screenToWorld(x, y, cam.nearClip, from);
    cam.screenToWorld(x, y, cam.farClip, to);
    var dir = new pc.Vec3().sub2(to, from).normalize();

    const EPS = 1e-6;

    if (this.drawingPlane === 'XZ') {
        if (Math.abs(dir.y) < EPS) return null; // parallel to plane
        var tY = (this.groundY - from.y) / dir.y;
        if (tY < 0) return null;
        return new pc.Vec3(from.x + dir.x * tY, this.groundY, from.z + dir.z * tY);
    } else { // 'XY'
        if (Math.abs(dir.z) < EPS) return null; // parallel to plane
        var tZ = (this.planeZ - from.z) / dir.z;
        if (tZ < 0) return null;
        return new pc.Vec3(from.x + dir.x * tZ, from.y + dir.y * tZ, this.planeZ);
    }
};

// Pointer handlers
PathDrawer.prototype.pointerDown = function (x, y) {
    if (this.startOnObject) {
        var picked = this.pick(x, y);
        if (!picked || picked.entity !== this.follower) return;
    }
    if (this.clearOldPathOnStart) {
        this.stopFollower();
        this.clearLine();
    }
    this.app.fire('path:cancel', this.follower);
    this.lastTarget = null;

    var screenY = y;
    if (screenY < this.blockTopPixels) screenY = this.blockTopPixels;

    var p = this.screenToGround(x, screenY);
    if (!p) return;

    this.drawing = true;
    this.points = [p.clone()];
    this._lastPoint = p.clone();
};

PathDrawer.prototype.pointerMove = function (x, y) {
    if (!this.drawing) return;

    var screenY = y;
    if (screenY < this.blockTopPixels) screenY = this.blockTopPixels;

    var p = this.screenToGround(x, screenY);
    if (!p) return;

    if (!this._lastPoint || p.distance(this._lastPoint) >= this.minPointSpacing) {
        this.points.push(p.clone());
        this._lastPoint.copy(p);
        this.buildLine();
    }
};


PathDrawer.prototype.pointerUp = function () {
    if (!this.drawing) return;
    this.drawing = false;

    for (var i = 0; i < this.points.length; i++) {
        if (this.drawingPlane === 'XZ') this.points[i].y = this.groundY;
        else this.points[i].z = this.planeZ;
    }

    if (this.points.length < 1) {
        this.clearLine && this.clearLine();
        this.lastTarget = null;
        return;
    }

    var start = this.follower.getPosition().clone();
    if (this.drawingPlane === 'XZ') start.y = this.groundY;
    else start.z = this.planeZ;

    if (this.points[0].distance(start) > 1e-4) {
        this.points.unshift(start);
    }

    var reached = false;
    if (this.goal) {
        const last = this.points[this.points.length - 1];
        if (this._isGoalHit(last)) {
            reached = true;
            if (this.autoExtendToGoal) {
                const goalPos = this.goal.getPosition().clone();

                // ✅ Add a small lift above the goal
                const liftY = 0.8; // adjust to how high you want it to hover
                if (this.drawingPlane === 'XZ') {
                    goalPos.y += liftY;
                } else {
                    goalPos.z += liftY;
                }

                const snapMax = (this.goalRadius || 0.35) + (this.goalHitPadding || 0.08);
                if (last.distance(goalPos) <= snapMax) this.points.push(goalPos);
            }
        }

    }

    if (this.requireGoal && !reached) {
        this.stopFollower && this.stopFollower();
        this.clearLine && this.clearLine();
        this.points.length = 0;
        this.lastTarget = null;
        return;
    }

    var pf = this.follower && this.follower.script && this.follower.script.pathFollower;
    if (pf && typeof pf.setPath === 'function') pf.setPath(this.points);

    this.buildLine && this.buildLine();
    this.app.fire('path:ready', this.follower);
};

// Physics raycast
PathDrawer.prototype.pick = function (x, y) {
    if (!this.camera || !this.camera.camera) return null;
    var cam = this.camera.camera;
    var from = cam.screenToWorld(x, y, cam.nearClip);
    var to = cam.screenToWorld(x, y, cam.farClip);
    var hit = this.app.systems.rigidbody.raycastFirst(from, to);
    return hit || null;
};

// Mouse hookups
PathDrawer.prototype.onMouseDown = function (e) { this.pointerDown(e.x, e.y); };
PathDrawer.prototype.onMouseMove = function (e) { this.pointerMove(e.x, e.y); };
PathDrawer.prototype.onMouseUp = function (e) { this.pointerUp(); };

// === Touch hookups ===
PathDrawer.prototype._getTouchById = function (touchEvent, id) {
    for (var i = 0; i < touchEvent.touches.length; i++) {
        var t = touchEvent.touches[i];
        if (t.id === id) return t;
    }
    // also check changedTouches for end events
    if (touchEvent.changedTouches) {
        for (var j = 0; j < touchEvent.changedTouches.length; j++) {
            var ct = touchEvent.changedTouches[j];
            if (ct.id === id) return ct;
        }
    }
    return null;
};

PathDrawer.prototype.onTouchStart = function (e) {
    // prevent page scrolling
    if (e.event && e.event.preventDefault) e.event.preventDefault();

    // If we are not currently drawing with a finger, take the first touch
    if (this._activeTouchId === null && e.touches.length > 0) {
        var t = e.touches[0];
        this._activeTouchId = t.id;
        this.pointerDown(t.x, t.y);
    }
};

PathDrawer.prototype.onTouchMove = function (e) {
    if (e.event && e.event.preventDefault) e.event.preventDefault();
    if (this._activeTouchId === null) return;

    var t = this._getTouchById(e, this._activeTouchId);
    if (t) this.pointerMove(t.x, t.y);
};

PathDrawer.prototype.onTouchEnd = function (e) {
    if (e.event && e.event.preventDefault) e.event.preventDefault();
    if (this._activeTouchId === null) return;

    // Did our active finger end or get cancelled
    var t = this._getTouchById(e, this._activeTouchId);
    if (t) {
        this.pointerUp();
        this._activeTouchId = null;
    }
};
