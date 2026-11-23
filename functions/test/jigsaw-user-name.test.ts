import { describe, expect, it } from 'vitest';
import { JigsawUsers, USERNAME_MAX } from '../src/models/shared/jigsaw-user';

describe('JigsawUsers.usernameFrom', () => {
  it('makes a user name from a name: small letters, no accents, words joined', () => {
    expect(JigsawUsers.usernameFrom('Karin Åse Ødegård', '4821')).toBe('karin-ase-odegard-4821');
  });

  it('always gives a name that is allowed', () => {
    for (const name of ['', '   ', '!!!', 'A', 'Ål', '日本語', 'x'.repeat(100), 'Jo-Ann_Smith']) {
      expect(JigsawUsers.usernameError(JigsawUsers.usernameFrom(name, '123456'))).toBe('');
    }
  });

  it('keeps the digits that tell two people apart, also from a long name', () => {
    const made = JigsawUsers.usernameFrom('x'.repeat(100), '4821');
    expect(made.length).toBeLessThanOrEqual(USERNAME_MAX);
    expect(made.endsWith('-4821')).toBe(true);
  });

  it('works without digits', () => {
    expect(JigsawUsers.usernameFrom('Karin', '')).toBe('karin');
  });
});

describe("JigsawUsers.matches: is what was typed somebody who is already a user", () => {
  const users = [
    { name: "Leif Auke", username: "leif-auke" },
    { name: "Leif Auke 2", username: "leif-auke-5" },
    { name: "Åse Hansen", username: "ase" },
    { name: "Hanna", username: "hanna-1" },
  ];
  const found = (typed: string) => users.filter((u) => JigsawUsers.matches(u, typed)).map((u) => u.username);

  it("finds by the whole name, the whole user name or a whole word of either, in any case", () => {
    expect(found("Leif Auke")).toEqual(["leif-auke"]);
    expect(found("leif")).toEqual(["leif-auke", "leif-auke-5"]);
    expect(found("LEIF-AUKE-5")).toEqual(["leif-auke-5"]);
    expect(found("auke")).toEqual(["leif-auke", "leif-auke-5"]);
  });

  it("ignores accents, and does not find a part of a word", () => {
    expect(found("ase")).toEqual(["ase"]);
    expect(found("Åse")).toEqual(["ase"]);
    expect(found("ann")).toEqual([]); // not Hanna
    expect(found("hann")).toEqual([]);
  });

  it("needs two letters, and finds nobody for nothing", () => {
    expect(found("l")).toEqual([]);
    expect(found("")).toEqual([]);
    expect(found("   ")).toEqual([]);
  });
});
