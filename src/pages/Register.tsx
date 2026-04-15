import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Pill } from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc, setDoc, doc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import GoogleLoginButton from '../components/GoogleLoginButton';

export default function Register() {
  const [role, setRole] = useState<'pharmacy' | 'client'>('pharmacy');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    whatsapp: '',
    website: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    zip: '',
    cep: '',
    lat: 0,
    lng: 0
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // Create User Document
      await setDoc(doc(db, 'users', user.uid), {
        email: formData.email,
        name: formData.name,
        role: role,
        cep: formData.cep,
        street: formData.street,
        number: formData.number,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        created_at: new Date().toISOString()
      });

      if (role === 'pharmacy') {
        // Create Pharmacy Document
        const pharmacyRef = await addDoc(collection(db, 'pharmacies'), {
          user_id: user.uid,
          name: formData.name,
          phone: formData.phone,
          whatsapp: formData.whatsapp,
          email: formData.email,
          website: formData.website,
          street: formData.street,
          number: formData.number,
          neighborhood: formData.neighborhood,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          cep: formData.cep,
          lat: formData.lat,
          lng: formData.lng,
          is_active: 0,
          created_at: new Date().toISOString()
        });

        // Create Subscription Document
        await addDoc(collection(db, 'subscriptions'), {
          pharmacy_id: pharmacyRef.id,
          status: 'pending',
          expires_at: null,
          created_at: new Date().toISOString()
        });
      }

      navigate('/login');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setError(err.message || 'Erro ao cadastrar');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCepBlur = async () => {
    const cep = formData.cep.replace(/\D/g, '');
    if (cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf
          }));

          // Simple Geocoding (Nominatim)
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${data.logradouro}, ${data.localidade}, ${data.uf}, Brazil`)}`);
          const geoData = await geoRes.json();
          if (geoData && geoData.length > 0) {
            setFormData(prev => ({
              ...prev,
              lat: parseFloat(geoData[0].lat),
              lng: parseFloat(geoData[0].lon)
            }));
          }
        }
      } catch (err) {
        console.error('Error fetching CEP', err);
      }
    }
  };

  return (
    <div className="min-h-[calc(100vh-130px)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-2xl w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="text-center">
          <Pill className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            {role === 'pharmacy' ? 'Cadastre sua Farmácia' : 'Crie sua Conta'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Já tem conta?{' '}
            <Link to="/login" className="font-medium text-emerald-600 hover:text-emerald-500">
              Faça login
            </Link>
          </p>
        </div>

        <div className="flex p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setRole('pharmacy')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              role === 'pharmacy' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sou Farmácia
          </button>
          <button
            onClick={() => setRole('client')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              role === 'client' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sou Cliente
          </button>
        </div>

        <div className="mt-8">
          <GoogleLoginButton text="signup_with" />
        </div>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Ou cadastre com e-mail</span>
            </div>
          </div>
        </div>
        
        <form className="mt-6 space-y-6" onSubmit={handleRegister}>
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Account Info */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Dados de Acesso</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">E-mail</label>
                  <input type="email" name="email" required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Senha</label>
                  <input type="password" name="password" required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
              </div>
            </div>

            {/* Pharmacy Info */}
            {role === 'pharmacy' ? (
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Dados da Farmácia</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Nome da Farmácia</label>
                    <input type="text" name="name" required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Telefone</label>
                    <input type="text" name="phone" required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
                    <input type="text" name="whatsapp" required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Site (Opcional)</label>
                    <input type="url" name="website" onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Dados Pessoais</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nome Completo</label>
                  <input type="text" name="name" required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
              </div>
            )}

            {/* Address Info */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Endereço</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">CEP</label>
                  <input type="text" name="cep" required placeholder="00000-000" onBlur={handleCepBlur} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Rua</label>
                  <input type="text" name="street" value={formData.street} required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Número</label>
                  <input type="text" name="number" required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bairro</label>
                  <input type="text" name="neighborhood" value={formData.neighborhood} required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cidade</label>
                  <input type="text" name="city" value={formData.city} required onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estado (UF)</label>
                  <input type="text" name="state" value={formData.state} required maxLength={2} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm uppercase" />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {loading ? 'Cadastrando...' : 'Finalizar Cadastro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
