import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Store, LogOut, Home, Menu, X, User, Clock } from 'lucide-react';
import MobileBottomNav from '../components/MobileBottomNav';

export default function PharmacyLayout() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row pb-16 md:pb-0">
      {/* Mobile Header */}
      <div className="md:hidden bg-emerald-900 text-white h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Store className="w-5 h-5 text-emerald-400" />
          <span>Painel da Farmácia</span>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 hover:bg-emerald-800 rounded-md">
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`${isMenuOpen ? 'block' : 'hidden'} md:block w-full md:w-64 bg-emerald-900 text-white flex-col absolute md:relative z-40 min-h-screen md:min-h-0`}>
        <div className="hidden md:flex h-16 items-center px-6 border-b border-emerald-800 font-bold text-lg gap-2">
          <Store className="w-5 h-5 text-emerald-400" />
          <span>Painel da Farmácia</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors">
            <Home className="w-5 h-5" />
            Página Inicial
          </Link>
          <Link to="/plantao" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors">
            <Clock className="w-5 h-5" />
            Plantão
          </Link>
          <Link to="/pharmacy" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md bg-emerald-800 text-white">
            <User className="w-5 h-5" />
            Meu Perfil
          </Link>
        </nav>
        <div className="p-4 border-t border-emerald-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>
      
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
