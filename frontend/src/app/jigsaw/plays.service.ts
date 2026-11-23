import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { JigsawUserService } from './jigsaw-user.service';
import { JigsawPiece, PieceMove } from '../models/shared/jigsaw';
import { PlayOverrides, PlaySettings, PlaySpec } from '../models/shared/play';

/** A play as it is opened: the play, the settings it is played with, and the pieces of the jigsaw as this play has them. */
export interface PlayDetail {
  play: PlaySpec;
  settings: PlaySettings;
  pieces: JigsawPiece[];
}

/** A game of a user with the jigsaw it is a game of. */
export interface UserGame {
  play: PlaySpec;
  jigsaw: { id: string; name: string };
}

/** The plays of a jigsaw (one game of one user each), through the API. A play can only choose the difficulty and the look. */
@Injectable({ providedIn: 'root' })
export class PlaysService {
  private readonly http = inject(HttpClient);
  private readonly users = inject(JigsawUserService);

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
    return (await firstValueFrom(this.http.get<{ played: boolean }>(`${this.base(jigsawId)}/summary`))).played;
  }

  /** starts a game: the pieces are scattered, the difficulty is copied from the jigsaw */
  start(jigsawId: string, userId: string): Promise<PlaySpec> {
    return firstValueFrom(this.http.post<PlaySpec>(this.base(jigsawId), { userId }));
  }

  /** starts this round over: the pieces are scattered anew and the time played is nothing again */
  restart(jigsawId: string, playId: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.one(jigsawId, playId)}/restart`, {}, { headers: this.whoAsks() }));
  }

  get(jigsawId: string, playId: string): Promise<PlayDetail> {
    return firstValueFrom(this.http.get<PlayDetail>(this.one(jigsawId, playId)));
  }

  /** the difficulty and look this play chooses (a value sets it, null takes the choice away) */
  saveSettings(jigsawId: string, playId: string, overrides: { [K in keyof PlayOverrides]: PlayOverrides[K] | null }): Promise<{ play: PlaySpec; settings: PlaySettings }> {
    return firstValueFrom(this.http.patch<{ play: PlaySpec; settings: PlaySettings }>(`${this.one(jigsawId, playId)}/settings`, { overrides }, { headers: this.whoAsks() }));
  }

  /** where pieces are now (and how wide the store has grown to) */
  move(jigsawId: string, playId: string, moves: PieceMove[], storeWidth?: number): Promise<{ matched: number; total: number; status: string }> {
    return firstValueFrom(this.http.patch<{ matched: number; total: number; status: string }>(`${this.one(jigsawId, playId)}/positions`, { moves, ...(storeWidth ? { storeWidth } : {}) }, { headers: this.whoAsks() }));
  }

  /** The same, for the moment the page is being closed: the request goes on after the page is gone (`keepalive`; nothing waits for the answer). */
  moveWhileLeaving(jigsawId: string, playId: string, moves: PieceMove[]): void {
    fetch(`${this.one(jigsawId, playId)}/positions`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...this.whoAsks() }, body: JSON.stringify({ moves }), keepalive: true }).catch(() => undefined);
  }

  /** how long the round has been played, so far (it only grows on the server) */
  saveTime(jigsawId: string, playId: string, elapsedMs: number): Promise<unknown> {
    return firstValueFrom(this.http.patch(`${this.one(jigsawId, playId)}/positions`, { moves: [], elapsedMs }, { headers: this.whoAsks() }));
  }

  /** The same, for the moment the page is being closed or hidden: the request goes on after the page is gone. */
  saveTimeWhileLeaving(jigsawId: string, playId: string, elapsedMs: number): void {
    fetch(`${this.one(jigsawId, playId)}/positions`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...this.whoAsks() }, body: JSON.stringify({ moves: [], elapsedMs }), keepalive: true }).catch(() => undefined);
  }

  /** Takes away all the rounds of a jigsaw, also other players' (only its owner can): the jigsaw can then be changed again. */
  removeAll(jigsawId: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(this.base(jigsawId), { headers: this.whoAsks() }));
  }

  remove(jigsawId: string, playId: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(this.one(jigsawId, playId), { headers: this.whoAsks() }));
  }
}
