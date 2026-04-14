import React, { useState } from 'react';
import { signInWithPopup, getIdToken } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

interface GoogleLoginButtonProps {
  text?: "signin_with" | "signup_with" | "continue_with";
}

export default function GoogleLoginButton({ text = "continue_with" }: GoogleLoginButtonProps) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await signInWithPopup(auth, googleProvider);
      const token = await getIdToken(result.user);

      // Sync with Firestore directly from frontend
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);

      let userData;
      if (!userSnap.exists()) {
        const role = result.user.email === 'sys.farmaciasdeplantao@gmail.com' ? 'admin' : 'pharmacy';
        userData = {
          email: result.user.email,
          role: role,
          created_at: new Date().toISOString()
        };
        await setDoc(userRef, userData);

        if (role === 'pharmacy') {
          const pharmacyId = uuidv4();
          await setDoc(doc(db, 'pharmacies', pharmacyId), {
            user_id: result.user.uid,
            name: result.user.displayName || 'Farmácia',
            phone: '',
            whatsapp: '',
            email: result.user.email,
            website: '',
            street: '',
            number: '',
            neighborhood: '',
            city: '',
            state: '',
            zip: '',
            is_active: 0,
            created_at: new Date().toISOString()
          });

          await addDoc(collection(db, 'subscriptions'), {
            pharmacy_id: pharmacyId,
            status: 'pending',
            expires_at: null,
            created_at: new Date().toISOString()
          });
        }
      } else {
        userData = userSnap.data();
        // Upgrade to admin if email matches
        if (result.user.email === 'sys.farmaciasdeplantao@gmail.com' && userData.role !== 'admin') {
          userData.role = 'admin';
          await setDoc(userRef, { role: 'admin' }, { merge: true });
        }
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ id: result.user.uid, ...userData }));

      if (userData.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/pharmacy');
      }
    } catch (err: any) {
      console.error('Google Login Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Login cancelado.');
      } else {
        setError(err.message || 'Erro ao autenticar com o Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const buttonText = {
    signin_with: 'Entrar com Google',
    signup_with: 'Cadastrar com Google',
    continue_with: 'Continuar com Google'
  }[text];

  return (
    <div className="w-full flex flex-col items-center">
      {error && <div className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded w-full text-center">{error}</div>}
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.25.81-.59z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        {loading ? 'Carregando...' : buttonText}
      </button>
    </div>
  );
}
