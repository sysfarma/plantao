import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseError';

interface FirebaseContextType {
  user: User | null;
  isAuthReady: boolean;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  isAuthReady: false,
});

export const useFirebase = () => useContext(FirebaseContext);

interface Props {
  children: ReactNode;
}

export function FirebaseProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);

  useEffect(() => {
    // 1. Test Firestore Connection
    const testConnection = async () => {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      );

      try {
        await Promise.race([
          getDocFromServer(doc(db, 'test', 'connection')),
          timeoutPromise
        ]);
        setConnectionTested(true);
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
          // Throw so ErrorBoundary can catch it
          handleFirestoreError(error, OperationType.GET, 'test/connection');
        } else if (error instanceof Error && (error.message.includes('Missing or insufficient permissions') || error.message === 'Connection timeout')) {
           // We might get permission denied if the rules don't allow reading test/connection, 
           // or a timeout if the network is slow/blocked.
           // In these cases, we still want to let the app load and try other operations.
           console.warn("Connection test warning:", error.message);
           setConnectionTested(true);
        } else {
           // Other errors
           console.error("Connection test error:", error);
           setConnectionTested(true);
        }
      }
    };

    testConnection();

    // 2. Listen to Auth State
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Don't render children until we've at least tested connection and auth is ready
  if (!isAuthReady || !connectionTested) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <FirebaseContext.Provider value={{ user, isAuthReady }}>
      {children}
    </FirebaseContext.Provider>
  );
}
