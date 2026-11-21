import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { createJigsawApp } from "./jigsaw/app";

initializeApp();

/** The API of the app is one Cloud Function: Hosting sends `/jigsaw/api/**` to it. */
export const jigsawApi = onRequest(
  { region: "europe-west1", invoker: "public", memory: "256MiB", timeoutSeconds: 60, maxInstances: 10, concurrency: 80, cpu: 1 },
  createJigsawApp(),
);
