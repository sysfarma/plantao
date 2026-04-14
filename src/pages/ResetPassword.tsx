import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Pill, ArrowLeft } from 'lucide-react';
import { confirmPasswordReset } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode'); // Firebase uses oobCode
  const navigate = useNavigate();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setError('Código de recuperação não encontrado.');
    }
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!oobCode) {
      setError('Código inválido.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset(auth, oobCode, password);

      setMessage('Senha redefinida com sucesso! Redirecionando...');
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-130px)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="text-center">
          <Pill className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Nova Senha</h2>
          <p className="mt-2 text-sm text-gray-600">
            Crie uma nova senha para sua conta
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-md text-sm">
              {message}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
              <input
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!oobCode || !!message}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Confirmar Nova Senha</label>
              <input
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={!oobCode || !!message}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !token || !!message}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Redefinir Senha'}
            </button>
          </div>
          
          <div className="text-center mt-4">
            <Link to="/login" className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-500">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar para o Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
