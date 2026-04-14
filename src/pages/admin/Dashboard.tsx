import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Star, Trash2, Ban, Edit, Plus, X, Calendar } from 'lucide-react';
import { calculateHighlightEnd, isShiftPast, formatToBRDate } from '../../lib/dateUtils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface Pharmacy {
  id: string;
  name: string;
  city: string;
  state: string;
  is_active: number;
  user_email: string;
  sub_status: string;
  phone: string;
  whatsapp: string;
  street: string;
  number: string;
  neighborhood: string;
}

export default function AdminDashboard() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [adminShifts, setAdminShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pharmacies');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPharmacy, setEditingPharmacy] = useState<Pharmacy | null>(null);
  const [formData, setFormData] = useState<any>({});

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ pharmacy_id: '', date: '', start_time: '07:00', end_time: '22:00', is_24h: false });
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingPharmacy(null);
    setFormData({});
    setIsModalOpen(true);
  };

  const openEditModal = (pharmacy: Pharmacy) => {
    setEditingPharmacy(pharmacy);
    setFormData(pharmacy);
    setIsModalOpen(true);
  };

  const handleSavePharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      if (editingPharmacy) {
        await fetch(`/api/admin/pharmacies/${editingPharmacy.id}`, {
          method: 'PUT',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'X-App-Token': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });
      } else {
        const res = await fetch('/api/admin/pharmacies', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'X-App-Token': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Erro ao criar farmácia');
        }
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving pharmacy', error);
      alert(error.message || 'Erro ao salvar farmácia');
    }
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'X-App-Token': `Bearer ${token}` 
      };
      
      const [pharmRes, repRes, shiftRes] = await Promise.all([
        fetch('/api/admin/pharmacies', { headers }),
        fetch('/api/admin/reports', { headers }),
        fetch('/api/admin/shifts', { headers })
      ]);
      
      if (pharmRes.ok) {
        const data = await pharmRes.json();
        setPharmacies(Array.isArray(data) ? data : []);
      }
      if (repRes.ok) setReports(await repRes.json());
      if (shiftRes.ok) {
        const data = await shiftRes.json();
        setAdminShifts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openNewShiftModal = () => {
    setEditingShiftId(null);
    setShiftForm({ pharmacy_id: pharmacies[0]?.id || '', date: '', start_time: '07:00', end_time: '22:00', is_24h: false });
    setIsShiftModalOpen(true);
  };

  const openEditShiftModal = (shift: any) => {
    setEditingShiftId(shift.id);
    setShiftForm({
      pharmacy_id: shift.pharmacy_id,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      is_24h: shift.is_24h === 1
    });
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const url = editingShiftId ? `/api/admin/shifts/${editingShiftId}` : '/api/admin/shifts';
      const method = editingShiftId ? 'PUT' : 'POST';
      
      await fetch(url, {
        method,
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-App-Token': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(shiftForm)
      });
      
      setIsShiftModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving shift', error);
      alert('Erro ao salvar plantão.');
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este plantão?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/admin/shifts/${id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-App-Token': `Bearer ${token}` 
        }
      });
      fetchData();
    } catch (error) {
      console.error('Error deleting shift', error);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/admin/pharmacies/${id}/activate`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-App-Token': `Bearer ${token}` 
        }
      });
      fetchData();
    } catch (error) {
      console.error('Error activating', error);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja desativar esta farmácia?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/admin/pharmacies/${id}/deactivate`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-App-Token': `Bearer ${token}` 
        }
      });
      fetchData();
    } catch (error) {
      console.error('Error deactivating', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja EXCLUIR esta farmácia permanentemente?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/admin/pharmacies/${id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-App-Token': `Bearer ${token}` 
        }
      });
      fetchData();
    } catch (error) {
      console.error('Error deleting', error);
    }
  };

  const handleSetHighlight = async (id: string, type: 'day' | 'week' | 'month', city: string, state: string) => {
    try {
      const token = localStorage.getItem('token');
      const now = new Date();
      const end = calculateHighlightEnd(type);

      const res = await fetch('/api/admin/highlights', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-App-Token': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pharmacy_id: id,
          type,
          date_start: now.toISOString(),
          date_end: end.toISOString(),
          city,
          state
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao configurar destaque');
      }

      alert('Destaque configurado com sucesso!');
    } catch (error: any) {
      console.error('Error setting highlight', error);
      alert(error.message);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Painel Admin Master</h1>
      
      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          {['pharmacies', 'shifts', 'reports'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${
                activeTab === tab
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize`}
            >
              {tab === 'pharmacies' && 'Gerenciar Farmácias'}
              {tab === 'shifts' && 'Plantões'}
              {tab === 'reports' && 'Relatórios e Métricas'}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'pharmacies' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openCreateModal} className="bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 flex items-center gap-2">
              <Plus className="w-5 h-5" /> Nova Farmácia
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Farmácia</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destaques</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pharmacies.map((pharmacy) => (
                <tr key={pharmacy.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{pharmacy.name}</div>
                    <div className="text-sm text-gray-500">{pharmacy.user_email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {pharmacy.city}/{pharmacy.state}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {pharmacy.is_active ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Ativa
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Inativa
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {pharmacy.is_active && (
                      <div className="flex gap-2">
                        <button onClick={() => handleSetHighlight(pharmacy.id, 'day', pharmacy.city, pharmacy.state)} className="text-amber-600 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded text-xs flex items-center gap-1">
                          <Star className="w-3 h-3" /> Dia
                        </button>
                        <button onClick={() => handleSetHighlight(pharmacy.id, 'week', pharmacy.city, pharmacy.state)} className="text-amber-600 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded text-xs flex items-center gap-1">
                          <Star className="w-3 h-3" /> Sem
                        </button>
                        <button onClick={() => handleSetHighlight(pharmacy.id, 'month', pharmacy.city, pharmacy.state)} className="text-amber-600 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded text-xs flex items-center gap-1">
                          <Star className="w-3 h-3" /> Mês
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button 
                      onClick={() => openEditModal(pharmacy)}
                      className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded flex items-center gap-1 inline-flex"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {!pharmacy.is_active ? (
                      <button 
                        onClick={() => handleActivate(pharmacy.id)}
                        className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 px-3 py-1 rounded inline-flex"
                      >
                        Ativar
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleDeactivate(pharmacy.id)}
                        className="text-amber-600 hover:text-amber-900 bg-amber-50 px-3 py-1 rounded flex items-center gap-1 inline-flex"
                        title="Desativar"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(pharmacy.id)}
                      className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded flex items-center gap-1 inline-flex"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {activeTab === 'shifts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Gerenciar Plantões</h2>
              <p className="text-sm text-gray-500">Controle os dias de plantão de todas as farmácias.</p>
            </div>
            <button onClick={openNewShiftModal} className="bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Novo Plantão
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {adminShifts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhum plantão cadastrado no sistema.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Farmácia</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horário</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {adminShifts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((shift) => {
                    const isPast = isShiftPast(shift.date);
                    return (
                      <tr key={shift.id} className={isPast ? 'bg-gray-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {shift.pharmacy_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatToBRDate(shift.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {shift.is_24h ? '24 Horas' : `${shift.start_time} às ${shift.end_time}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isPast ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              Finalizado
                            </span>
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800">
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          <button onClick={() => openEditShiftModal(shift)} className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded inline-flex items-center gap-1">
                            <Edit className="w-4 h-4" /> Editar
                          </button>
                          <button onClick={() => handleDeleteShift(shift.id)} className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded inline-flex items-center gap-1">
                            <Trash2 className="w-4 h-4" /> Excluir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && reports?.totalPharmacies !== undefined && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-gray-500 text-sm font-medium">Total de Farmácias</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{reports.totalPharmacies}</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-gray-500 text-sm font-medium">Farmácias Ativas</h3>
              <p className="text-3xl font-bold text-emerald-600 mt-2">{reports.activePharmacies}</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-gray-500 text-sm font-medium">Faturamento Total (Estimado)</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">R$ {reports.totalRevenue.toFixed(2).replace('.', ',')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-6">Evolução de Faturamento</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={reports.revenueByMonth}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `R$ ${value}`} />
                    <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Faturamento']} />
                    <Area type="monotone" dataKey="total" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Status Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-6">Status das Farmácias</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reports.pharmacyStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {reports.pharmacyStatus.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#f43f5e'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova/Editar Farmácia */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingPharmacy ? 'Editar Farmácia' : 'Nova Farmácia'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSavePharmacy} className="p-6 space-y-4">
              {!editingPharmacy && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">E-mail (Login)</label>
                    <input type="email" required value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Senha</label>
                    <input type="password" required value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Nome da Farmácia</label>
                  <input type="text" required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Telefone</label>
                  <input type="text" required value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
                  <input type="text" required value={formData.whatsapp || ''} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Rua</label>
                  <input type="text" required value={formData.street || ''} onChange={e => setFormData({...formData, street: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Número</label>
                  <input type="text" required value={formData.number || ''} onChange={e => setFormData({...formData, number: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bairro</label>
                  <input type="text" required value={formData.neighborhood || ''} onChange={e => setFormData({...formData, neighborhood: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cidade</label>
                  <input type="text" required value={formData.city || ''} onChange={e => setFormData({...formData, city: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estado (UF)</label>
                  <input type="text" required maxLength={2} value={formData.state || ''} onChange={e => setFormData({...formData, state: e.target.value})} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md uppercase" />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Plantão (Admin) */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingShiftId ? 'Editar Plantão' : 'Novo Plantão'}
              </h2>
              <button onClick={() => setIsShiftModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveShift} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Farmácia</label>
                <select 
                  required 
                  value={shiftForm.pharmacy_id} 
                  onChange={e => setShiftForm({...shiftForm, pharmacy_id: e.target.value})} 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="" disabled>Selecione uma farmácia...</option>
                  {pharmacies.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.city}/{p.state})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Data do Plantão</label>
                <input 
                  type="date" 
                  required 
                  value={shiftForm.date} 
                  onChange={e => setShiftForm({...shiftForm, date: e.target.value})} 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" 
                />
              </div>
              
              <div className="flex items-center gap-2 mt-4 mb-4">
                <input 
                  type="checkbox" 
                  id="is_24h" 
                  checked={shiftForm.is_24h} 
                  onChange={e => setShiftForm({...shiftForm, is_24h: e.target.checked})} 
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="is_24h" className="text-sm font-medium text-gray-700">Plantão 24 Horas</label>
              </div>

              {!shiftForm.is_24h && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Hora Início</label>
                    <input 
                      type="time" 
                      required={!shiftForm.is_24h} 
                      value={shiftForm.start_time} 
                      onChange={e => setShiftForm({...shiftForm, start_time: e.target.value})} 
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Hora Fim</label>
                    <input 
                      type="time" 
                      required={!shiftForm.is_24h} 
                      value={shiftForm.end_time} 
                      onChange={e => setShiftForm({...shiftForm, end_time: e.target.value})} 
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" 
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsShiftModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
