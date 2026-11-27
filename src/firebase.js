import { firebaseConfigured as firebaseConfig, FIREBASE_SDK_VERSION } from './firebase-config.js';

const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

let firebasePromise = null;

// Reports whether the configured Firebase API key is usable rather than a placeholder.
export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE_'));
}

// Loads the Firebase SDK modules once and shares the initialized app, auth, and database.
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

// Returns the signed-in Firebase user, or null when Firebase is unavailable or unconfigured.
export async function currentFirebaseUser() {
  if (!isFirebaseConfigured()) return null;
  try {
    const { auth } = await getFirebase();
    return auth.currentUser;
  } catch {
    return null;
  }
}
