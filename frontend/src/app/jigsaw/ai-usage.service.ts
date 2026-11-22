import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { TokenUsageSpec } from '../models/shared/token-usage';

/** What the AI has used for a user: every call, the newest first, and what they add up to. */
export interface AiUsageList {
  items: TokenUsageSpec[];
  totals: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; unbilledTokens: number };
}

/** The AI spending of a user, through the API (only the user may read their own: the header says who asks). */
@Injectable({ providedIn: 'root' })
export class AiUsageService {
  private readonly http = inject(HttpClient);

  ofUser(userId: string): Promise<AiUsageList> {
    return firstValueFrom(this.http.get<AiUsageList>(`${environment.jigsawApi}/jigsaw-users/${encodeURIComponent(userId)}/token-usage`, { headers: { 'X-Jigsaw-User': userId } }));
  }
}
