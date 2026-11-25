import { Injectable, signal } from '@angular/core';

/**
 * Which step of the account views is open. In the website the sign-in is a page of its own that the user page sends the person to (and back from, when it is done); here the sign-in form
 * (`logon-view`) takes the place of the accounts (`account-view`, `edit-view`, `verify-view`) while `logonOpen` is true, and gives it back when the person is signed in or goes back.
 */
@Injectable({ providedIn: 'root' })
export class AccountState {
  /** the sign-in form is shown, and the accounts are not */
  readonly logonOpen = signal(false);

  openLogon(): void {
    this.logonOpen.set(true);
  }

  closeLogon(): void {
    this.logonOpen.set(false);
  }
}
