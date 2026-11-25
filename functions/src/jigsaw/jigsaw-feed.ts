import express from "express";
import { FeedItemData, FeedItems } from "../models";

// The tiles of the home page that are not pictures: information, offers and packages. `GET /jigsaw-feed` gives the ones to show now, in the form the page needs (`FeedItemData`). The pictures are not
// here: they come from the search. What is kept is checked by `FeedItems` (one rule), and a document that is not right is left out, not an error.

/** Where the tiles are kept. */
export interface FeedStore {
  /** every tile that is kept, as the documents are */
  list(): Promise<Record<string, unknown>[]>;
}

/**
 * Tiles made up to show how the home page may look (a piece of information, an offer, a package, one more piece of information). They are the store until the tiles are kept in Firestore
 * (`JIGSAW_FEED`) and a publisher or an admin can write them (`TODO.md`, "The home page: tiles").
 */
export function dummyFeedStore(): FeedStore {
  const items: Record<string, unknown>[] = [
    { id: "welcome", kind: "info", title: "Welcome to Karins jigsaw", priority: 2, text: "Press a picture to start a round. Drag the pieces to where they belong: pieces that fit click together, and everything is saved by itself." },
    { id: "summer-holidays", kind: "package", title: "Summer holidays", text: "A package is a collection of pictures that belong together. This one will be twelve pictures of sun, sea and sand.", jigsawIds: [] },
    { id: "autumn-pack", kind: "offer", title: "Autumn colours", label: "-20 %", text: "Ten pictures of forests and fields in autumn, for less. (An offer made up to show how an offer looks.)", link: "https://karins-jigsaw.web.app" },
    { id: "tip-menu", kind: "info", title: "A tip", text: "The menu floats over the page. Drag it where it is out of the way, or press the little arrow to put it in the corner." },
  ];
  return { list: async () => items };
}

/** The route of the tiles: only a GET, open to every visitor (the tiles are for everybody; who they are for may come later). */
export function jigsawFeedRouter(store: FeedStore, now: () => number): express.Router {
  const router = express.Router();
  router.get("/", async (_req, res) => {
    try {
      const shown = FeedItems.shown(await store.list(), now());
      res.json({ items: shown.map((item) => FeedItems.dataOf(item)) satisfies FeedItemData[] });
    } catch (err) {
      console.error("Could not read the tiles of the home page", err);
      res.status(503).json({ error: "Try again." });
    }
  });
  return router;
}
