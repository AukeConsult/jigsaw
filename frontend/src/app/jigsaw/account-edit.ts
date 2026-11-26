import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { JigsawUsers, UserEdit } from '../models/shared/jigsaw-user';
import { pictureFromFile } from './account-picture';
import { JigsawUserService } from './jigsaw-user.service';

/** how long the account form waits after the last change before it saves it */
const EDIT_PAUSE_MS = 800;

/**
 * Editing the account that plays, **the same for the website's page of the user and the app's page of the account**: the form has the alias, the name, a picture and a language, and **saves by itself** a pause after the
 * last change (there is no Save and nothing to press: what is waiting is saved when the form is closed or the page is left, `close`). Nothing is saved while the name is empty, or the alias is not allowed or, when it is a new one, has not been looked up and found free.
 * The page shows the fields and calls this; it provides its own, so it starts new each time the page is opened.
 */
@Injectable()
export class AccountEdit {
  private readonly users = inject(JigsawUserService);

  /** the account that plays is being edited, and what is in the form */
  readonly editing = signal(false);
  readonly name = signal('');
  readonly username = signal('');
  readonly language = signal('');
  /** the picture in the form: undefined is the one the account has, null that it is taken away, a data address a new one that is chosen */
  readonly picture = signal<string | null | undefined>(undefined);
  readonly pictureFailed = signal(false);
  /** whether the alias typed in the form is free ('free'), has another account ('taken') or is not looked at (''): the same, or not yet looked up, or not allowed */
  readonly usernameCheck = signal<'' | 'free' | 'taken'>('');
  readonly error = signal('');
  readonly busy = signal(false);

  /** told after a save that went through (a page that lists the accounts reads them again) */
  onSaved: () => unknown = () => undefined;

  private checkTimer: ReturnType<typeof setTimeout> | undefined;
  private editTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // an account that does not play any more is not edited
    effect(() => {
      if (!this.users.user()) untracked(() => this.editing.set(false));
    });
    // every change in the form is saved a pause after the last one: the pause starts again at each change, and nothing is saved while the form may not be saved
    effect(() => {
      if (!this.editing()) return;
      this.name();
      this.username();
      this.language();
      this.picture();
      this.usernameCheck();
      this.users.user(); // after a save the account is the form again: nothing is left to save
      untracked(() => {
        clearTimeout(this.editTimer);
        if (!Object.keys(this.change()).length || !this.savable()) return;
        this.editTimer = setTimeout(() => void this.save(), EDIT_PAUSE_MS);
      });
    });
  }

  open(): void {
    const me = this.users.user();
    if (!me) return;
    this.name.set(me.name);
    this.username.set(me.username);
    this.language.set(me.language);
    this.picture.set(undefined);
    this.pictureFailed.set(false);
    this.usernameCheck.set('');
    this.error.set('');
    this.editing.set(true);
  }

  /** Close: what is waiting is saved at once (when it may be), and the form is closed. */
  async close(): Promise<void> {
    clearTimeout(this.editTimer);
    if (Object.keys(this.change()).length && this.savable()) await this.save();
    if (!this.error()) this.editing.set(false);
  }

  /** An alias is typed in the form: a moment after the last key it is looked up, so the person sees at once whether it can be had (only the server knows; it also refuses a taken alias when saving). */
  onUsernameTyped(value: string): void {
    this.username.set(value);
    this.usernameCheck.set('');
    clearTimeout(this.checkTimer);
    const me = this.users.user();
    const wanted = JigsawUsers.normalised(value);
    if (!me || wanted === me.username || JigsawUsers.usernameError(wanted)) return;
    this.checkTimer = setTimeout(async () => {
      const found = await this.users.lookup(wanted);
      if (JigsawUsers.normalised(this.username()) === wanted) this.usernameCheck.set(found && found.id !== me.id ? 'taken' : 'free');
    }, 400);
  }

  /** A file is chosen for the picture: it is cut square and shrunk (it is saved by itself a moment later). */
  async onPicture(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again
    if (!file) return;
    this.pictureFailed.set(false);
    try {
      this.picture.set(await pictureFromFile(file));
    } catch {
      this.pictureFailed.set(true);
    }
  }

  /** What the form changes in the account: only what differs from it (nothing: an empty object). */
  private change(): UserEdit {
    const me = this.users.user();
    const change: UserEdit = {};
    if (!me) return change;
    if (this.name().trim() !== me.name) change.name = this.name();
    if (this.username().trim().toLowerCase() !== me.username) change.username = this.username();
    if (this.language() !== me.language) change.language = this.language();
    if (this.picture() !== undefined && (this.picture() !== null || me.pictureAt)) change.picture = this.picture();
    return change;
  }

  /** Whether what is in the form may be saved: it has a name, and an alias that is allowed and, when it is a new one, has been looked up and is free. */
  private savable(): boolean {
    const wanted = JigsawUsers.normalised(this.username());
    if (!this.name().trim() || JigsawUsers.usernameError(wanted)) return false;
    return wanted === this.users.user()?.username || this.usernameCheck() === 'free';
  }

  /** The changes are saved: only what differs from the account is sent. The form stays open. */
  private async save(): Promise<void> {
    const change = this.change();
    if (!Object.keys(change).length) return;
    this.busy.set(true);
    this.error.set('');
    const error = await this.users.update(change);
    this.busy.set(false);
    if (error) this.error.set(error);
    else await this.onSaved();
  }
}
