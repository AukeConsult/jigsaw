import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { createApp } from "./app";

initializeApp();

export const canvasApi = onRequest(
  { region: "europe-west1", invoker: "public", memory: "256MiB", timeoutSeconds: 60, maxInstances: 10, concurrency: 80, cpu: 1 },
  createApp(),
);
