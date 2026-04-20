import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Store, LogOut, Home, Menu, X, User, Clock, LayoutDashboard, Download, CreditCard, Calendar, Share2 } from 'lucide-react';
import MobileBottomNav from '../components/MobileBottomNav';
import { usePWA } from '../hooks/usePWA';

export default function PharmacyLayout() {
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
    if (user.role !== 'pharmacy' && user.role !== 'admin') {
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
            Plantão Hoje
          </Link>
          <Link to="/proximos-plantoes" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors">
            <Calendar className="w-5 h-5" />
            Próximos Plantões
          </Link>
          <Link to="/pharmacy" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors">
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </Link>
          <Link to="/perfil" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors">
            <User className="w-5 h-5" />
            Meu Perfil
          </Link>
          <Link to="/pharmacy/pricing" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-md text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors bg-emerald-800/20 mt-2">
            <CreditCard className="w-5 h-5 font-bold" />
            Premium
          </Link>
          <button 
            onClick={handleShare}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors w-full text-left"
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
              className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md text-white font-bold hover:bg-emerald-800 transition-colors"
            >
              <Download className="w-5 h-5" />
              Instalar App
            </button>
          )}
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
      
      <main className="flex-1 overflow-auto max-w-[80%] mx-auto w-full">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
