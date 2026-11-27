// Objectflix: this is the firebase part, kept here so the rest of the app knows exactly where to look.
import { firebaseConfigured as firebaseConfig, FIREBASE_SDK_VERSION } from './firebase-config.js';

const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

let firebasePromise = null;

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE_'));
}

export async function getFirebase() {
  if (!firebasePromise) {
    firebasePromise = (async () => {
      const [{ initializeApp }, authSdk, firestoreSdk] = await Promise.all([
        import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-app.js`),
        import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-auth.js`),
        import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-firestore.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      return { app, auth: authSdk.getAuth(app), db: firestoreSdk.getFirestore(app), authSdk, firestoreSdk };
    })();
  }
  return firebasePromise;
}

export async function currentFirebaseUser() {
  if (!isFirebaseConfigured()) return null;
  try {
    const { auth } = await getFirebase();
    return auth.currentUser;
  } catch {
    return null;
  }
}
