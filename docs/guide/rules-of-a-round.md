# The rules of playing a round (a summary)

One page that gathers the rules of a round, for a person who works on it. Each rule says where it lives; the long reasons are in the files named in `CLAUDE.md` (`board-layout.md`, `pieces-and-play.md`, `rounds-and-plays.md`, `board-and-pieces.md`).

## The round

1. **A round is one game of a jigsaw by one user** (`PlaySpec`, `functions/src/jigsaw/plays.ts`). A ready jigsaw is cut when it is made; a picture is cut in the round, by the player's choice of the number of pieces, the difficulty and the clock (the round's own value if it has one, else the jigsaw's).
2. **A user does not play the same jigsaw twice:** once their round is solved they cannot start another one of it (others can); a solved round has no Reset.
3. **Another player's round is only looked at** (`viewOnly`): no moving, picking, collecting or settings; a button starts the person's own round.
4. **The clock** counts only in a timed jigsaw, in the player's own round, while it is open on the screen and not solved; it only grows. **Reset round** keeps the same round, scatters the pieces anew and sets the time to zero (only its player).
5. **A round started with a login is locked to that account** (the padlock): only a login of the account can use it.
6. **Everything saves by itself:** the pieces a moment (0.8 s) after the last move, the account form likewise; a save replaces the whole document, so nothing stale is left.

## The three areas and the rules of the board (they cannot be negotiated)

The **yellow** working area (where the pieces are drawn), the **blue** board (the picture area) and the **pink** scroller (the store frame).

1. **Free in yellow:** a piece moves freely inside the yellow area and settles anywhere; only the edges of the yellow area limit it (not the blue area, the scroller or the gaps). A small margin lies round the yellow area, and the picture has a margin of 8 px at its top and left, which a piece may enter.
2. **Snap only in blue, only to the grid:** a piece (or a group) clicks to its own place or exactly beside a neighbour only when its middle is inside the picture area; outside it nothing clicks.
3. **Pink only when whole inside:** a piece belongs to the scroller only when the whole of it is inside what the scroller shows; partly inside, it is a free piece lying over it. (Along the way the scroller scrolls, only the store's own length counts, so a piece may hang over the visible edge there. Gathering the scroller by a click, and the Edges only switch, take the pieces whose middle is in it, so the pieces the first scatter left over the edge of a slice are gathered too.)
4. **Yellow above its surroundings:** the working area is over the bars, and every menu, popup, panel and dialog is over it (z-index bands, rule 13 in `CLAUDE.md`).
5. **Order of a view:** first find the yellow area, then place the blue board in it, and last the pink scroller.
6. **The yellow area never goes below the footer**, and is always as high as is left down to it; it is measured again whenever the screen or the footer (the app's menu stuck to the bottom) changes.
7. **The scroller:** beside the picture it is at most 2.5 pieces wide and lies against the right edge (the gap that opens is free space for pieces); below the picture it is only 2 pieces high, against the bottom edge.

## The pieces

- **Moving:** a held piece follows the pointer freely and is drawn on top (nothing is saved or snapped while it moves); the middle of a piece is placed in steps of half a pixel; a held piece stays inside the yellow area.
- **Snapping:** only when a piece is dropped, within the snap range of the difficulty (a share of the size of a piece). The whole group moves by the smallest step to its own place or to an exact fit with a neighbour; and when what it clicked to is, as a whole, within range of its own places, it clicks to the grid too.
- **Groups:** pieces that lie exactly right in relation to each other stick together and move together. A piece, or a group, on its own place is **fixed** (it cannot be moved, it lies on the bottom layer); free pieces are above it. Only the piece that was dropped blinks (and the device vibrates) when something clicked.
- **Nothing is lost:** a piece that is in no place a person can see and reach (after a resize or a change of the store) is brought back into the scroller; the layers keep every free piece above the fixed ones.
- **The scroller:** the pieces in it are shown in slices one under the other (beside the picture) or in bands side by side (below it); pressing its empty part gathers the pieces of it from the start of it; the switch **Edges only** (only corner and edge pieces) hides the inside pieces and works the scroller out again, so the shown pieces are gathered from its start, and again when it is switched off.
- **The switches of the puzzle menu:** *Whole picture* (a frame over the page with the whole picture, moved and sized by the person, 1/10 to 1/2 of the picture), *Round* (a panel over the puzzle, begins closed), *Edges only* and *Look* (a panel: the table and sound of this round). *Cheat* (the numbers of the places, and the dotted lines of the three areas) is a switch in the Details.

- **Looks and sound** (never a rule of where a piece goes): loose pieces have a shadow and a lone one is turned a little; the player chooses the table (plain, the app's own look, felt, wood, linen, a season or a mood) and whether a click into place is heard, as a preference of the account, or for one round only (stored on the round); see `pieces-and-play.md`.

## The page round the board

- **Layers:** page 0–99, bars 100–199, **the play 200–899**, overlays 900 and up (`--app-z-*`).
- **The page:** the puzzle page does not scroll, it is as big as the screen; there is no bar of its own, only the app's menu (floating, or stuck to an edge as a bar the page makes room for), whose logo is the way home. On a screen under 1200 px a click outside the panels closes them. The clock is in the Details, and in the note that comes up in the middle of the picture when the round is finished and fades away.
- **Gaps:** every other page has the same gap round it (`--app-page-gap`, `.page-margin`).
- **Not here any more:** the line, colour and background of a round (they are for the account settings, see `TODO.md`).

- **A completed round has no helper.** When every piece is in its place (`JigsawHelper.solved`, set by the round) the switches **Whole picture** and **Edges only** are not in the menu, the helper picture frame goes away (`JigsawBoard.helperShown`) and every piece is shown (`hiddenIds` ignores Edges only). Reset round starts the helper again.
- **An empty picture area** (no piece with its middle on it) shows the faint words **Add pieces here** in its middle (`.picture-watermark`); they take no presses, and are not shown when a round is only looked at.
