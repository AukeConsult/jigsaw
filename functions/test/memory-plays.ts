import type { Levels } from "../src/jigsaw/user-levels";
import type { UserStore } from "../src/jigsaw/jigsaw-users";
import { etagOf } from "../src/jigsaw/jigsaw-image";
import type { ImageStore, Picture } from "../src/jigsaw/jigsaw-image";
import type { PlayRecord, PlayStore } from "../src/jigsaw/plays";
import type { JigsawStore } from "../src/common/jigsaw-list";
import type { PieceStore } from "../src/jigsaw/jigsaw-pieces";
import { JigsawPiece, JigsawSpec, JigsawUserSpec, JigsawUsers, PlaySpec, Plays } from "../src/models";

/** the plays in memory: what the subcollection of a jigsaw is in the app */
export function memoryPlays(): PlayStore & { all: Map<string, Map<string, PlayRecord>> } {
  const all = new Map<string, Map<string, PlayRecord>>();
  const of = (id: string) => all.get(id) ?? all.set(id, new Map()).get(id)!;
  const roundPieces = new Map<string, JigsawPiece[]>(); // the pieces under a round that has a cut of its own, by `<jigsaw id>/<play id>`
  let n = 0;
  return {
    all,
    async create(jigsawId, play, positions, pieces) {
      const saved = { id: `play${++n}`, ...Plays.stored(play) } as PlaySpec;
      of(jigsawId).set(saved.id, { play: saved, positions });
      if (pieces) roundPieces.set(`${jigsawId}/${saved.id}`, pieces);
      return saved;
    },
    async roundPieces(jigsawId, playId) {
      return roundPieces.get(`${jigsawId}/${playId}`) ?? [];
    },
    async list(jigsawId, userId) {
      return [...of(jigsawId).values()].map((r) => r.play).filter((p) => !userId || p.userId === userId).sort((a, b) => b.startedAt - a.startedAt);
    },
    async listOfUser(userId) {
      return [...all.entries()].flatMap(([jigsawId, rounds]) => [...rounds.values()].filter((r) => r.play.userId === userId).map((r) => ({ jigsawId, play: r.play })));
    },
    async get(jigsawId, playId) {
      return of(jigsawId).get(playId) ?? null;
    },
    async update(jigsawId, playId, change) {
      const cur = of(jigsawId).get(playId);
      if (!cur) return null;
      const next = change(cur);
      of(jigsawId).set(playId, { play: { ...next.play, id: playId }, positions: next.positions });
      return of(jigsawId).get(playId)!;
    },
    async remove(jigsawId, playId) {
      return of(jigsawId).delete(playId);
    },
    async has(jigsawId) {
      return [...of(jigsawId).values()].some((r) => !r.play.fresh);
    },
    async count(jigsawId) {
      return [...of(jigsawId).values()].filter((r) => !r.play.fresh).length;
    },
    async removeFresh(jigsawId) {
      for (const [id, r] of of(jigsawId)) if (r.play.fresh) of(jigsawId).delete(id);
    },
    async removeAll(jigsawId) {
      all.delete(jigsawId);
    },
  };
}

