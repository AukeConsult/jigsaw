# The board and the pieces: how a round is handled

This describes what happens to a piece from the moment a jigsaw is cut to the moment it is saved, and what keeps it from being lost, outside the view or torn from its neighbours. The code is the truth; the places in it are named so each rule can be found, and its test read.

## 1. Where the pieces come from and where they are kept

- **Cutting** (`JigsawCut.cut`, `functions/src/models/shared/jigsaw.ts`): one piece for each whole cell of the grid, each a square the size of the grid with its four edges (tab 1, blank -1, flat 0). The pieces are scattered in the **store**, a frame beside the picture area.
- **The jigsaw** keeps its pieces as documents of their own (`jigsaw/<id>/pieces/<piece id>`: `col`, `row`, edges, size, place and layer). There is no picture of a piece: the board draws each from the picture of the jigsaw. These are the pieces as the jigsaw was cut.
- **A round** (a play) keeps only where each piece is: one document with `piece id -> [centerX, centerY, layer]` (`PlayPositions`). `Plays.piecesOf` puts the two together when a round is opened. A piece the round has no place for (an older round) is still there, where the jigsaw has it, so a piece cannot go missing through a missing entry.
- **Coordinates are stored pixels** (a place is a whole or a half pixel) and never depend on the screen. The board draws at a scale and turns every pointer position back with `/ scale()` before it reaches the model.

## 2. The areas a piece can be in

All of it is one coordinate area (`JigsawSettings.extent`: the picture area and the store frame). A piece whose centre is at `centerX >= store.left` is **in the store**; any other piece is **free**.

| layout | where it applies | what a piece can do |
|---|---|---|
| store beside the picture | window 1200 px or wider | free on the picture, or in the store frame, which scrolls up and down; a store wider than the frame is shown in slices one under the other (`sliceCount`); the store is made as wide as the frame (the board asks the page to keep that width) |
| store below the picture | window narrower than 1200 px (`stacked`) | free on the picture and the gutter above the store, and in the store strip, which scrolls sideways (the store cut into bands side by side, `bandStride`) |
| free space beside the picture | only with the store below, and room for at least one piece beside the picture (`ZONE_MIN_STEPS`) | free anywhere in that room as well (`zone`); it stands for the stored places under the picture, so nothing new is stored |

The gap between the picture and the store is a tiny `JigsawSettings.storeGap` (an eighth of a grid step).

## 3. Moving

Everything goes through `Puzzle` (`functions/src/models/shared/puzzle.ts`), and **a model object never changes**: a move gives a new puzzle (or the same one when nothing changed).

