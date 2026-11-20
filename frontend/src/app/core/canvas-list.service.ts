import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { CanvasInput, CanvasSpec } from '../models/shared/canvas';
import { ApiCollection } from './api-collection';

/** The saved canvas areas (collection `canvas-list`, through the API). */
@Injectable({ providedIn: 'root' })
export class CanvasListService extends ApiCollection<CanvasInput, CanvasSpec> {
  constructor() {
    super(inject(HttpClient), `${environment.apiBase}/canvas-list`);
  }
}
