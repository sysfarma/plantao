import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Pill, Menu, X, Home, Clock, User, Download, Calendar, Share2 } from 'lucide-react';
import MobileBottomNav from '../components/MobileBottomNav';
import { usePWA } from '../hooks/usePWA';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { canInstall, promptInstall } = usePWA();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/login');
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') {
      navigate('/');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Farmácias de Plantão',
      text: 'Confira as farmácias de plantão hoje e nos próximos dias!',
      url: 'https://farmaciasdeplantao.app.br',
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        alert('Link do aplicativo copiado!');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Error sharing:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row pb-16 md:pb-0">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Pill className="w-5 h-5 text-emerald-400" />
          <span>Admin Master</span>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 hover:bg-slate-800 rounded-md">
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`${isMenuOpen ? 'block' : 'hidden'} md:block w-full md:w-64 bg-slate-900 text-white flex-col absolute md:relative z-40 min-h-screen md:min-h-0`}>
        <div className="hidden md:flex h-16 items-center justify-between px-6 border-b border-slate-800 font-bold text-lg gap-2">
          <div className="flex items-center gap-2">
            <Pill className="w-5 h-5 text-emerald-400" />
            <span>Admin Master</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            <Home className="w-5 h-5" />
            Página Inicial
          </Link>
          <Link to="/plantao" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            <Clock className="w-5 h-5" />
            Plantão Hoje
          </Link>
          <Link to="/proximos-plantoes" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            <Calendar className="w-5 h-5" />
            Próximos Plantões
          </Link>
          <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </Link>
          <Link to="/perfil" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            <User className="w-5 h-5" />
            Meu Perfil
          </Link>
          <button 
            onClick={handleShare}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors w-full text-left"
          >
            <Share2 className="w-5 h-5" />
            Compartilhar App
          </button>
          {canInstall && (
            <button 
              onClick={() => {
                setIsMenuOpen(false);
                promptInstall();
              }}
              className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md text-emerald-400 font-bold hover:text-emerald-300 hover:bg-slate-800 transition-colors"
            >
              <Download className="w-5 h-5" />
              Instalar App
            </button>
          )}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>
      
      <main className="flex-1 overflow-auto w-full">
        <Outlet />
      </main>
      <MobileBottomNav onMenuClick={() => setIsMenuOpen(!isMenuOpen)} />
    </div>
  );
}
