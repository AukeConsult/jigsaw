import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** The packages an account has got or bought (`/jigsaw-users/:id/bought-packages`). Only the account itself asks. Nothing is charged: payment is not built. */
@Injectable({ providedIn: 'root' })
export class BoughtService {
  private readonly http = inject(HttpClient);

  private base(userId: string): string {
    return `${environment.jigsawApi}/jigsaw-users/${encodeURIComponent(userId)}/bought-packages`;
  }

  /** the ids of the packages the account has */
  async ids(userId: string): Promise<ReadonlySet<string>> {
    return new Set((await firstValueFrom(this.http.get<{ packageIds: string[] }>(this.base(userId)))).packageIds);
  }

  /** gets (a free one) or buys the package */
  async get(userId: string, packageId: string): Promise<void> {
    await firstValueFrom(this.http.put(`${this.base(userId)}/${encodeURIComponent(packageId)}`, {}));
  }
}
