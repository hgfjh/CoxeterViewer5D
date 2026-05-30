# Demo Media

Demo media should teach inspection habits. A good screenshot or short clip
shows the selected mathematical object, the relevant warnings, and enough UI
context to tell exact data from drawing convention.

## Public-Alpha Demo Set

The public alpha uses four primary captures. They are small enough to keep in
the repo as screenshots and specific enough to teach the main inspection habits.

- Find a hexagon: `A2`, rank-two pair `s0-s1` with `m = 3`, one filled
  six-sided Davis cell, and the selected-cell inspector visible.
- Inspect A3 rank-three cell: `A3`, `Y_Gamma(A3)` rank-three focus, with square
  and hexagon face families visible as one 3D incidence object.
- Inspect `Y_Gamma` for P2: `compact_5_prism_makarov_p2`, one relation or
  around-generator focus first, then the full two-skeleton if it remains
  readable.
- Run `I2(5)` quotient/game: identity-subgroup workflow with ten cosets, one
  decagon quotient cell, the `s0 = +1`, `s1 = -1` cocycle, and the boundary-sum
  diagnostic visible.

Other views, such as geometric projection or a full compact-example overview,
belong in later release notes unless the screenshot makes the projection caveat
easy to read.

## Capture Tooling

The repository has three useful capture paths:

- **In-app stills**: use **Export screenshot** for a PNG, and export the sidecar
  or experiment notebook bundle when the image will be cited. The sidecar tells
  readers which dataset, selected object, filters, warnings, and scene stats the
  image records.
- **Storyboard metadata**: run `corepack pnpm demo:record` from the repository
  root. This validates that the walkthrough headings named in
  `docs/demo-media-manifest.json` exist and prints deterministic storyboard
  metadata. Use `corepack pnpm demo:record -- --write docs/demo-media-manifest.json`
  only when updating the manifest is part of the release task.
- **Playwright traces**: `corepack pnpm e2e` uses the checked-in Playwright
  config, which records traces on first retry. Traces are useful for debugging a
  failed capture path, but they are not polished demo videos.

There is no checked-in public-alpha video recorder beyond the storyboard
manifest. For motion, use a local screen recorder or a temporary Playwright
video configuration, keep clips short, and publish large videos as release
artifacts instead of committing them to the repo.

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
- Keep the browser viewport and app theme consistent across the four guided
  demos, so the images feel like one tour rather than four unrelated captures.

## Suggested Captions

Use captions that identify both the object and the drawing layer:

- "A rank-two Davis hexagon for an `m = 3` Coxeter pair. The boundary data is
  exact in the generated ball; the planar fill is a drawing."
- "`A3` rank-three incidence proxy. The square and hexagon faces record
  spherical rank-two subsets in the selected triple."
- "`Y_Gamma(P2)` one-relation view. The visible face is a singular relation
  sheet attached to the one-vertex generator spine for the certified P2 source
  system."
- "`I2(5)` quotient/game demo. The decagon boundary sum vanishes for the named
  integer cocycle."
- "Hyperbolic chamber barycenters projected to 3D by PCA. Distances and
  intersections in the image are not exact hyperbolic data."

## File Naming

Use names that can be sorted and understood without opening the file:

```text
docs/screenshots/hexagon-a2-rank-two-m3.png
docs/screenshots/a3-rank-three-square-hexagon.png
docs/screenshots/y-gamma-p2-m5-relation.png
docs/screenshots/i2-5-quotient-game-cocycle.png
```

When a sidecar is exported, use the same stem:

```text
docs/screenshots/hexagon-a2-rank-two-m3.sidecar.json
```

Do not commit large videos by default. Prefer short clips, compressed assets,
or links to release artifacts when motion is essential.

Suggested video stems:

```text
release-media/find-a-hexagon-a2.webm
release-media/a3-rank-three-cell.webm
release-media/y-gamma-p2-reader.webm
release-media/i2-5-quotient-game.webm
```

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
- Mix `A3` and P2 labels in the same `Y_Gamma` capture. The public-alpha P2
  demo should visibly be the P2 source, not a generic `Y_Gamma` scene.

The demo should make the viewer more honest, not more dramatic.
