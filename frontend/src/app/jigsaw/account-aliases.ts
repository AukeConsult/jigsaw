import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { JigsawUserService } from './jigsaw-user.service';

/**
 * **The alias and the name of an account by its id**, for saying who a picture or a package is from (a jigsaw keeps the owner's id and name, a package the id only, and several accounts can have the same name). The accounts are read once, and again when who plays, or their
 * alias, changes. An account that is not known (yet, or any more) has none.
 */
@Injectable({ providedIn: 'root' })
export class AccountAliases {
  private readonly users = inject(JigsawUserService);
  private readonly byId = signal<ReadonlyMap<string, { username: string; name: string }>>(new Map());

  constructor() {
    const me = computed(() => `${this.users.user()?.id ?? ''}/${this.users.user()?.username ?? ''}`);
    effect(() => {
      me();
      untracked(() => void this.read());
    });
  }

  /** the alias of the account, or '' */
  of(id: string | undefined): string {
    return (id && this.byId().get(id)?.username) || '';
  }

  /** the name of the account, or '' */
  nameOf(id: string | undefined): string {
    return (id && this.byId().get(id)?.name) || '';
  }

  private async read(): Promise<void> {
    try {
      this.byId.set(new Map((await this.users.list()).map((account) => [account.id, account])));
    } catch {
      /* what was read before stays */
    }
  }
}