/** the users in memory: what the collection `jigsaw-users` is in the app (`names` are users that exist from the start, with the same UID and user name) */
export function memoryUsers(...names: string[]): UserStore {
  const users = new Map<string, JigsawUserSpec>(names.map((n) => [n, { id: n, username: n, name: n[0].toUpperCase() + n.slice(1), language: "en", createdAt: 1 }]));
  let n = 0;
  return {
    async list() {
      return [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    async get(id) {
      return users.get(id) ?? null;
    },
    async findByUsername(username) {
      return [...users.values()].find((u) => u.username === username) ?? null;
    },
    async create(user) {
      if ([...users.values()].some((u) => u.username === user.username)) return null;
      const made = { id: `uid${++n}`, ...user };
      users.set(made.id, made);
      return made;
    },
    async linkedTo(uid) {
      return [...users.values()].filter((u) => u.firebaseUids?.includes(uid)).sort((a, b) => a.name.localeCompare(b.name));
    },
    async remove(id) {
      return users.delete(id);
    },
    async changeLogons(id, change) {
      const user = users.get(id);
      if (!user) return null;
      const now = JigsawUsers.logonsOf(user);
      const next = change(now);
      if (!Array.isArray(next)) return next;
      const { firebaseUids: _was, level: _level, ...rest } = user;
      users.set(id, next.length ? { ...rest, ...(user.level ? { level: user.level } : {}), firebaseUids: next } : rest); // open again: no level, as in the database
      return next;
    },
    async update(id, change) {
      const user = users.get(id);
      if (!user) return null;
      if (change.username !== undefined && [...users.values()].some((u) => u.id !== id && u.username === change.username)) return "taken";
      const rest = user;
      users.set(id, { ...rest, ...(change.name !== undefined ? { name: change.name } : {}), ...(change.username !== undefined ? { username: change.username } : {}), ...(change.language !== undefined ? { language: change.language } : {}), ...(change.search !== undefined ? { search: change.search } : {}), ...(change.listFilter !== undefined ? { listFilter: change.listFilter } : {}), ...(change.lastUsedAt !== undefined ? { lastUsedAt: change.lastUsedAt } : {}), ...(change.level !== undefined ? { level: change.level } : {}) });
      if (change.level === "user") {
        const { level: _was, ...bare } = users.get(id)!; // `user` is what none says, as in the database
        users.set(id, bare);
      }
      if (change.pictureAt !== undefined) {
        const { pictureAt: _was, ...bare } = users.get(id)!;
        users.set(id, change.pictureAt ? { ...bare, pictureAt: change.pictureAt } : bare);
      }
      return users.get(id)!;
    },
  };
}

/** the pictures in memory: what the files in Storage are in the app (the pictures of the accounts, in the tests) */
export function memoryImages(): ImageStore & { files: Map<string, Picture> } {
  const files = new Map<string, Picture>();
  return {
    files,
    async put(id, data, mime) {
      files.set(id, { data, mime, etag: etagOf(data) });
    },
    async get(id) {
      return files.get(id) ?? null;
    },
    async remove(id) {
      files.delete(id);
    },
  };
}

/** the secret of the keys of the pictures, in a test: the app asks Firestore for it when it is not given one */
export const TEST_KEY_SECRET = async (): Promise<string> => "test-secret-test-secret-test-secret-1";

/** the jigsaws in memory: what the collection `jigsaw` is in the app (ids are long enough for the routes of pictures and pieces) */
export function memoryJigsaws(): JigsawStore {
  const items: JigsawSpec[] = [];
  return {
    async list() {
      return [...items].reverse();
    },
    async add(input) {
      const saved = { id: `jigsaw-${items.length + 1}`, ...input, createdAt: items.length + 1 };
      items.push(saved);
      return saved;
    },
    async remove(id) {
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return false;
      items.splice(i, 1);
      return true;
    },
    async update(id, input) {
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return null;
      items[i] = { ...input, id, createdAt: items[i].createdAt };
      return items[i];
    },
  };
}


/** the pieces of the jigsaws in memory, with how many times they were read (a normal round reads them once) */
export function memoryPieces(): PieceStore & { docs: Map<string, JigsawPiece[]>; reads: () => number } {
  const docs = new Map<string, JigsawPiece[]>();
  let reads = 0;
  return {
    docs,
    reads: () => reads,
    async list(id) {
      reads++;
      return [...(docs.get(id) ?? [])].sort((a, b) => a.number - b.number);
    },
    async replaceAll(id, pieces) {
      docs.set(id, pieces);
      return true;
    },
    async move() {
      return true;
    },
    async graphic() {
      return null;
    },
    async removeAll(id) {
      docs.delete(id);
    },
  };
}

/** every account is a publisher, so a test can make a public jigsaw as anybody (the accounts of the tests have no login, so a level kept on them would not count: see `UserLevels.of`) */
export const PUBLISHER: Levels = { of: async () => "publisher", forget() {} };
