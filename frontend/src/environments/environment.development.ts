export const environment = {
  useEmulators: true,
  // the API of the app: a Cloud Function (Hosting and the dev proxy send this address to it)
  jigsawApi: '/jigsaw/api',
  firebase: {
    apiKey: 'demo',
    authDomain: 'demo-canvas.firebaseapp.com',
    projectId: 'demo-canvas',
    storageBucket: 'demo-canvas.appspot.com',
    messagingSenderId: '0',
    appId: 'demo',
  },
};
