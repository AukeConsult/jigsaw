import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { JigsawUserSpec } from '../../models/shared/jigsaw-user';
import { USER_LEVELS, UserLevel, UserLevels } from '../../models/shared/user-level';
import { AccountAvatar } from '../account-avatar/account-avatar';
import { JigsawUserService } from '../jigsaw-user.service';

/** The levels of the accounts (`/jigsaw/admin`, for an admin): each account with its level, changed at once. A level counts only for an account that needs a login, and the page says so for one that does not. */
@Component({
  selector: 'app-jigsaw-admin',
  imports: [FormsModule, TranslocoDirective, AccountAvatar],
  providers: [provideTranslocoScope('userLevels')],
  templateUrl: './jigsaw-admin.html',
})
export class JigsawAdmin implements OnInit {
  protected readonly users = inject(JigsawUserService);
  private readonly router = inject(Router);
  protected readonly levels = USER_LEVELS;
  protected readonly accounts = signal<JigsawUserSpec[] | null>(null);
  protected readonly error = signal('');
  /** the account whose level is being saved */
  protected readonly saving = signal<string | null>(null);
  /** the account being edited (name and alias in the row), and what is typed */
  protected readonly editing = signal<string | null>(null);
  protected readonly nameText = signal('');
  protected readonly aliasText = signal('');
  /** the account that is asked "delete for good?" */
  protected readonly confirming = signal<string | null>(null);
  /** counted up when a change is refused: the selects are drawn again, so the one that was pressed goes back to what is saved */
  protected readonly rev = signal(0);

  async ngOnInit(): Promise<void> {
    try {
      this.accounts.set(await this.users.list());
    } catch {
      this.error.set(tr('userLevels.couldNotRead', 'Could not read the accounts.'));
    }
  }

  protected levelOf(account: JigsawUserSpec): UserLevel {
    return UserLevels.stored(account);
  }

  /** Goes into the account: the app is that account until the admin goes back, and the page of the account opens. */
  protected async open(account: JigsawUserSpec): Promise<void> {
    this.error.set('');
    const why = await this.users.openAs(account.id);
    if (why) this.error.set(why);
    else await this.router.navigate(['/jigsaw/user']);
  }

  protected startEdit(account: JigsawUserSpec): void {
    this.confirming.set(null);
    this.nameText.set(account.name);
    this.aliasText.set(account.username);
    this.editing.set(account.id);
  }

  protected async saveEdit(account: JigsawUserSpec): Promise<void> {
    if (this.saving()) return;
    this.saving.set(account.id);
    this.error.set('');
    const result = await this.users.changeAccount(account.id, { name: this.nameText(), username: this.aliasText() });
    if ('error' in result) this.error.set(result.error);
    else {
      this.accounts.update((all) => (all ?? []).map((a) => (a.id === account.id ? result.user : a)));
      this.editing.set(null);
    }
    this.saving.set(null);
  }

  protected async remove(account: JigsawUserSpec): Promise<void> {
    if (this.saving()) return;
    this.saving.set(account.id);
    this.error.set('');
    try {
      await this.users.remove(account.id);
      this.accounts.update((all) => (all ?? []).filter((a) => a.id !== account.id));
      this.confirming.set(null);
    } catch (err) {
      this.error.set((err instanceof HttpErrorResponse ? (err.error as { error?: string } | null)?.error : undefined) ?? tr('userLevels.couldNotSave', 'Could not save the level: try again.'));
      this.confirming.set(null);
    }
    this.saving.set(null);
  }

  protected async choose(account: JigsawUserSpec, level: UserLevel): Promise<void> {
    if (level === this.levelOf(account) || this.saving()) return;
    this.saving.set(account.id);
    this.error.set('');
    const result = await this.users.setLevel(account.id, level);
    if ('error' in result) {
      this.error.set(result.error);
      this.rev.update((n) => n + 1);
    }
    else this.accounts.update((all) => (all ?? []).map((a) => (a.id === account.id ? result.user : a)));
    this.saving.set(null);
  }
}
