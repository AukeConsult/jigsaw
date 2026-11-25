import { Injectable, computed, inject, signal } from '@angular/core';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { AuthService } from '../../app/logons/auth.service';

/**
 * What is true of the app right now, as plain facts (the app never uses routing, so the address is not one of them): what the parts that change with the situation (the helper, for one) look at to decide what to show. A new fact
 * is a new field here and a line in `PlayCircumstances.now`; nothing that reads the circumstances has to change.
 */
export interface Circumstances {
  /** somebody plays (an account of the jigsaw is chosen): a user is logged on, in the words of the helpers */
  readonly playing: boolean;
  /** a Firebase login is signed in (true), none is (false), or the app has not yet found out whether the earlier one is still there (null); an account can play with or without one */
  readonly loggedOn: boolean | null;
  /**
   * the app has found out who is logged on and which account plays, from what an earlier visit left (a refresh of the page, a visit another day): false only for the moment while it does, so nothing is
   * shown that the answer would change (a logged-on person must not first see the way to sign in)
   */
  readonly known: boolean;
}

/** The circumstances of the app, read from where each fact lives and kept up to date: `now()` is a new object each time one of them changes (rule 2 of `CLAUDE.md`). */
@Injectable({ providedIn: 'root' })
export class PlayCircumstances {
  private readonly users = inject(JigsawUserService);
  private readonly auth = inject(AuthService);

  /** Firebase has said whether an earlier logon is there: before that, nobody can say that nobody is logged on */
  private readonly authKnown = signal(false);
  /** the account that played last is read (or there was none) */
  private readonly accountKnown = signal(false);

  readonly now = computed<Circumstances>(() => ({
    playing: !!this.users.acting(),
    loggedOn: this.authKnown() ? !!this.auth.user() : null,
    known: this.authKnown() && this.accountKnown(),
  }));

  /**
   * Finds out who is logged on and which account plays, from what an earlier visit left (a refresh of the page, a visit another day): Firebase restores the earlier login, and the account that played last is read
   * (it needs the login first, for an account that is locked). **It is called by the main page when it is shown (`PlayMain.ngOnInit`), at the top level**, and until it is done `known` is false. A login that comes later
   * than that (Firebase can be slow) still changes the circumstances when it comes.
   */
  async check(): Promise<void> {
    await this.auth.ready;
    this.authKnown.set(true);
    try {
      await this.users.load();
    } finally {
      this.accountKnown.set(true);
    }
  }
}
