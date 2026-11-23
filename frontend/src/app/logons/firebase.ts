import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { environment } from '../../environments/environment';

/** The login of the app: Firebase Auth of the project Karins jigsaw shares with Seven Friends, so one login works in both. */
export const auth = getAuth(initializeApp(environment.firebase));

if (environment.useEmulators) connectAuthEmulator(auth, 'http://localhost:9109', { disableWarnings: true }); // the Auth emulator of this project (firebase.json)
