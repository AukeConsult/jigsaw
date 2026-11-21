# The model

All of it lives in `functions/src/models/shared/`, the ONE place to edit shared code. `scripts/sync-models.mjs` copies it to `frontend/src/app/models/shared/` (generated, gitignored). Shared files may only import from each other.

| file | what is in it |
|---|---|
| `jigsaw-settings.ts` | `JigsawSpec` (a saved jigsaw as a document) and `JigsawSettings` (checks one) |
| `jigsaw.ts` | `JigsawCut` (the cut into pieces), `JigsawPieces`, `pieceGrid`, limits |
| `play.ts` | `Plays`, `PlaySpec`: a round, its positions, the settings of the player, the time played |
| `jigsaw-user.ts` | `JigsawUsers`: the users who play |
| `base-object.ts` | `BaseObject`: the settings of a placed object (name and size) |
| `geometry.ts` | `Point`, `Box`, and `PictureCrop` (the part of a picture a frame shows) |
| `placed.ts` | `PlacedFigure`: an object (a piece) placed on the picture area |
| `puzzle.ts` | `Puzzle`: what the placed pieces do together (snap, layers, groups, collecting) |

## Principles
1. **Classes work on their own object.** A rule lives on the class that owns the data: what every object has on `BaseObject`, where it is on `PlacedFigure`, what the pieces do together on `Puzzle`.
2. **Model objects never change.** A move returns a new object (or puzzle; the same one when nothing changed). Components keep plain data in a signal and build the classes when needed (`Puzzle.from(...)`).
3. **What is stored is decided by the model:** `X.stored()` lists the saved fields, `X.fromStored()` reads documents an older version saved and fills what they lack.
4. **One validation:** `error()` on the classes is used by the forms, the page and the API.

## Objects (`base-object.ts`)
Fields: `name`, `width`, `height` (the pieces are squares of grid × grid pixels). `BaseObject.of(data).error()` checks them; `DEFAULT_OBJECT` is what a new one starts as.

## Placed objects (`placed.ts`)
Stored as `PlacedObject`: `id`, `object` (the copy), `centerX`, `centerY`, `layer` and, for a jigsaw piece, `piece` (`col`, `row` and the four edges).
- `PlacedFigure`: `box()`, `bounds()`, `fits()`, `at()`, `withLayer()` and `home()` (the centre of the piece's cell of the picture: where it belongs).
- The picture area itself is layer 0 (`PICTURE_LAYER`); placed objects are on layers 1 to 1000 (`MAX_LAYER`), a higher layer is in front.

## Puzzle (`puzzle.ts`)
`Puzzle` holds the placed objects of one jigsaw. Constants: `JIGSAW_MAX_PLACED` 500, `PIECE_STEP_DIVISOR` 50, `STICK_TOLERANCE_PX`, `COLLECT_*`.
- Move: `moveFigure` (to a step finer than the grid), `moveGroup` (all picked pieces together).
- Pieces that stick: `stuckGroup`, `dropPieces` (where pieces click into place and stick together), `collectPieces`.
- Layers: `setLayer`, `bringToFront`. Pick: `itemsIn`. Check: `Puzzle.validate`.

## Jigsaw pieces
A piece of a jigsaw is `JigsawPiece` (`jigsaw.ts`): `id`, `number`, `col`, `row`, the four edges, `size`, `centerX`, `centerY`, `layer` and `matched`. `JigsawPieces` makes one from a placed piece and back (`of`, `toPlaced`), says whether it is matched (`matched`: within half a pixel of the centre of its cell of the picture) and checks one (`error`, `moveError`). The server sets `matched` itself whenever a piece is stored or moved.

## Saving
A saved jigsaw document has `name`, `width`, `height`, `gridSize`, `gridVisible`, `placed` (what is not a piece), `createdAt` and the other settings of `JigsawSpec`. A save **replaces the whole document** (only `createdAt` is kept), so nothing removed is left in the database. A new jigsaw has a 50 px grid. Older documents are read through `fromStored` (grid 5 px, as they had, and shown, centre from `x`/`y`, layer 10).
