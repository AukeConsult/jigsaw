import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { CanvasObject, CanvasObjectInput } from '../models/shared/canvas-object';
import { ApiCollection } from './api-collection';

/** The saved canvas objects (collection `canvas-objects`, through the API). */
@Injectable({ providedIn: 'root' })
export class CanvasObjectsService extends ApiCollection<CanvasObjectInput, CanvasObject> {
  constructor() {
    super(inject(HttpClient), `${environment.apiBase}/canvas-objects`);
  }
}
