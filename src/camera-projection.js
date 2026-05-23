// Camera projection — a faithful JS mirror of the camera built in
// fragment.glsl main(). The Physics-mode overlay (physics-overlay.js) draws 2D
// vector/topology glyphs that must register pixel-exactly on top of the
// ray-marched scene, so it has to reconstruct the *same* eye position and
// basis the shader uses, in both camera modes, and invert the same ray map.
//
// Shader reference (fragment.glsl, verbatim logic):
//   uv  = (2·gl_FragCoord − resolution) / resolution.y      // origin bottom-left
//   cam = (free)  r·(cosE·cosA, sinE, cosE·sinA)
//         (auto)  (cos(ang)·r, ch, sin(ang)·r),  ang=1.40+0.55·sin(t·0.032),
//                                                 ch =3.0 +2.5 ·sin(t·0.029)
//   fwd = normalize(−cam) ; rgt = normalize(cross(fwd, +Y)) ; upv = cross(rgt, fwd)
//   rd  = normalize(fwd + fov·(uv.x·rgt + uv.y·upv))
//
// Two invariants make this easy to sanity-check: the origin (Earth centre)
// always projects to screen-centre (fwd points at it), and the subsolar point
// (r₀,0,0) lands on the dayside limb.

const sub   = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot   = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len   = (a)    => Math.hypot(a[0], a[1], a[2]);
const norm  = (a)    => { const l = len(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

export class CameraProjection {
    // Rebuild the camera basis for this frame from the live uniforms + clock.
    //   u        — the merged per-frame uniforms (camMode/camAzim/camElev/camRadius/fov)
    //   timeSecs — the same value pushed to u_time (auto-orbit phase)
    //   resW/H   — drawing-buffer pixels (== u_resolution)
    update(u, timeSecs, resW, resH) {
        const r = u.camRadius ?? 12.0;
        let cam;
        if ((u.camMode ?? 0) === 1) {
            const ce = Math.cos(u.camElev ?? 0), a = u.camAzim ?? 0;
            cam = [r*ce*Math.cos(a), r*Math.sin(u.camElev ?? 0), r*ce*Math.sin(a)];
        } else {
            const ang = 1.40 + 0.55*Math.sin(timeSecs*0.032);
            const ch  = 3.0  + 2.5 *Math.sin(timeSecs*0.029);
            cam = [Math.cos(ang)*r, ch, Math.sin(ang)*r];
        }
        this.cam = cam;
        this.fwd = norm([-cam[0], -cam[1], -cam[2]]);
        this.rgt = norm(cross(this.fwd, [0, 1, 0]));
        this.upv = cross(this.rgt, this.fwd);
        this.fov = u.fov ?? 0.38;
        this.resW = resW;
        this.resH = resH;
    }

    // World point [R_E] → { x, y, depth } in drawing-buffer pixels (canvas-2D
    // convention: origin top-left, y down), or null if behind the camera.
    project(P) {
        const d = sub(P, this.cam);
        const a = dot(d, this.fwd);                 // forward distance
        if (a <= 1e-4) return null;                 // at/behind the image plane
        const ux = dot(d, this.rgt) / (this.fov * a);
        const uy = dot(d, this.upv) / (this.fov * a);
        const fx = (ux * this.resH + this.resW) * 0.5;
        const fy = (uy * this.resH + this.resH) * 0.5;
        return { x: fx, y: this.resH - fy, depth: a };
    }

    // Is world point P hidden behind Earth's unit sphere from the camera?
    // (ray cam→P enters the sphere before reaching P). Cheap ray-sphere test.
    occluded(P) {
        const d = sub(P, this.cam);
        const dist = len(d);
        const dir = [d[0]/dist, d[1]/dist, d[2]/dist];
        const b = dot(this.cam, dir);
        const c = dot(this.cam, this.cam) - 1.0;    // unit sphere
        const disc = b*b - c;
        if (disc <= 0) return false;
        const t0 = -b - Math.sqrt(disc);
        return t0 > 1e-3 && t0 < dist - 1e-3;        // sphere sits in front of P
    }
}
