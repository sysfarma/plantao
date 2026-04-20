import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Shield, Zap, TrendingUp, Star, Award, Smartphone, Loader2, Store, Plus, Trash2, Edit, X, Save, Ban } from 'lucide-react';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import { useNavigate } from 'react-router-dom';
import { safeJsonFetch } from '../../lib/api';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, getAuthToken } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firebaseError';

const IconMap: Record<string, any> = {
  Zap, TrendingUp, Star, Smartphone, Award, Shield, Store, Check, Plus
};

export default function Pricing() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  
  const [benefits, setBenefits] = useState<any[]>([]);
  const [loadingBenefits, setLoadingBenefits] = useState(true);
  const [whatsappHelp, setWhatsappHelp] = useState({ number: '5500000000000', active: true });

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdminMaster = adminEmail && user.email === adminEmail;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [blockForm, setBlockForm] = useState({ title: '', description: '', icon: 'Zap', is_active: true, order: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = await getAuthToken();
        const [plansData, profileData] = await Promise.all([
          safeJsonFetch('/api/public/subscription-plans'),
          safeJsonFetch('/api/pharmacy/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => null) // Ignore error if not logged in
        ]);
        
        setPlans(plansData);
        setProfile(profileData);
        
        // Auto-select first active plan
        const activePlans = Object.keys(plansData).filter(id => plansData[id].active);
        
        // If has profile, try to select its plan
        if (profileData?.subscription?.plan_type && activePlans.includes(profileData.subscription.plan_type)) {
          setSelectedPlanId(profileData.subscription.plan_type);
        } else if (activePlans.includes('annual')) {
          setSelectedPlanId('annual');
        } else if (activePlans.length > 0) {
          setSelectedPlanId(activePlans[0]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Fetch benefits from Firestore
    const q = query(collection(db, 'pricing_blocks'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        // Initial setup with defaults if empty
        const defaults = [
          { icon: 'Zap', title: 'Liberação Imediata', description: 'Pague via Pix e tenha acesso ao painel em segundos.', is_active: true, order: 1 },
          { icon: 'TrendingUp', title: 'Visibilidade Prioritária', description: 'Apareça no topo das buscas em sua cidade e estado.', is_active: true, order: 2 },
          { icon: 'Star', title: 'Destaque de Plantão', description: 'Selo exclusivo \'Farmácia de Plantão\' em destaque no mapa.', is_active: true, order: 3 },
          { icon: 'Smartphone', title: 'Link Direto WhatsApp', description: 'Clientes entram em contato com apenas um clique.', is_active: true, order: 4 },
          { icon: 'Award', title: 'Métricas Avançadas', description: 'Relatórios detalhados de cliques e engajamento.', is_active: true, order: 5 },
          { icon: 'Shield', title: 'Suporte Premium', description: 'Canal exclusivo de atendimento para parceiros.', is_active: true, order: 6 }
        ];
        
        if (isAdminMaster) {
          defaults.forEach(async (d) => {
            await addDoc(collection(db, 'pricing_blocks'), {
              ...d,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          });
        } else {
          setBenefits(defaults);
        }
      } else {
        setBenefits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
      setLoadingBenefits(false);
    });

    // Fetch General Config for WhatsApp help
    const unsubConfig = onSnapshot(doc(db, 'config', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWhatsappHelp({
          number: data.whatsapp_support || '5500000000000',
          active: data.whatsapp_active ?? true
        });
      }
    });

    return () => {
      unsub();
      unsubConfig();
    };
  }, [isAdminMaster]);

  const handleUpdateBlock = async (id: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'pricing_blocks', id), {
        ...updates,
        updated_at: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pricing_blocks/${id}`);
    }
  };

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...blockForm,
        updated_at: new Date().toISOString()
      };
      
      if (editingBlock) {
        await updateDoc(doc(db, 'pricing_blocks', editingBlock.id), data);
      } else {
        await addDoc(collection(db, 'pricing_blocks'), {
          ...data,
          created_at: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingBlock ? OperationType.UPDATE : OperationType.CREATE, 'pricing_blocks');
    }
  };

  const handleDeleteBlock = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este bloco?')) return;
    try {
      await deleteDoc(doc(db, 'pricing_blocks', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `pricing_blocks/${id}`);
    }
  };

  const openEditModal = (block: any) => {
    setEditingBlock(block);
    setBlockForm({
      title: block.title,
      description: block.description,
      icon: block.icon || 'Zap',
      is_active: block.is_active,
      order: block.order || 0
    });
    setIsModalOpen(true);
  };

  const openNewModal = () => {
    setEditingBlock(null);
    setBlockForm({ title: '', description: '', icon: 'Zap', is_active: true, order: benefits.length + 1 });
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl text-center mb-16"
      >
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
          Potencialize as vendas da sua <span className="text-emerald-600">Farmácia</span>
        </h1>
        <p className="text-xl text-gray-600">
          Junte-se a centenas de farmácias que já estão conectadas com clientes em busca de atendimento rápido e de confiança.
        </p>
        
        {isAdminMaster && (
          <button 
            onClick={openNewModal}
            className="mt-6 inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" /> Adicionar Bloco de Benefício
          </button>
        )}
      </motion.div>

      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        {/* Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {loadingBenefits ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <div className="w-10 h-10 rounded-xl animate-shimmer" />
                <div className="h-6 w-3/4 rounded animate-shimmer" />
                <div className="space-y-2">
                  <div className="h-4 w-full rounded animate-shimmer" />
                  <div className="h-4 w-5/6 rounded animate-shimmer" />
                </div>
              </div>
            ))
          ) : (
            benefits.filter(b => b.is_active || isAdminMaster).map((benefit, index) => {
              const Icon = IconMap[benefit.icon] || Zap;
              return (
                <motion.div
                  key={benefit.id || index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-emerald-100 transition-all relative group ${!benefit.is_active ? 'opacity-50 grayscale' : ''}`}
                >
                  {isAdminMaster && (
                    <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleUpdateBlock(benefit.id, { is_active: !benefit.is_active })}
                        className={`p-1.5 rounded-lg transition-colors ${benefit.is_active ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                        title={benefit.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {benefit.is_active ? <Ban className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEditModal(benefit)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteBlock(benefit.id)} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div className="mb-4">
                    <div className={`p-3 rounded-xl inline-block ${benefit.icon === 'Shield' ? 'bg-red-50 text-red-500' : benefit.icon === 'TrendingUp' ? 'bg-emerald-50 text-emerald-500' : benefit.icon === 'Star' ? 'bg-blue-50 text-blue-500' : benefit.icon === 'Smartphone' ? 'bg-purple-50 text-purple-500' : benefit.icon === 'Award' ? 'bg-indigo-50 text-indigo-500' : 'bg-amber-50 text-amber-500'}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{benefit.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{benefit.description}</p>
                  {!benefit.is_active && isAdminMaster && (
                    <span className="mt-2 inline-block text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Inativo</span>
                  )}
                </motion.div>
              );
            })
          )}
        </div>

        {/* Pricing Card Section */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden min-h-[600px]"
        >
          {/* Decorative Background */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-800 rounded-full opacity-20 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-emerald-400 rounded-full opacity-10 blur-3xl"></div>

          <div className="relative z-10 h-full flex flex-col">
            {loading ? (
              <div className="space-y-8 animate-pulse py-4">
                <div className="flex justify-center mb-8">
                  <div className="w-48 h-10 bg-emerald-800/50 rounded-xl" />
                </div>
                <div className="space-y-4">
                  <div className="h-4 w-24 bg-emerald-400/20 rounded-full" />
                  <div className="h-16 w-48 bg-emerald-800/50 rounded-xl" />
                </div>
                <div className="space-y-4 pt-4">
                  <div className="h-4 w-full bg-emerald-800/50 rounded" />
                  <div className="h-4 w-5/6 bg-emerald-800/50 rounded" />
                  <div className="h-4 w-4/6 bg-emerald-800/50 rounded" />
                </div>
                <div className="mt-auto pt-8">
                  <div className="h-48 w-full bg-white/10 rounded-3xl" />
                </div>
              </div>
            ) : !plans || !Object.values(plans).some((p: any) => p.active) ? (
              <div className="text-center py-20 text-emerald-100">
                <p>Nenhum plano disponível no momento.</p>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  {/* Plan Selector */}
                  <div className="flex justify-center mb-8">
                    <div className="flex flex-wrap justify-center p-1 bg-emerald-800/50 rounded-xl gap-1">
                      {Object.entries(plans)
                        .filter(([id, p]: [string, any]) => p.active && id !== 'updated_at')
                        .sort(([idA], [idB]) => {
                          if (idA === 'extra_1776642077763') return -1;
                          if (idB === 'extra_1776642077763') return 1;
                          if (idA === 'monthly') return -1;
                          if (idB === 'monthly') return 1;
                          if (idA === 'annual') return -1;
                          if (idB === 'annual') return 1;
                          return idA.localeCompare(idB);
                        })
                        .map(([id, p]: [any, any]) => (
                        <button
                          key={id}
                          onClick={() => setSelectedPlanId(id)}
                          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${selectedPlanId === id ? 'bg-emerald-400 text-emerald-950 shadow-lg scale-105' : 'text-emerald-100 hover:text-white hover:bg-emerald-700/50'}`}
                        >
                          {p.title.split(' ')[1] || p.title}
                          {id === 'annual' && <span className="ml-1 text-[10px] opacity-70 block sm:inline">(Recomendado)</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <span className="inline-block px-3 py-1 bg-emerald-400/20 text-emerald-300 text-xs font-bold tracking-wider uppercase rounded-full mb-4">
                    {plans[selectedPlanId].title}
                  </span>
                  
                  <div className="flex items-baseline text-white">
                    <span className="text-3xl font-bold tracking-tight">R$</span>
                    <span className="text-6xl font-extrabold tracking-tight mx-2">
                       {plans[selectedPlanId].price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-emerald-400 font-medium lowercase">/ {
                      plans[selectedPlanId].frequency_type === 'years' ? 'ano' : 
                      plans[selectedPlanId].frequency_type === 'months' ? 'mês' : 
                      plans[selectedPlanId].frequency_type === 'days' ? 'dia' : plans[selectedPlanId].frequency_type
                    }</span>
                  </div>
                  {selectedPlanId === 'annual' && plans[selectedPlanId].price > 0 && (
                     <p className="mt-2 text-emerald-200 text-sm">Somente R$ {(plans[selectedPlanId].price / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por mês cobrados anualmente.</p>
                  )}
                </div>

                <div className="space-y-4 mb-10">
                  {(plans[selectedPlanId].benefits && plans[selectedPlanId].benefits.length > 0) ? (
                    plans[selectedPlanId].benefits.map((benefit: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 text-emerald-50">
                        <div className="flex-shrink-0 w-5 h-5 bg-emerald-400 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-emerald-900" />
                        </div>
                        <span className="text-sm font-medium">{benefit}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-center gap-3 text-emerald-100">
                        <div className="flex-shrink-0 w-5 h-5 bg-emerald-400 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-emerald-900" />
                        </div>
                        <span className="text-sm">Cadastro Completo no Mapa</span>
                      </div>
                      <div className="flex items-center gap-3 text-emerald-100">
                        <div className="flex-shrink-0 w-5 h-5 bg-emerald-400 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-emerald-900" />
                        </div>
                        <span className="text-sm">Envio de Plantão Ilimitado</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-white rounded-3xl p-6 text-gray-900 shadow-xl">
                  {!profile ? (
                    <div className="text-center py-6">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-4">
                        <Store className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Pronto para começar?</h3>
                      <p className="text-sm text-gray-500 mb-6 px-4">
                        Cadastre sua farmácia para contratar este plano e aparecer no mapa de plantões.
                      </p>
                      <button 
                        onClick={() => navigate('/register?role=pharmacy')}
                        className="w-full py-3 px-6 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg"
                      >
                        Criar Conta Grátis
                      </button>
                    </div>
                  ) : profile?.subscription?.plan_type === selectedPlanId && profile?.subscription?.status === 'active' ? (
                    <div className="text-center py-6">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-4">
                        <Check className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Seu Plano Atual</h3>
                      <p className="text-sm text-gray-500 mb-6 px-4">
                        Você já possui uma assinatura ativa para este plano. Explore seu painel ou mude para outra opção acima.
                      </p>
                      <button 
                        onClick={() => navigate('/pharmacy')}
                        className="w-full py-3 px-6 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg"
                      >
                        Ir para o Painel
                      </button>
                    </div>
                  ) : (
                    <PaymentMethodSelector 
                      onSuccess={() => navigate('/pharmacy')} 
                      planType={selectedPlanId} 
                      planPrice={plans[selectedPlanId].price}
                      isUpdate={!!profile?.subscription && (profile?.subscription?.status === 'active' || profile?.subscription?.status === 'pending')}
                    />
                  )}
                  <div className="mt-6 text-center">
                    <p className="text-[10px] text-gray-400">
                      Ao assinar, você concorda com nossos Termos de Uso e Política de Privacidade.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      <button 
        onClick={() => navigate('/pharmacy')}
        className="mt-12 text-sm text-gray-500 hover:text-emerald-600 underline"
      >
        Voltar para o Dashboard
      </button>

      {/* WhatsApp Help Button (Floating) */}
      {whatsappHelp.active && (
        <a
          href={`https://wa.me/${whatsappHelp.number}?text=Olá, estou na página de checkout e preciso de ajuda com a assinatura.`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-40 bg-[#25D366] text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform active:scale-95 flex items-center gap-2 group"
        >
          <Smartphone className="w-6 h-6" />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap font-bold text-sm">
            Apoio via WhatsApp
          </span>
        </a>
      )}

      {/* Admin Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">{editingBlock ? 'Editar Bloco' : 'Novo Bloco'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveBlock} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                  <input 
                    type="text" 
                    required 
                    value={blockForm.title} 
                    onChange={e => setBlockForm({...blockForm, title: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Ex: Suporte Premium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea 
                    required 
                    value={blockForm.description} 
                    onChange={e => setBlockForm({...blockForm, description: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Ex: Canal exclusivo de atendimento..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ícone (Nome)</label>
                    <select 
                      value={blockForm.icon} 
                      onChange={e => setBlockForm({...blockForm, icon: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      {Object.keys(IconMap).map(icon => <option key={icon} value={icon}>{icon}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ordem</label>
                    <input 
                      type="number" 
                      required 
                      value={blockForm.order} 
                      onChange={e => setBlockForm({...blockForm, order: parseInt(e.target.value)})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="is_active" 
                    checked={blockForm.is_active} 
                    onChange={e => setBlockForm({...blockForm, is_active: e.target.checked})}
                    className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Ativo na Página</label>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