1. **Picking up** (`JigsawBoard.startMove`): the piece and its whole group (pieces that stick together, `Puzzle.stuckGroup`) are picked, brought to the front (`bringToFront`) and held by the pointer. A piece on its own place, and anything stuck to it, cannot be moved (`isFixed`, `movable`).
2. **Moving** (`moveMove`): the pointer is kept on the board with the middle of the piece half a piece in (`onBoard`), turned into a stored place (`areaPoint`: over the store frame it is the frame's place, scroll and slice or band included; beside the picture, in the free space, its own place; elsewhere on the picture area), and the piece moves in steps 50 times smaller than the grid, without snapping (`moveFigure`; `moveGroup` moves a group by the same amount for every piece).
3. **Dropping** (`endMove` -> `dropPieces`): a group dropped within the snap range (`snapPercent`) of its own place, or of the place where it fits a neighbour, moves by the smallest such step and clicks (it blinks, the device vibrates). Groups that now fit are one group.
4. **Collecting** (`collectPieces`): a click on the empty store packs the pieces in the store at its top, groups as blocks.
5. **Saving**: the board gives the new places to the page (`[(placed)]`); `PieceSync` sends the moved pieces a pause (0.8 s) after the last move, and at once when the page is hidden (`keepalive`; no interceptor sees that request, so it carries the token of the login itself, `AuthService.headersNow`; when it fails and the page is still there, the moves count as not saved and are tried again). The server sets `matched` itself from the places.

## 4. Checks, in the order a piece meets them

**While a piece is held it moves freely on the screen** (`FreeDrag` in `jigsaw-board.ts`): the held piece or group is drawn where the pointer is, above everything (`HELD_LAYER`), whatever lies under it, and nothing in the model is touched or checked at any step (the drawn elements get a `transform`; the whole of what is held is kept on the board). There are no jumps, since the areas (picture, free space, store, which map to the stored places in different ways) are not used while it is held. **When it is let go** (`endMove`) the place its middle is over is turned into a stored place once (`movedTo`, `areaPoint`), the drop step snaps it (`dropPieces`), the checks below run once over all the pieces and the result is kept in `placed` (and saved); the drawn piece stays where the pointer left it until the page has drawn it at its place. A group that lies over a seam when it is let go goes whole to the side the held piece is over. The same checks run when the window, the store or the free space change.

**The checks, on the page** (the `puzzle` computed, `settledPuzzle`, then `apply`/`commit`):

1. `Puzzle.settled()`: fixed pieces go on the bottom layer, free pieces above; a free piece outside the area is pulled back in, **a group whole**, by the same amount for every piece. Layers are 1 to 1000.
2. `Puzzle.confine(...)`: with the store below the picture, a free piece is kept inside what is shown of the area: in the free space beside the picture, or, when there is no room beside it, on the picture and the gutter above the store, never further down. This is worked out for the whole round at each move, so **every piece that lay outside the view is put back in, and saved with that move**. (When the window is made smaller a piece is drawn inside the view at once; it is saved with the next move.)
3. `apply` takes the new puzzle only when it has **the same pieces, each once**: a change that would leave out or add one is dropped.

**On the server** (`PATCH /jigsaw/api/jigsaw/:id/plays/:playId/positions`):

- who may: only the player of the round (`ownRound`, 403);
- the moves are checked (`Plays.movesError`: each a known id with a whole or half pixel place and a layer; nothing without a place);
- `Plays.moved`: only the known pieces move, the others are left out, **no piece is ever removed from the positions**;
- **a bond is never broken** (`Plays.bondsError`): pieces that are neighbours in the picture and lie exactly right to each other cannot be pulled apart (409);
- `matched`, the count and `solved` are worked out from the places.

**Reset round** (`POST .../plays/:playId/restart`, `Plays.restart`): the same round and player, the pieces scattered anew, no time played. This is the only thing that ends a group.

## 5. Why a piece cannot be lost

- Every operation of `Puzzle` returns the same objects with new places; none adds or removes. This is tested over many random sequences of moves, drops, collects, layer changes and settles on several jigsaws (`functions/test/pieces-kept.test.ts`).
- A move of a piece that does not exist changes nothing; a move without a place is refused; the positions are never shortened.
- A piece the round has no place for still has the one the jigsaw gave it.
- The page does not take a change that would drop or add a piece (`apply`).
- A piece is never under a frame (the pieces are drawn in a layer of their own above the picture area and the store), never under a fixed piece (the layers), and never outside the view after a move (`settled`, `confine`, `onBoard`).

## 6. Tests and how to check by hand

- `npm test` (model and server): `jigsaw.test.ts` (cut, drops, steps, fixed, groups, settle, confine), `plays.test.ts` (rounds, moves, bonds, restart), `pieces-kept.test.ts` (nothing lost).
- On the screen, `scripts/board-reach-sweep.js` takes a piece from the store and one from the picture to every side of the board, in a window of each size, and lists jumps, vanished pieces, pieces outside the board and room a piece cannot reach (see "Running and testing" in `CLAUDE.md`).
- Known and not yet fixed: the free space beside a tall picture (store below) is limited to the picture's width, so room beyond that cannot be reached by a piece.
