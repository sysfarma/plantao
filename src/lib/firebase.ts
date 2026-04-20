import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

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
