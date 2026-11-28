import { Translations } from '../models/shared/jigsaw-texts';
import { PlayLookSetup } from '../models/shared/play-look';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../logons/auth.service';
import { JigsawUserService } from './jigsaw-user.service';
import { JigsawPiece, PieceMove } from '../models/shared/jigsaw';
import { PlayChoice, PlaySettings, PlaySpec } from '../models/shared/play';

/** A play as it is opened: the play, the settings it is played with, and the pieces of the jigsaw as this play has them. */
export interface PlayDetail {
  play: PlaySpec;
  settings: PlaySettings;
  pieces: JigsawPiece[];
  /** only a round that has a cut of its own (a round of a picture): the size of its picture area and its grid (the store is the round's own `storeWidth`); the other rounds have the jigsaw's */
  layout?: { width: number; height: number; gridSize: number };
}

/** A game of a user with the jigsaw it is a game of. */
export interface UserGame {
  play: PlaySpec;
  /** `imageKey`: the key of the pictures of a jigsaw that is private or hidden, given by the API to those who may see it (see `JigsawImageService.url`) */
  jigsaw: { id: string; name: string; language?: string; translations?: Translations; imageKey?: string };
}

/** The plays of a jigsaw (one game of one user each), through the API. A play can only choose the difficulty and the look. */
@Injectable({ providedIn: 'root' })
export class PlaysService {
  private readonly http = inject(HttpClient);
  private readonly users = inject(JigsawUserService);
  private readonly auth = inject(AuthService);

  /** Changing or deleting a round says who asks (the UID of the user who plays): only the player of a round may. */
  private whoAsks(): { 'X-Jigsaw-User': string } {
    return { 'X-Jigsaw-User': this.users.user()?.id ?? '' };
  }

  private base(jigsawId: string): string {
    return `${environment.jigsawApi}/jigsaw/${encodeURIComponent(jigsawId)}/plays`;
  }

  private one(jigsawId: string, playId: string): string {
    return `${this.base(jigsawId)}/${encodeURIComponent(playId)}`;
  }

  /** the rounds of this jigsaw, newest first: of all the users, or of one user (by UID) */
  list(jigsawId: string, userId?: string): Promise<PlaySpec[]> {
    return firstValueFrom(this.http.get<PlaySpec[]>(userId ? `${this.base(jigsawId)}?userId=${encodeURIComponent(userId)}` : this.base(jigsawId)));
  }

  /** the games of a user (by UID) over all the jigsaws, newest first */
  ofUser(userId: string): Promise<UserGame[]> {
    return firstValueFrom(this.http.get<UserGame[]>(`${environment.jigsawApi}/jigsaw-users/${encodeURIComponent(userId)}/plays`));
  }

  /** whether anyone has started a game of the jigsaw (if not, the whole jigsaw can still be edited) */
  async played(jigsawId: string): Promise<boolean> {
    return (await this.summary(jigsawId)).played;
  }

  /** how much the jigsaw has been played: whether at all, how many rounds, and by how many accounts */
  summary(jigsawId: string): Promise<{ played: boolean; rounds: number; players: number }> {
    return firstValueFrom(this.http.get<{ played: boolean; rounds: number; players: number }>(`${this.base(jigsawId)}/summary`));
  }

  /** starts a game: the pieces are scattered, the difficulty is copied from the jigsaw; a picture is cut as chosen (the number of pieces and the difficulty) */
  start(jigsawId: string, userId: string, choice?: PlayChoice): Promise<PlaySpec> {
    return firstValueFrom(this.http.post<PlaySpec>(this.base(jigsawId), { userId, ...choice }));
  }

  /** starts this round over: the pieces are scattered anew and the time played is nothing again */
  restart(jigsawId: string, playId: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.one(jigsawId, playId)}/restart`, {}, { headers: this.whoAsks() }));
  }

  /** the round is made private (only its player sees it) or public again */
  setPrivate(jigsawId: string, playId: string, isPrivate: boolean): Promise<PlaySpec> {
    return firstValueFrom(this.http.patch<PlaySpec>(`${this.one(jigsawId, playId)}/privacy`, { private: isPrivate }, { headers: this.whoAsks() }));
  }

  /** the table and the sound of this round only, or null: the round follows the player's preference again */
  setLook(jigsawId: string, playId: string, look: PlayLookSetup | null): Promise<PlaySpec> {
    return firstValueFrom(this.http.patch<PlaySpec>(`${this.one(jigsawId, playId)}/look`, { look }, { headers: this.whoAsks() }));
  }

  get(jigsawId: string, playId: string): Promise<PlayDetail> {
    return firstValueFrom(this.http.get<PlayDetail>(this.one(jigsawId, playId)));
  }

  /** where pieces are now (and how wide the store has grown to) */
  move(jigsawId: string, playId: string, moves: PieceMove[], storeWidth?: number): Promise<{ matched: number; total: number; status: string }> {
    return firstValueFrom(this.http.patch<{ matched: number; total: number; status: string }>(`${this.one(jigsawId, playId)}/positions`, { moves, ...(storeWidth ? { storeWidth } : {}) }, { headers: this.whoAsks() }));
  }

  /** The same, for the moment the page is being closed (see `sendWhileLeaving`). */
  moveWhileLeaving(jigsawId: string, playId: string, moves: PieceMove[]): Promise<void> {
    return this.sendWhileLeaving(jigsawId, playId, { moves });
  }

  /**
   * A save of the positions that goes on after the page is gone (`keepalive`; nothing waits for it before the page goes). It is not an `HttpClient` call, so no interceptor sees it: it says who asks and carries the
   * token of the login itself, without which an account that needs a login is turned down. Rejected when nothing was saved, for a page that is only hidden and tries again.
   */
  private async sendWhileLeaving(jigsawId: string, playId: string, body: { moves: PieceMove[]; elapsedMs?: number }): Promise<void> {
    const headers = { 'Content-Type': 'application/json', ...this.whoAsks(), ...this.auth.headersNow() };
    // sent before the first wait, while the page is still there to send it
    const response = await fetch(`${this.one(jigsawId, playId)}/positions`, { method: 'PATCH', headers, body: JSON.stringify(body), keepalive: true });
    if (!response.ok) throw new Error(`Not saved: ${response.status}`);
  }

  /** how long the round has been played, so far (it only grows on the server) */
  saveTime(jigsawId: string, playId: string, elapsedMs: number): Promise<unknown> {
    return firstValueFrom(this.http.patch(`${this.one(jigsawId, playId)}/positions`, { moves: [], elapsedMs }, { headers: this.whoAsks() }));
  }

  /** The same, for the moment the page is being closed or hidden: the request goes on after the page is gone. */
  saveTimeWhileLeaving(jigsawId: string, playId: string, elapsedMs: number): Promise<void> {
    return this.sendWhileLeaving(jigsawId, playId, { moves: [], elapsedMs });
  }

  /** Takes away all the rounds of a jigsaw, also other players' (only its owner can): the jigsaw can then be changed again. */
  removeAll(jigsawId: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(this.base(jigsawId), { headers: this.whoAsks() }));
  }

  remove(jigsawId: string, playId: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(this.one(jigsawId, playId), { headers: this.whoAsks() }));
  }
}
