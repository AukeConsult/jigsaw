// The Karins jigsaw web app (its own app id) in the shared Firebase project `sevenfriends`. The web apiKey is a public identifier, not a secret.
export const environment = {
  useEmulators: false,
  // the API of the app: a Cloud Function (Hosting and the dev proxy send this address to it)
  jigsawApi: '/jigsaw/api',
  firebase: {
    apiKey: 'AIzaSyDy-ZStO1xAoNpPHU5EGFaRHD7dUHLtPdQ',
    // the sign-in handler is on the site's own address: a browser on a phone or pad blocks the way back from another one
    authDomain: 'karins-jigsaw.web.app',
    projectId: 'sevenfriends',
    storageBucket: 'sevenfriends.firebasestorage.app',
    messagingSenderId: '757442652591',
    appId: '1:757442652591:web:aeccb67dee91b18eed675a',
  },
};
