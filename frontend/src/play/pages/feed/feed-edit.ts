import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { CategoryPicker } from '../../../app/jigsaw/category-picker/category-picker';
import { VisibilityChoice } from '../../../app/jigsaw/visibility-choice/visibility-choice';
import { LANGUAGES, LanguageService } from '../../../app/core/language.service';
import { FeedAdminKind, FeedAdminService, FeedBody, TranslationResult } from '../../../app/jigsaw/feed-admin.service';
import { FEED_LABEL_MAX, FEED_TEXT_MAX, FEED_TITLE_MAX, FeedItemData, FeedItems, FeedTexts } from '../../../app/models/shared/feed-item';
import { dayToMs, msToDay } from './feed-dates';
import { CURRENCIES, FEED_ICONS, FEED_PATHS } from './feed-kind';
import { apiError } from '../../../app/core/api-error';

/**
 * The page of the routes `/play/mine/info/new` and `/play/mine/info/:id` (and the same for `offers`; the route data `kind` says which): **one tile of the home page, added or changed** by a publisher or an admin. The words are
 * written in one language, the master language (the one the author chooses), and **the AI makes the other languages when the tile is saved**: under the form the translations say, for each language, whether they were
 * written by the author or made by the AI, and whether they are out of date or missing. A tile is shown from a day until a day (both can be left empty). Only the one who wrote a tile (or an admin) changes it.
 */
@Component({
  selector: 'play-feed-edit',
  imports: [TranslocoDirective, RouterLink, VisibilityChoice, CategoryPicker],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  templateUrl: './feed-edit.html',
})
export class PlayFeedEdit {
  protected readonly kind: FeedAdminKind = inject(ActivatedRoute).snapshot.data['kind'];
  private readonly id = signal(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  protected readonly path = FEED_PATHS[this.kind];
  protected readonly icon = FEED_ICONS[this.kind];
  protected readonly currencies = CURRENCIES;
  private readonly service = inject(FeedAdminService);
  private readonly router = inject(Router);
  protected readonly language = inject(LanguageService).lang;
  protected readonly languages = LANGUAGES;
  protected readonly titleMax = FEED_TITLE_MAX;
  protected readonly textMax = FEED_TEXT_MAX;
  protected readonly labelMax = FEED_LABEL_MAX;

  protected readonly masterLanguage = signal(this.language());
  protected readonly title = signal('');
  protected readonly text = signal('');
  protected readonly label = signal('');
  protected readonly route = signal('');
  protected readonly link = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  /** a package: free, or what it costs (in the units of the currency: 49 or 49,50) and in which currency */
  protected readonly free = signal(true);
  protected readonly price = signal('');
  protected readonly currency = signal<string>('EUR');
  /** a package: the categories it is in, which the person's search finds it by */
  protected readonly categories = signal<string[]>([]);
  /** who sees it on the home page: a new tile is private to begin with, so its owner looks at it (it has a banner that says so) and makes it public when it is good */
  protected readonly visibility = signal<'everyone' | 'owner' | 'hidden'>('owner');
  protected readonly slot = signal('');
  protected readonly priority = signal('');
  /** the tile as it is kept (nothing for a new one): the translations are read from it */
  protected readonly item = signal<FeedItemData | null>(null);

  protected readonly loading = signal(false);
  protected readonly missing = signal(false);
  protected readonly busy = signal(false);
  /** the last save did not go through */
  protected readonly failed = signal(false);
  protected readonly error = signal('');
  /** how the last save went: the tile is saved, and what happened to the translation */
  protected readonly saved = signal<TranslationResult | null>(null);

  /** the translations: for each language, who made it and whether it is out of date, from what is kept */
  protected readonly translations = computed(() => {
    const data = this.item();
    if (!data) return [];
    const waiting = new Set(FeedItems.toTranslate(data));
    return LANGUAGES.filter((l) => l.code !== data.masterLanguage).map((l) => {
      const entry = FeedTexts.entryOf(data.texts, l.code);
      return { code: l.code, name: l.name, entry, by: entry?.by, waiting: waiting.has(l.code) };
    });
  });

  constructor() {
    const id = this.id();
    if (id && id !== 'new') void this.load(id);
    // a new tile that was just saved opens as the one that is changed (another page: the route has the id), and still says how the translation went
    const saved = this.router.getCurrentNavigation()?.extras.state?.['saved'];
    if (saved === 'none' || saved === 'done' || saved === 'unavailable' || saved === 'failed') this.saved.set(saved);
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const found = await this.service.get(this.kind, id);
      this.fill(found.item);
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** The form has what the tile has: its master words, where it leads, its dates. */
  private fill(data: FeedItemData): void {
    const master = FeedTexts.entryOf(data.texts, data.masterLanguage);
    this.item.set(data);
    this.masterLanguage.set(data.masterLanguage);
    this.title.set(master?.title ?? '');
    this.text.set(master?.text ?? '');
    this.label.set(master?.label ?? '');
    this.route.set(data.route ?? '');
    this.link.set(data.link ?? '');
    this.from.set(msToDay(data.from));
    this.to.set(msToDay(data.to));
    this.visibility.set(data.visibility ?? 'everyone');
    this.free.set(!data.price);
    this.price.set(data.price ? String(data.price / 100).replace('.', ',') : '');
    this.currency.set(data.currency ?? 'EUR');
    this.categories.set(data.categories ?? []);
    this.slot.set(data.slot === undefined ? '' : String(data.slot));
    this.priority.set(data.priority === undefined ? '' : String(data.priority));
  }

  private body(): FeedBody {
    const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Math.trunc(Number(v)));
    return {
      masterLanguage: this.masterLanguage(),
      visibility: this.visibility(),
      title: this.title(),
      text: this.text(),
      ...(this.kind === 'offer' ? { label: this.label(), link: this.link() } : {}),
      ...(this.kind === 'package' ? { price: this.cents(), currency: this.currency(), categories: this.categories() } : { route: this.route() }),
      from: dayToMs(this.from(), false),
      to: dayToMs(this.to(), true),
      slot: num(this.slot()),
      priority: num(this.priority()),
    };
  }

  /** What a package costs in cents: nothing when it is free (a price that is not a number is nothing too, and the form does not let it be saved). */
  private cents(): number | undefined {
    if (this.free()) return undefined;
    const n = Number(this.price().replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
  }

  /** The price is wrong: it is not free and there is no price above 0. */
  protected readonly priceMissing = computed(() => this.kind === 'package' && !this.free() && this.cents() === undefined);

  /** Saves the tile (the AI makes the other languages), and shows how it went; a new tile then opens as the one that is changed. */
  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.failed.set(false);
    this.saved.set(null);
    try {
      const id = this.id();
      const answer = id && id !== 'new' ? await this.service.update(this.kind, id, this.body()) : await this.service.create(this.kind, this.body());
      this.fill(answer.item);
      this.saved.set(answer.translation);
      if (!id || id === 'new') {
        this.id.set(answer.item.id);
        void this.router.navigate([this.path, answer.item.id], { replaceUrl: true, state: { saved: answer.translation } });
      }
    } catch (err) {
      this.error.set(apiError(err) ?? '');
      this.saved.set(null);
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

}
