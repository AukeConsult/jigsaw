# The model

All of it lives in `functions/src/models/shared/`, the ONE place to edit shared code. `scripts/sync-models.mjs` copies it to `frontend/src/app/models/shared/` (generated, gitignored). Shared files may only import from each other.

| file | what is in it |
|---|---|
| `canvas-object.ts` | an object's settings; `CanvasBaseObject` → `CanvasFigure` → `CanvasArrow` |
| `geometry.ts` | `Point`, `Box`, resize handles, `resizedBox`, and `SmoothCurve` |
| `placed.ts` | an object placed on a canvas: `PlacedBase` → `PlacedFigure`, `PlacedArrow` |
| `diagram.ts` | `CanvasDiagram`: what placed objects do together |
| `canvas.ts` | `CanvasSpec` (a saved jigsaw document) and `CanvasArea` (checks one) |

## Principles
1. **Classes work on their own object.** A rule lives on the class that owns the data: what every object has on `CanvasBaseObject`, what a figure adds on `CanvasFigure`, what an arrow adds on `CanvasArrow` (an arrow *is a* figure, a figure *is a* base object). Children override small hooks rather than branch on kind.
2. **Model objects never change.** A move, resize or bend returns a new object (or diagram; the same one when nothing changed). Components keep plain data in a signal and build the classes when needed (`CanvasDiagram.from(...)`).
3. **What is stored is decided by the model:** `X.stored()` lists the saved fields, `X.fromStored()` reads documents an older version saved and fills what they lack.
4. **One validation:** `error()` on the classes is used by the forms, the page and the API.

## Canvas objects (`canvas-object.ts`)
Fields: `kind` (`figure` or `connector`), `name`, `shape` (square, circle, triangle, histogram; `line` for arrows), `width`, `height`, `borderWidth`, `borderColor`, `backgroundColor`, `frontColor`, `fontSize`, `cornerRadius`, and for connectors `arrow` (`one-way` or `both-ways`) and `arrowStyle` (`solid` or `hollow`).
- `connectionPoints()`: figure 8 (triangle 6), on the border (on the curve when a corner is rounded); arrow `start` and `end` with roles start, end or start-end.
- `scaledSettings()`: figures scale by one factor (shape kept), arrows scale thickness/height. `minScale`: nothing is made smaller than 4 px.

## Placed objects (`placed.ts`)
Stored as `PlacedObject`: `id`, `object` (the copy), `centerX`, `centerY`, `layer`, and for arrows `connections` (`start`/`end` → `{objectId, pointId}`), `length`, `angle` (radians, clockwise), `bend`, `bendStart`, `bendEnd`.
- `PlacedFigure`: `box()`, resize handles, `resized()`, `scaledAbout()`.
- `PlacedArrow`: `ends()`, `withEnds/withEnd`, `following(figure)`, `settledOn`, `releasedFrom`, width handles (`acrossHandle/acrossAt/withAcross`), and the curve.

### The curve
Three bends are pixels from the straight line, to the side (positive = side of the first width handle), at ¼, ½ and ¾ of the way: `bendStart`, `bend` (middle), `bendEnd`. `SmoothCurve` goes through the ends and those three points (`curve()`, `shapePoints()`). When `bendStart` and `bendEnd` are not stored they are ¾ of `bend` (the shape a single bend always had), so older documents look the same. `withBends({start?, middle?, end?})` changes some; changing a side point pins the other side at its current value; all three at 3 px or less removes the fields (straight). Values are rounded to half pixels, limited to ±20000, scale with a group resize, and the whole curve has to fit in the canvas.

## Diagram (`diagram.ts`)
`CanvasDiagram` holds the placed objects of one canvas. Constants: `CANVAS_MAX_PLACED` 200, `SNAP_DISTANCE_PX` 24, `HANDLE_RADIUS_PX` 12.
- Place and remove: `place`, `remove`, `removeAll` (frees the arrows of removed figures).
- Move: `moveFigure` (arrows follow), `moveArrow`, `moveArrowEnd` (snaps to a figure point within 24 px, else the grid).
- Resize: `resizeFigure`, `resizeGroup`, `resizeArrowAcross`, `bendArrow(id, bend, which)`.
- Select: `boundsOf`, `itemsIn`, `grabbedEnd`. Layers: `lastLayer`, `layers`, `setLayer`. Check: `CanvasDiagram.validate`.

## Jigsaw pieces
A piece of a jigsaw is `JigsawPiece` (`jigsaw.ts`): `id`, `number`, `col`, `row`, the four edges, `size`, `centerX`, `centerY`, `layer` and `matched`. `JigsawPieces` makes one from a placed piece and back (`of`, `toPlaced`), says whether it is matched (`matched`: within half a pixel of the centre of its cell of the picture) and checks one (`error`, `moveError`). The server sets `matched` itself whenever a piece is stored or moved.

## Saving
A saved canvas document has `name`, `width`, `height`, `gridSize`, `gridVisible`, `placed`, `createdAt`. A save **replaces the whole document** (only `createdAt` is kept), so nothing removed is left in the database. A new canvas has a 50 px grid. Older documents are read through `fromStored` (grid 5 px, as they had, and shown, centre from `x`/`y`, layer 10, kind `figure`).
