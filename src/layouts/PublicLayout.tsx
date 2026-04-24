import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Pill, Menu, X, Home, User, LogOut, Clock, Download, CreditCard, Calendar, Share2 } from 'lucide-react';
import MobileBottomNav from '../components/MobileBottomNav';
import { usePWA } from '../hooks/usePWA';

export default function PublicLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { canInstall, promptInstall } = usePWA();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {}
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setIsMenuOpen(false);
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
    <div className="min-h-screen bg-gray-50 flex flex-col pb-16 md:pb-0">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-[100%] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-emerald-600 font-bold text-xl">
            <Pill className="w-6 h-6" />
            <span>Farmácias de Plantão</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Link 
              to="/plantao"
              className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-md font-medium flex items-center justify-center gap-2 transition-colors text-sm hidden sm:flex"
            >
              <Clock className="w-4 h-4" />
              Plantão Hoje
            </Link>
            {/* Menu Toggle Button */}
            <button 
              className="p-2 text-gray-600 hover:text-emerald-600 transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Dropdown Menu (Hidden by default) */}
        {isMenuOpen && (
          <div className="absolute top-16 right-0 w-full sm:w-64 bg-white border-b sm:border-l sm:border-b border-gray-200 shadow-lg sm:rounded-bl-lg">
            <nav className="flex flex-col py-2">
              {user ? (
                <>
                  <div className="px-4 py-3 border-b border-gray-100 mb-2">
                    <p className="text-sm font-medium text-gray-900 truncate">Olá, {user.email}</p>
                    <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                  </div>
                  <Link 
                    to="/" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <Home className="w-5 h-5" />
                    <span className="font-medium">Página Inicial</span>
                  </Link>
                  <Link 
                    to="/plantao" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <Clock className="w-5 h-5" />
                    <span className="font-medium">Plantão</span>
                  </Link>
                  <Link 
                    to="/proximos-plantoes" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <Calendar className="w-5 h-5" />
                    <span className="font-medium">Próximos Plantões</span>
                  </Link>
                  <Link 
                    to="/pricing" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="font-medium">Premium</span>
                  </Link>
                  <Link 
                    to="/perfil" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <User className="w-5 h-5" />
                    <span className="font-medium">Meu Perfil</span>
                  </Link>
                  {(user.role === 'admin' || user.role === 'pharmacy') && (
                    <Link 
                      to={user.role === 'admin' ? '/admin' : '/pharmacy'} 
                      onClick={() => setIsMenuOpen(false)} 
                      className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                    >
                      <Pill className="w-5 h-5" />
                      <span className="font-medium">Dashboard</span>
                    </Link>
                  )}
                  <button 
                    onClick={handleShare}
                    className="flex items-center gap-3 px-4 py-3 text-emerald-600 font-bold hover:bg-emerald-50 transition-colors w-full text-left"
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
                      className="flex items-center gap-3 px-4 py-3 text-emerald-700 font-bold hover:bg-emerald-50 transition-colors w-full text-left"
                    >
                      <Download className="w-5 h-5" />
                      Instalar App
                    </button>
                  )}
                  <button 
                    onClick={handleLogout} 
                    className="flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Sair</span>
                  </button>
                </>
              ) : (
                <>
                  <Link 
                    to="/" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <Home className="w-5 h-5" />
                    <span className="font-medium">Página Inicial</span>
                  </Link>
                  <Link 
                    to="/plantao" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <Clock className="w-5 h-5" />
                    <span className="font-medium">Plantão</span>
                  </Link>
                  <Link 
                    to="/proximos-plantoes" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <Calendar className="w-5 h-5" />
                    <span className="font-medium">Próximos Plantões</span>
                  </Link>
                  <Link 
                    to="/pricing" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="font-medium">Premium</span>
                  </Link>
                  <Link 
                    to="/login" 
                    onClick={() => setIsMenuOpen(false)} 
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    <User className="w-5 h-5" />
                    <span className="font-medium">Entrar</span>
                  </Link>
                  <button 
                    onClick={handleShare}
                    className="flex items-center gap-3 px-4 py-3 text-emerald-600 font-bold hover:bg-emerald-50 transition-colors w-full text-left"
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
                      className="flex items-center gap-3 px-4 py-3 text-emerald-700 font-bold hover:bg-emerald-50 transition-colors w-full text-left"
                    >
                      <Download className="w-5 h-5" />
                      Instalar App
                    </button>
                  )}
                  <div className="px-4 py-3 mt-2 border-t border-gray-100 flex flex-col gap-2">
                    <Link 
                      to="/register?role=pharmacy" 
                      onClick={() => setIsMenuOpen(false)} 
                      className="flex items-center justify-center w-full bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-colors font-medium"
                    >
                      Cadastrar Farmácia
                    </Link>
                    <Link 
                      to="/register?role=client" 
                      onClick={() => setIsMenuOpen(false)} 
                      className="flex items-center justify-center w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors font-medium"
                    >
                      Criar Conta (Cliente)
                    </Link>
                  </div>
                </>
              )}
            </nav>
          </div>
        )}
      </header>
      <main className="flex-1 max-w-[100%] mx-auto w-full">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-gray-200 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-gray-500 text-sm">
              &copy; {new Date().getFullYear()} Farmácias de Plantão Brasil. Todos os direitos reservados.
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-sm font-medium">
              <Link to="/termos" className="text-gray-600 hover:text-emerald-600 transition-colors">Termos de Uso</Link>
              <Link to="/privacidade" className="text-gray-600 hover:text-emerald-600 transition-colors">Privacidade</Link>
              <Link to="/contato" className="text-gray-600 hover:text-emerald-600 transition-colors">Fale Conosco</Link>
            </div>
          </div>
        </div>
      </footer>
      <MobileBottomNav onMenuClick={() => setIsMenuOpen(!isMenuOpen)} />
    </div>
  );
}
