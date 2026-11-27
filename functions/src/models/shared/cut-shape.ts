// The shapes a jigsaw can be cut in: what the tabs between two pieces look like. The pieces are squares on a grid whatever the shape, so where a piece belongs, what sticks to what and which pieces are on the border are the
// same for all of them. A piece carries its shape (`PiecePlace.shape`), so it is drawn the same wherever it is drawn; a piece that says nothing is classic.

export const CUT_SHAPES = ['classic', 'round', 'pointed', 'square', 'wave'] as const;
export type CutShape = (typeof CUT_SHAPES)[number];
export const DEFAULT_CUT_SHAPE: CutShape = 'classic';

/** A point of an edge: how far along it (0 to 1) and how far out of the piece, both in sides of a piece. */
export type EdgePoint = readonly [along: number, out: number];

/** The edge of a tab: straight to `from` along it, then these steps (a straight line to one point, or a curve with its two handles and its end), then straight to its end. */
export interface TabOutline {
  from: number;
  steps: readonly { curve: boolean; points: readonly EdgePoint[] }[];
}

const curve = (...points: EdgePoint[]) => ({ curve: true, points });
const line = (point: EdgePoint) => ({ curve: false, points: [point] });

// every outline is the same seen from either end (so the tab of one piece fills the blank of its neighbour, which goes along the edge the other way), and reaches out at most about a quarter of a side
const OUTLINES: Record<CutShape, TabOutline> = {
  classic: { from: 0.38, steps: [curve([0.38, 0.1], [0.28, 0.12], [0.3, 0.22]), curve([0.32, 0.32], [0.68, 0.32], [0.7, 0.22]), curve([0.72, 0.12], [0.62, 0.1], [0.62, 0])] },
  round: { from: 0.4, steps: [curve([0.46, 0.04], [0.32, 0.06], [0.32, 0.17]), curve([0.32, 0.33], [0.68, 0.33], [0.68, 0.17]), curve([0.68, 0.06], [0.54, 0.04], [0.6, 0])] },
  pointed: { from: 0.34, steps: [line([0.5, 0.24]), line([0.66, 0])] },
  square: { from: 0.37, steps: [line([0.37, 0.2]), line([0.63, 0.2]), line([0.63, 0])] },
  // (the wave starts a way in from the corner: from the very corner, two edges that both go in would cross)
  wave: { from: 0.18, steps: [curve([0.35, 0.24], [0.65, 0.24], [0.82, 0])] },
};

export class CutShapes {
  static is(value: unknown): value is CutShape {
    return (CUT_SHAPES as readonly unknown[]).includes(value);
  }

  /** what is kept of a shape: nothing for classic (what everything that says nothing is) or for what is not a shape */
  static kept(value: unknown): CutShape | undefined {
    return CutShapes.is(value) && value !== DEFAULT_CUT_SHAPE ? value : undefined;
  }

  static of(value: unknown): CutShape {
    return CutShapes.is(value) ? value : DEFAULT_CUT_SHAPE;
  }

  static outline(shape: unknown): TabOutline {
    return OUTLINES[CutShapes.of(shape)];
  }
}
