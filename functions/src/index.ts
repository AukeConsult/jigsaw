import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { createCanvasApp } from "./canvas/app";
import { createJigsawApp } from "./jigsaw/app";

initializeApp();

/** The two services of the app are two Cloud Functions with their own address: Hosting sends `/canvas/api/**` to `canvasApi` and `/jigsaw/api/**` to `jigsawApi`. */
const options = { region: "europe-west1", invoker: "public", memory: "256MiB", timeoutSeconds: 60, maxInstances: 10, concurrency: 80, cpu: 1 } as const;

export const canvasApi = onRequest(options, createCanvasApp());
export const jigsawApi = onRequest(options, createJigsawApp());
