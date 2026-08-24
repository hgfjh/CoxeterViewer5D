# UI Map

The viewer stays in the center. The surrounding controls follow the same order
as the mathematics: choose a source, choose a model, select an object, and read
its status.

## Main Regions

- **Choose Example** selects the source Coxeter system. Radius appears only for
  the Davis and Projection views.
- **Model switch** changes among **Davis complex**, **hat X cover**,
  **bar X compression**, **Defining graph Gamma**, and **Projection drawing**.
- **Start Here + Focus controls** provide short paths into the source,
  cover/compression, and wall workflows.
- **Covers + Walls** is designed to discover or import a finite action,
  construct `hat X`, certify the compression, find walls, flip
  coorientations, and inspect the induced `H -> Z` and Morse links. Automatic
  GAP discovery runs as an external or controlled desktop job; manual import is
  the advanced fallback.
- **Viewer** is the main 3D scene. Press `U` to hide or restore the side rails.
- **Inspector** always answers what is selected, why it exists, and which parts
  are exact data or drawings.
- **Caveats drawer** groups active limitations without occupying the scene.
- **Research tools** show evidence, backend status, render statistics, and
  detailed wall witnesses.
- **Export + notebook** writes the source cover, compression map, wall system,
  coorientation, lawful-cell result, link diagnostics, and view state.

## Reading Controls

Importing a cover or changing a wall sign changes the combinatorial object or
its coorientation. Labels, opacity, wall-arc visibility, camera, and clipping
change only the drawing. The inspector states this distinction for the current
selection.
