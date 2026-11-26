import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserLogon } from '../models/shared/logon';

/** The logins of a jigsaw user, through the API (the token of the account that is signed in goes with every call, see `authTokenInterceptor`). */
@Injectable({ providedIn: 'root' })
export class LogonsService {
  private readonly http = inject(HttpClient);

  private base(userId: string): string {
    return `${environment.jigsawApi}/jigsaw-users/${encodeURIComponent(userId)}/logons`;
  }

  /** the logins verified for the user, each as `{ref, label, you}`, and how many there can be */
  list(userId: string): Promise<{ items: UserLogon[]; max: number }> {
    return firstValueFrom(this.http.get<{ items: UserLogon[]; max: number }>(this.base(userId)));
  }

  /** verifies the account that is signed in for the user (a user that has no login yet) */
  link(userId: string): Promise<unknown> {
    return firstValueFrom(this.http.put(this.base(userId), {}));
  }

  /** a link code, to verify a second login for the user (the person signs in with the other login and types it) */
  makeCode(userId: string): Promise<{ code: string; expiresAt: number }> {
    return firstValueFrom(this.http.post<{ code: string; expiresAt: number }>(`${this.base(userId)}/codes`, {}));
  }

  /** verifies the account that is signed in for the user, with a code that a login of the user made */
  redeem(userId: string, code: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base(userId)}/redeem`, { code }));
  }

  /** takes one login away (by the `ref` the list gave) */
  remove(userId: string, ref: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.base(userId)}/${encodeURIComponent(ref)}`));
  }
}
