import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use initializeFirestore to allow settings like long polling which is more stable in restricted environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

// CRITICAL CONSTRAINT: When the application initially boots, call getFromServer to test the connection.
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firestore connection successful');
  } catch (error) {
    console.error('Firestore connection test failed:', error);
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();

export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (user) {
    try {
      return await user.getIdToken();
    } catch (e) {
      console.error('Error getting fresh token:', e);
    }
  }
  const localToken = localStorage.getItem('token');
  if (!localToken || localToken === 'null' || localToken === 'undefined' || localToken.split('.').length !== 3) {
    return null;
  }
  return localToken;
}
