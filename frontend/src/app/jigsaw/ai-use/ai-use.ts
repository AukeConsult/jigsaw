import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { AiUsageList, AiUsageService } from '../ai-usage.service';
import { JigsawService } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';

/** What the AI has used for the account (`/jigsaw/ai-use`, a page of its own, opened from the user page; for an admin): every call and the sum. For internal use: nothing is billed. */
@Component({
  selector: 'app-ai-use',
  imports: [DatePipe, RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawUser'), provideTranslocoScope('jigsawPackages')],
  templateUrl: './ai-use.html',
})
export class AiUse {
  private readonly users = inject(JigsawUserService);
  private readonly aiUsages = inject(AiUsageService);
  private readonly jigsaws = inject(JigsawService);

  /** the calls and what they add up to (null: not read yet) */
  readonly aiUsage = signal<AiUsageList | null>(null);
  readonly aiFailed = signal(false);
  /** the names of the jigsaws the calls were about */
  private readonly aiNames = signal<Readonly<Record<string, string>>>({});

  constructor() {
    effect(() => {
      const me = this.users.user();
      this.aiUsage.set(null);
      this.aiFailed.set(false);
      if (me) void this.load(me.id);
    });
  }

  protected jigsawName(id: string): string {
    return this.aiNames()[id] ?? id.slice(0, 6);
  }

  private async load(userId: string): Promise<void> {
    try {
      const list = await this.aiUsages.ofUser(userId);
      const ids = [...new Set(list.items.flatMap((u) => (u.jigsawId ? [u.jigsawId] : [])))];
      const named = await Promise.all(ids.map((id) => this.jigsaws.get(id).then((j) => [id, j?.name] as const).catch(() => [id, undefined] as const)));
      if (this.users.user()?.id !== userId) return;
      this.aiNames.set(Object.fromEntries(named.flatMap(([id, name]) => (name ? [[id, name]] : []))));
      this.aiUsage.set(list);
    } catch {
      this.aiFailed.set(true);
      this.aiUsage.set({ items: [], totals: { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, unbilledTokens: 0 } });
    }
  }
}
