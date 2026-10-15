// Maps the flat 2D game plane onto a sphere around the camera and projects it with perspective.
//
// Gameplay lives on an infinite flat plane (x, y). For rendering, a point's distance `d` from
// the camera's ground position is treated as an arc length on the planet: it sits at angle
// θ = d / R from the point directly below the camera. Together with an altitude above the planet
// surface this gives a 3D point, which is projected by a pinhole camera looking straight down at
// the planet centre. Near the camera the result is a plain top-down view; further away things
// curve over the horizon and shrink, which is the "warp" that makes it feel 3D.

export interface Projected {
  x: number; // screen x (css px)
  y: number; // screen y (css px)
  kt: number; // screen px per world unit, tangential (perpendicular to the radial direction)
  kr: number; // screen px per world unit, radial (foreshortened as the surface tilts away)
  angle: number; // screen angle of the radial direction (from screen centre outward)
  visible: boolean;
}

export class Projector {
  /** Planet radius (world units). Altitude 0 is the haze surface. */
  readonly R = 1800;
  /** Camera ground position in the game plane. */
  camX = 0;
  camY = 0;
  /** Camera distance from the planet centre. */
  camDist = 0;
  /** Focal length in css px. */
  f = 1;
  cx = 0;
  cy = 0;

  /** Angle (rad) from the camera axis to the visible horizon of the haze surface. */
  get horizonTheta(): number {
    return Math.acos(this.R / this.camDist);
  }

  /** Screen radius of the planet limb. */
  get limbRadius(): number {
    const th = this.horizonTheta;
    return (this.f * this.R * Math.sin(th)) / (this.camDist - this.R * Math.cos(th));
  }

  /**
   * Sets the camera so that points at `refAlt` directly under it are drawn at `zoom` px/unit.
   * `heightAboveRef` is the camera's height above that reference altitude.
   */
  setCamera(x: number, y: number, refAlt: number, heightAboveRef: number, zoom: number, w: number, h: number) {
    this.camX = x;
    this.camY = y;
    const r = this.R + refAlt;
    this.camDist = r + heightAboveRef;
    // At θ→0 the tangential scale is f·r / (R·z), solve for f.
    this.f = (zoom * this.R * heightAboveRef) / r;
    this.cx = w / 2;
    this.cy = h / 2;
  }

  project(px: number, py: number, alt: number): Projected {
    const dx = px - this.camX;
    const dy = py - this.camY;
    const d = Math.hypot(dx, dy);
    const R = this.R;
    const D = this.camDist;
    const r = R + alt;
    const th = d / R;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const z = D - r * c;
    const rho = (this.f * r * s) / z;
    const ux = d > 1e-6 ? dx / d : 1;
    const uy = d > 1e-6 ? dy / d : 0;
    const kt = d > 1e-6 ? rho / d : (this.f * r) / (R * z);
    // dρ/dd
    const kr = Math.max(0, (this.f * r * (D * c - r)) / (R * z * z));
    // Behind the horizon (seen from the camera, line of sight passes through the planet)?
    const visible = th < Math.acos(R / D) + Math.acos(Math.min(1, R / r)) && z > 1;
    return {
      x: this.cx + ux * rho,
      y: this.cy + uy * rho,
      kt,
      kr,
      angle: Math.atan2(uy, ux),
      visible,
    };
  }

  /** Distance (in the game plane) from the camera beyond which the haze surface is hidden. */
  get horizonDistance(): number {
    return this.horizonTheta * this.R;
  }
}
