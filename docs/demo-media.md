# Demo Media

Demo media should teach inspection habits. A good screenshot or short clip
shows the selected mathematical object, the relevant warnings, and enough UI
context to tell exact data from drawing convention.

## Recommended Demo Set

Capture these views first:

- Hexagon relation: `A2`, rank-two pair with `m = 3`, one filled six-sided
  Davis cell.
- Decagon relation: `I2(5)`, full rank-two cell boundary with alternating
  generator labels.
- Rank-three cell: `A3`, one finite triple with square and hexagon face
  incidence visible.
- `Y_Gamma`: one relation face, one around-generator view, and one full
  two-skeleton overview.
- Quotient/game: `I2(5)` identity-subgroup workflow with the cocycle
  `s0 = +1`, `s1 = -1`, and the boundary-sum diagnostic visible.
- Geometric projection: a toy hyperbolic example or certified compact example
  with the projection warning visible.

## Capture Checklist

Before saving media:

- Select the object being explained.
- Show the inspector or reader panel that names the selected object.
- Leave the warnings panel accessible when approximations or truncation matter.
- Use labels only where they clarify the object; crowded labels make poor
  teaching images.
- Prefer local or focused views for cells. Use full-graph views for context.
- Export the view sidecar JSON when the image will be cited, filed in an issue,
  or used in documentation.

## Suggested Captions

Use captions that identify both the object and the drawing layer:

- "A rank-two Davis hexagon for an `m = 3` Coxeter pair. The boundary data is
  exact in the generated ball; the planar fill is a drawing."
- "`A3` rank-three incidence proxy. The square and hexagon faces record
  spherical rank-two subsets in the selected triple."
- "`Y_Gamma` one-relation view. The visible face is a singular relation sheet
  attached to the one-vertex generator spine."
- "`I2(5)` quotient/game demo. The decagon boundary sum vanishes for the named
  integer cocycle."
- "Hyperbolic chamber barycenters projected to 3D by PCA. Distances and
  intersections in the image are not exact hyperbolic data."

## File Naming

Use names that can be sorted and understood without opening the file:

```text
docs/screenshots/hexagon-a2-rank-two-m3.png
docs/screenshots/a3-rank-three-square-hexagon.png
docs/screenshots/y-gamma-one-relation-a3.png
docs/screenshots/i2-5-quotient-game-cocycle.png
```

When a sidecar is exported, use the same stem:

```text
docs/screenshots/hexagon-a2-rank-two-m3.sidecar.json
```

Do not commit large videos by default. Prefer short clips, compressed assets,
or links to release artifacts when motion is essential.

## Accessibility Notes

Every image used in documentation should have alt text that states the
mathematical object, not just the visual style. Good alt text:

```text
Rank-two Davis hexagon for generators s0 and s1 in A2, with six alternating
boundary edges and one filled relation cell.
```

Avoid alt text such as "colorful graph view" because it does not tell a reader
what mathematical structure is being shown.

## What Not To Show

Avoid screenshots that:

- Hide all warnings while showing approximate geometry.
- Present a force layout as if it were hyperbolic geometry.
- Show a clipped cell as filled.
- Use dense all-face `Y_Gamma` views when a local reader preset would explain
  the same idea more clearly.
- Crop away the selected-object inspector.

The demo should make the viewer more honest, not more dramatic.
