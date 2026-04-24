import { Link } from 'react-router-dom';
import { Home, Clock, Menu, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';

interface MobileBottomNavProps {
  onMenuClick?: () => void;
}

export default function MobileBottomNav({ onMenuClick }: MobileBottomNavProps) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {}
    }
  }, []);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <Link to="/" className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-emerald-600 transition-colors">
        <Home className="w-6 h-6 mb-1" />
        <span className="text-[10px] font-medium">Início</span>
      </Link>
      <Link to="/plantao" className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-emerald-600 transition-colors">
        <Clock className="w-6 h-6 mb-1" />
        <span className="text-[10px] font-medium">Hoje</span>
      </Link>
      <Link to="/proximos-plantoes" className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-emerald-600 transition-colors">
        <Calendar className="w-6 h-6 mb-1" />
        <span className="text-[10px] font-medium">Próximos</span>
      </Link>
      <button 
        onClick={onMenuClick} 
        className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-emerald-600 transition-colors"
      >
        <Menu className="w-6 h-6 mb-1" />
        <span className="text-[10px] font-medium">Menu</span>
      </button>
    </nav>
  );
}
