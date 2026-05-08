import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Plus, Trash2, ArrowLeft, Loader2 } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from '../components/Toast';

interface FooterLink {
  label: string;
  url: string;
}

interface FooterConfig {
  copyright: string;
  links: FooterLink[];
}

export default function FooterSettings() {
  const [config, setConfig] = useState<FooterConfig>({
    copyright: 'Farmácias de Plantão Brasil. Todos os direitos reservados.',
    links: [
      { label: 'Termos de Uso', url: '/termos' },
      { label: 'Privacidade', url: '/privacidade' },
      { label: 'Fale Conosco', url: '/contato' }
    ]
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'config', 'footer'));
        if (docSnap.exists()) {
          setConfig(docSnap.data() as FooterConfig);
        }
      } catch (error) {
        console.error('Error fetching footer config:', error);
        showToast('Erro ao carregar configurações do rodapé', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [showToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'footer'), config);
      showToast('Configurações do rodapé salvas com sucesso!', 'success');
    } catch (error) {
      console.error('Error saving footer config:', error);
      showToast('Erro ao salvar configurações do rodapé', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addLink = () => {
    setConfig({
      ...config,
      links: [...config.links, { label: '', url: '' }]
    });
  };

  const removeLink = (index: number) => {
    const newLinks = config.links.filter((_, i) => i !== index);
    setConfig({ ...config, links: newLinks });
  };

  const updateLink = (index: number, field: keyof FooterLink, value: string) => {
    const newLinks = [...config.links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setConfig({ ...config, links: newLinks });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Configurações do Rodapé</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar Alterações
        </button>
      </div>

      <div className="space-y-6">
        {/* Copyright Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">Direitos Autorais (Copyright)</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Texto do Copyright</label>
            <input
              type="text"
              value={config.copyright}
              onChange={(e) => setConfig({ ...config, copyright: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              placeholder="Ex: Farmácias de Plantão Brasil. Todos os direitos reservados."
            />
            <p className="mt-2 text-xs text-gray-500">O ano atual será adicionado automaticamente.</p>
          </div>
        </div>

        {/* Links Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Links do Rodapé</h2>
            <button
              onClick={addLink}
              className="flex items-center gap-1 text-sm font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1 rounded-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              Adicionar Link
            </button>
          </div>

          <div className="space-y-4">
            {config.links.map((link, index) => (
              <div key={index} className="flex gap-4 items-start">
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Título do Link</label>
                      <input
                        type="text"
                        value={link.label}
                        onChange={(e) => updateLink(index, 'label', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        placeholder="Ex: Termos de Uso"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">URL / Caminho</label>
                      <input
                        type="text"
                        value={link.url}
                        onChange={(e) => updateLink(index, 'url', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        placeholder="Ex: /termos"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeLink(index)}
                  className="mt-6 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Remover Link"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}

            {config.links.length === 0 && (
              <p className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">Nenhum link adicionado.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
