// The Canvas web app (its own app id) in the shared Firebase project `sevenfriends`. The web apiKey is a public identifier, not a secret.
export const environment = {
  useEmulators: false,
  // the two services of the app, each its own Cloud Function (Hosting and the dev proxy send these addresses to them)
  jigsawApi: '/jigsaw/api',
  canvasApi: '/canvas/api',
  firebase: {
    apiKey: 'AIzaSyDy-ZStO1xAoNpPHU5EGFaRHD7dUHLtPdQ',
    authDomain: 'sevenfriends.firebaseapp.com',
    projectId: 'sevenfriends',
    storageBucket: 'sevenfriends.firebasestorage.app',
    messagingSenderId: '757442652591',
    appId: '1:757442652591:web:aeccb67dee91b18eed675a',
  },
};
