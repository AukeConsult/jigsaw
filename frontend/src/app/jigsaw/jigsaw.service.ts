import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { CanvasInput, CanvasSpec } from '../models/shared/canvas';
import { ApiCollection } from '../core/api-collection';

/** The saved jigsaw pages (collection `jigsaw`, through the API): canvas areas like the others, kept in their own collection. */
@Injectable({ providedIn: 'root' })
export class JigsawService extends ApiCollection<CanvasInput, CanvasSpec> {
  constructor() {
    super(inject(HttpClient), `${environment.apiBase}/jigsaw`);
  }
}
