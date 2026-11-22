import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { readPreference, writePreference } from '../../core/preferences';
import { contributorsOf, madeBy } from '../contributors';
import { JigsawCard } from '../jigsaw-card/jigsaw-card';
import { JigsawRow } from '../jigsaw-row/jigsaw-row';
import { JigsawService } from '../jigsaw.service';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';

/** What the person chose on this page, kept on the device and used when the page is opened again. */
interface ListPreferences {
  /** shown as a list or as cards */
  view: 'list' | 'cards';
  /** the contributor whose jigsaws are shown (null: everybody's) */
  contributor: string | null;
  /** the choice of contributors is open */
  choosing: boolean;
}

const LIST_PREFERENCES_KEY = 'jigsaw.list';
const DEFAULT_PREFERENCES: ListPreferences = { view: 'list', contributor: null, choosing: false };

const isListPreferences = (v: unknown): v is ListPreferences => {
  const p = v as Partial<ListPreferences> | null;
  return !!p && typeof p === 'object' && (p.view === 'list' || p.view === 'cards') && (p.contributor === null || typeof p.contributor === 'string') && typeof p.choosing === 'boolean';
};

/** The saved jigsaws of Karins jigsaw: open one to play it, delete one, or go and make a new one. */
@Component({
  selector: 'app-jigsaw-list',
  imports: [RouterLink, TranslocoDirective, JigsawCard, JigsawRow],
  providers: [provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-list.html',
})
export class JigsawList implements OnInit {
  private readonly service = inject(JigsawService);

  /** what was chosen the last time the page was open */
  private readonly saved = readPreference(LIST_PREFERENCES_KEY, DEFAULT_PREFERENCES, isListPreferences);

  /** how the jigsaws are shown, as a list or as cards */
  readonly view = signal<'list' | 'cards'>(this.saved.view);
  constructor() {
    // the choices are kept on the device each time one changes
    effect(() => writePreference(LIST_PREFERENCES_KEY, { view: this.view(), contributor: this.contributor(), choosing: this.choosing() } satisfies ListPreferences));
  }

  readonly items = signal<JigsawSpec[]>([]);
  /** who has made jigsaws (for the choice of a contributor), and the one chosen: null shows everybody's */
  readonly contributors = computed(() => contributorsOf(this.items()));
  readonly contributor = signal<string | null>(this.saved.contributor);
  readonly chosen = computed(() => this.contributors().find((c) => c.key === this.contributor()) ?? null);
  /** the choice of contributors is open */
  readonly choosing = signal(this.saved.choosing);
  /** the jigsaws that are shown: all, or those of the chosen contributor */
  readonly shown = computed(() => madeBy(this.items(), this.chosen() ? this.contributor() : null));
  readonly loading = signal(true);
  readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.items.set(await this.service.list());
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Shows the jigsaws one contributor made (and closes the choice), or everybody's when none is given. */
  choose(key: string | null): void {
    this.contributor.set(key);
    this.choosing.set(false);
  }
}
