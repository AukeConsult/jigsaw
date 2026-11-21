export const environment = {
  useEmulators: true,
  // the two services of the app, each its own Cloud Function (Hosting and the dev proxy send these addresses to them)
  jigsawApi: '/jigsaw/api',
  canvasApi: '/canvas/api',
  firebase: {
    apiKey: 'demo',
    authDomain: 'demo-canvas.firebaseapp.com',
    projectId: 'demo-canvas',
    storageBucket: 'demo-canvas.appspot.com',
    messagingSenderId: '0',
    appId: 'demo',
  },
};
