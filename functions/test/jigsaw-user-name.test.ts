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
