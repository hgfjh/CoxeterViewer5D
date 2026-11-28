# UI Map

The viewer stays in the center. The surrounding controls follow the same order
as the mathematics: choose a source, choose a model, select an object, and read
its status.

## Main Regions

Left rail, top to bottom:

- **Choose Example** (Research mode: **Source**) selects the source Coxeter
  system. Radius appears only for the Davis and Projection views.
- **Start Here** (Teaching mode only) offers short paths into the source,
  cover, wall, and coorientation workflows.
- **View** holds the **Model switch**: **Davis complex**, **hat X cover**,
  **bar X compression**, **Defining graph Gamma**, and **Projection drawing**.
- **Covers + Walls** discovers or imports a finite action, builds `hat X`,
  certifies the compression, finds walls, flips coorientations, inspects
  directed links, and runs the two-track certificate for `H → ℤ`. Automatic
  GAP/Sage discovery runs as a desktop or external job; import is the browser
  fallback.
- **Labels** toggles vertex and edge labels.

Center:

- **Viewer** is the main 3D scene. The top bar shows vertex, edge, cell, and
  wall counts and has buttons for the guided tour (question mark), the colour
  theme, viewer-only mode, and PNG export. Press `U` to hide or restore the
  side rails; in viewer-only mode a floating **Show controls (U)** button
  restores them.

Above 1180 px wide the three regions sit side by side. From 761 to 1180 px the
left and right rails stack in one column beside the viewer. At 760 px and
below everything is one column, viewer first.

Right rail:

- **Inspector** always answers what is selected, why it exists, and which parts
  are exact data or drawings.
- **Caveats drawer** groups active limitations without occupying the scene.
- **Research tools** (Research mode only) show evidence, backend status, render
  statistics, and the wall-system diagnostic summary in **Data + Status**.
- **Notebook + Export** (Research mode only) writes the source cover,
  compression map, wall system, coorientation, lawful-cell result, link
  diagnostics, and view state.
- **Interface** switches between Teaching and Research modes.

## Reading Controls

Importing a cover or changing a wall sign changes the combinatorial object or
its coorientation. Labels, opacity, wall-arc visibility, camera, and clipping
change only the drawing. The inspector states this distinction for the current
selection.

## Guided Tour

The question-mark button restarts a guided tour of every view on the ideal
hyperbolic 3-cube and its S4 cover. The tour opens by itself once per browser;
`?tour=1` forces it and `?tour=0` suppresses it. See
[UI Controls](ui-controls.md#guided-tour).
