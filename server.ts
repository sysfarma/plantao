import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { MercadoPagoConfig, Payment, Customer, PreApproval, PreApprovalPlan } from 'mercadopago';
import { addYears, addMonths, addDays } from 'date-fns';
import crypto from 'crypto';
import cron from 'node-cron';
import { emailService } from './emailService.ts';

// Helper for next billing date calculation
function calculateNextBillingDate(frequency: number, frequencyType: string): string {
  const now = new Date();
  if (frequencyType === 'days') return addDays(now, frequency).toISOString();
  if (frequencyType === 'months') return addMonths(now, frequency).toISOString();
  if (frequencyType === 'years') return addYears(now, frequency).toISOString();
  return addMonths(now, frequency).toISOString(); // fallback
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the Firebase configuration
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf-8'));

// Initialize Firebase Admin
if (!admin.apps.length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = admin.credential.cert(serviceAccount);
      console.log('Firebase Admin initialized with Service Account Key');
    } catch (e) {
      console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_KEY. Please ensure it is a valid JSON string.');
      console.error('Falling back to default credentials.');
    }
  } else {
    console.error('===============================================================');
    console.error('CRITICAL ERROR: FIREBASE_SERVICE_ACCOUNT_KEY is missing!');
    console.error('The backend cannot access Firestore on external hosting (like Render) without it.');
    console.error('Please add the FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
    console.error('It should contain the full JSON string of your Firebase Service Account.');
    console.error('===============================================================');
  }

  const appOptions: admin.AppOptions = {
    projectId: firebaseConfig.projectId,
  };

  if (credential) {
    appOptions.credential = credential;
  }

  admin.initializeApp(appOptions);
  console.log('Firebase Admin initialized with Project ID:', firebaseConfig.projectId);
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);
const auth = getAuth();

// --- Admin Audit Logger Helper ---
async function logAdminAction(adminId: string, resourceType: string, resourceId: string, action: string, details?: any) {
  try {
    await db.collection('audit_logs').add({
      admin_id: adminId,
      resource_type: resourceType,
      resource_id: resourceId,
      action: action,
      details: details || {},
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to log admin action:', err);
  }
}
// ---------------------------------

let mpClient: MercadoPagoConfig;
let paymentClient: Payment;
let customerClient: Customer;
let preApprovalClient: PreApproval;
let preApprovalPlanClient: PreApprovalPlan;
let currentAccessToken: string | null = null;

async function getMPClient() {
  const configDoc = await db.collection('config').doc('mercadopago').get();
  const config = configDoc.data();
  
  // Explicitly allow a "Simulated Mode" toggle from Admin Config
  const forceSimulated = config?.test_mode === true;
  
  const accessToken = config?.access_token || process.env.MERCADOPAGO_ACCESS_TOKEN;
  
  // If no token at all, or it's a known placeholder, or forceSimulated is true -> isMock = true
  const isMock = forceSimulated || !accessToken || 
                 accessToken === 'TEST-1234567890' || 
                 accessToken === 'YOUR_MERCADOPAGO_ACCESS_TOKEN' ||
                 (!accessToken.startsWith('APP_USR-') && !accessToken.startsWith('TEST-'));

  if (!accessToken && !forceSimulated) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Mercado Pago Access Token not configured.');
    }
  }

  if (!mpClient || currentAccessToken !== accessToken) {
    // If we have no token and we're not in production, we can use a dummy token to at least instantiate
    const tokenToUse = accessToken || 'TEST-1234567890';
    mpClient = new MercadoPagoConfig({ accessToken: tokenToUse, options: { timeout: 5000 } });
    paymentClient = new Payment(mpClient);
    customerClient = new Customer(mpClient);
    preApprovalClient = new PreApproval(mpClient);
    preApprovalPlanClient = new PreApprovalPlan(mpClient);
    currentAccessToken = accessToken;
  }
  return { mpClient, paymentClient, customerClient, preApprovalClient, preApprovalPlanClient, isMock };
}

// Helper to format MP errors for the user
function formatMPError(err: any): { message: string, details: string } {
  const msg = err.message || '';
  const status = err.status;
  
  if (msg.includes('Unauthorized use of live credentials') || status === 401) {
    return {
      message: 'Credenciais de Produção não autorizadas.',
      details: 'Seu Access Token (APP_USR) exige que sua conta Mercado Pago esteja aprovada para produção. Ative as "Credenciais de Produção" no painel do Mercado Pago ou use um Token de Teste (TEST-).'
    };
  }
  
  return {
    message: 'Erro na API do Mercado Pago',
    details: msg || 'Falha na comunicação com o provedor de pagamentos.'
  };
}

async function cancelExistingSubscriptions(pharmacyId: string, exceptSubId?: string) {
  const oldSubsSnapshot = await db.collection('subscriptions')
    .where('pharmacy_id', '==', pharmacyId)
    .get();

  const { preApprovalClient, isMock } = await getMPClient();
  if (isMock) {
    // Silently mark as cancelled in Firestore without calling MP
    for (const doc of oldSubsSnapshot.docs) {
      if (exceptSubId && doc.id === exceptSubId) continue;
      const sub = doc.data();
      if (sub.status !== 'active' && sub.status !== 'pending') continue;
      await doc.ref.update({ status: 'cancelled', updated_at: new Date().toISOString() });
    }
    return;
  }

  for (const doc of oldSubsSnapshot.docs) {
    if (exceptSubId && doc.id === exceptSubId) continue;
    
    const sub = doc.data();
    if (sub.status !== 'active' && sub.status !== 'pending') continue;

    // Cancel in Mercado Pago if it has a preapproval ID
    if (sub.mp_preapproval_id && !sub.mp_preapproval_id.startsWith('sub_mock') && sub.mp_preapproval_id !== 'mock') {
      try {
        await preApprovalClient.update({
          id: sub.mp_preapproval_id,
          body: { status: 'cancelled' }
        });
      } catch (cancelError) {
        console.warn('Could not cancel old MP sub:', sub.mp_preapproval_id, cancelError);
      }
    }
    // Mark as cancelled in Firestore
    await doc.ref.update({ status: 'cancelled', updated_at: new Date().toISOString() });
  }
}

// Optimization: Global stats updater
async function updateDashboardStats() {
  const pharmaciesSnapshot = await db.collection('pharmacies').get();
  const activeCount = pharmaciesSnapshot.docs.filter(d => d.data().is_active === 1).length;
  
  const paymentsSnapshot = await db.collection('payments').where('status', '==', 'approved').get();
  const totalRevenue = paymentsSnapshot.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);

  // Stats by month
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const revenueByMonth = months.map((month, index) => {
    const monthPayments = paymentsSnapshot.docs.filter(doc => {
      const d = new Date(doc.data().created_at);
      return d.getMonth() === index && d.getFullYear() === new Date().getFullYear();
    });
    return {
      name: month,
      total: monthPayments.reduce((acc, doc) => acc + (doc.data().amount || 0), 0)
    };
  });

  await db.collection('config').doc('stats').set({
    totalPharmacies: pharmaciesSnapshot.size,
    activePharmacies: activeCount,
    totalRevenue,
    revenueByMonth,
    pharmacyStatus: [
      { name: 'Ativas', value: activeCount },
      { name: 'Inativas', value: pharmaciesSnapshot.size - activeCount }
    ],
    lastUpdate: new Date().toISOString()
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- API Routes ---

  // Debug: Check Admin Status
  app.get('/api/debug/admin-check', async (req, res) => {
    try {
      const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.replace(/['"]/g, '') : null;
      if (!adminEmail) return res.status(500).json({ error: 'ADMIN_EMAIL not configured' });
      let userRecord = null;
      try {
        userRecord = await auth.getUserByEmail(adminEmail);
      } catch (e) {
        return res.json({ authExists: false, error: 'User not found in Auth' });
      }
      
      const userDoc = await db.collection('users').where('email', '==', adminEmail).get();
      res.json({ 
        authExists: !!userRecord, 
        firestoreExists: !userDoc.empty,
        uid: userRecord.uid,
        role: userDoc.empty ? null : userDoc.docs[0].data().role,
        projectId: admin.app().options.projectId || 'default'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Auth Middleware
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'] || req.headers['x-app-token'];
    let token = authHeader && authHeader.split(' ')[1];
    
    if (!token && req.body && req.body.token) {
      token = req.body.token;
    }

    if (!token || token === 'null' || token === 'undefined') {
      console.log('Auth Middleware: No valid token provided');
      return res.status(401).json({ error: 'Token não fornecido ou inválido' });
    }

    try {
      // Basic JWT format check
      if (token === 'mock' || token === 'TEST' || token.split('.').length !== 3) {
        throw new Error('Token is not in JWT format');
      }

      const decodedToken = await auth.verifyIdToken(token);
      
      const adminEnv = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.replace(/['"]/g, '') : null;
      req.user = {
        id: decodedToken.uid,
        email: decodedToken.email,
        role: (adminEnv && decodedToken.email === adminEnv) ? 'admin' : 'pharmacy'
      };
      next();
    } catch (error: any) {
      console.error('Auth Middleware: Error caught!', error.message);
      return res.status(401).json({ 
        error: 'Token inválido ou expirado', 
        details: error.message,
        code: error.code || 'unknown'
      });
    }
  };

  // Forgot Password
  app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
      const userSnapshot = await db.collection('users').where('email', '==', email).get();
      
      if (!userSnapshot.empty) {
        const token = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour
        
        const now = new Date().toISOString();
        await db.collection('password_resets').add({
          email,
          token: hashedToken,
          expires_at: expiresAt,
          created_at: now,
          updated_at: now
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const resetLink = `${frontendUrl}/reset-password?token=${token}`;
        
        emailService.sendPasswordRecoveryEmail(email, resetLink);
      }
      
      res.json({ message: 'Se o e-mail existir, um link foi enviado.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset Password
  app.post('/api/auth/reset-password', async (req, res) => {
    const { token, password } = req.body;
    try {
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      const resetSnapshot = await db.collection('password_resets').where('token', '==', hashedToken).get();
      
      if (resetSnapshot.empty) return res.status(400).json({ error: 'Token inválido ou expirado' });
      
      const resetDoc = resetSnapshot.docs[0];
      const resetData = resetDoc.data();
      
      if (new Date(resetData.expires_at) < new Date()) {
        await resetDoc.ref.delete();
        return res.status(400).json({ error: 'Token expirado' });
      }
      
      const userSnapshot = await db.collection('users').where('email', '==', resetData.email).get();
      if (userSnapshot.empty) return res.status(400).json({ error: 'Usuário não encontrado' });
      
      const userId = userSnapshot.docs[0].id;
      
      // Update password in Firebase Auth
      await auth.updateUser(userId, {
        password: password
      });
      
      // Delete used token
      await resetDoc.ref.delete();
      
      res.json({ message: 'Senha redefinida com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // Google OAuth Login/Register (Profile Sync)
  app.post('/api/auth/google-sync', authenticateToken, async (req: any, res) => {
    const { name } = req.body;
    try {
      const userDoc = await db.collection('users').doc(req.user.id).get();
      
      if (!userDoc.exists) {
        // Create new user profile
        const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.replace(/['"]/g, '') : null;
        const role = (req.user.email === adminEmail ? 'admin' : 'client') as 'admin' | 'pharmacy' | 'client';
        const now = new Date().toISOString();
        
        await db.collection('users').doc(req.user.id).set({
          email: req.user.email,
          name: name || '',
          role: role,
          created_at: now,
          updated_at: now
        });
        
        if (role === 'pharmacy') {
          // Create pharmacy profile only for pharmacies
          const pharmacyId = uuidv4();
          await db.collection('pharmacies').doc(pharmacyId).set({
            user_id: req.user.id,
            name: name || 'Farmácia',
            phone: '',
            whatsapp: '',
            email: req.user.email,
            website: '',
            street: '',
            number: '',
            neighborhood: '',
            city: '',
            state: '',
            zip: '',
            is_active: 0,
            created_at: now,
            updated_at: now
          });
          
          // Create pending subscription
          await db.collection('subscriptions').add({
            pharmacy_id: pharmacyId,
            status: 'pending',
            expires_at: null,
            created_at: now,
            updated_at: now
          });
          
          // Send welcome email
          emailService.sendWelcomeEmail(req.user.email, name || 'Farmácia');
        }
      } else {
        // Check if existing user needs admin upgrade
        const userData = userDoc.data();
        const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.replace(/['"]/g, '') : null;
        if (adminEmail && req.user.email === adminEmail && userData?.role !== 'admin') {
          await db.collection('users').doc(req.user.id).update({
            role: 'admin',
            updated_at: new Date().toISOString()
          });
        }
      }

      const finalUserDoc = await db.collection('users').doc(req.user.id).get();
      const finalUserData = finalUserDoc.data();

      res.json({ 
        success: true, 
        user: { 
          id: req.user.id, 
          ...finalUserData 
        } 
      });
    } catch (err: any) {
      console.error('Google Sync Error:', err);
      res.status(500).json({ error: 'Falha ao sincronizar perfil' });
    }
  });

  // Register Pharmacy
  app.post('/api/auth/register', authenticateToken, async (req: any, res) => {
    const { email, pharmacyData } = req.body;
    
    try {
      const userId = req.user.uid;
      const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.replace(/['"]/g, '') : null;
      const role = (adminEmail && email === adminEmail) ? 'admin' : 'pharmacy';
      const now = new Date().toISOString();
      
      await db.collection('users').doc(userId).set({
        email,
        role: role,
        created_at: now,
        updated_at: now
      });
      
      if (role === 'pharmacy') {
        const pharmacyId = uuidv4();
        const { name, phone, whatsapp, website, street, number, neighborhood, city, state, zip } = pharmacyData;
        
        await db.collection('pharmacies').doc(pharmacyId).set({
          user_id: userId,
          name,
          phone,
          whatsapp,
          email,
          website: website || '',
          street,
          number,
          neighborhood,
          city,
          state,
          zip,
          is_active: 0,
          created_at: now,
          updated_at: now
        });
        
        await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          status: 'active',
          plan_type: 'extra_1776642077763', // Plano Gratuito
          expires_at: null,
          created_at: now,
          updated_at: now
        });

        // Set pharmacy as active by default for free plan
        await db.collection('pharmacies').doc(pharmacyId).update({ 
          is_active: 1, 
          subscription_active: true,
          sub_status: 'active'
        });

        // Send welcome email
        emailService.sendWelcomeEmail(email, name);
      }
      
      res.status(201).json({ message: 'Pharmacy registered successfully', uid: userId });
    } catch (error: any) {
      console.error('Register Error:', error);
      res.status(500).json({ error: error.message || 'Server error' });
    }
  });

  // Public: Get Pharmacies by City/State
  app.get('/api/public/pharmacies', async (req, res) => {
    const { city, state, name, cep } = req.query;
    try {
      let pharmaciesQuery = db.collection('pharmacies').where('is_active', '==', 1);

      if (city && state) {
        pharmaciesQuery = pharmaciesQuery.where('city', '==', city).where('state', '==', state);
      }
      
      const snapshot = await pharmaciesQuery.get();
      let pharmacies = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      
      if (name) {
        pharmacies = pharmacies.filter((p: any) => 
          p.name.toLowerCase().includes((name as string).toLowerCase())
        );
      }

      if (cep) {
        const cleanSearchCep = (cep as string).replace(/\D/g, '').substring(0, 5);
        pharmacies = pharmacies.filter((p: any) => {
          const pharmCep = (p.cep || p.zip || '').replace(/\D/g, '').substring(0, 5);
          return pharmCep === cleanSearchCep;
        });
      }

      res.json(pharmacies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Get On-Call Pharmacies (Plantões de Hoje)
  app.get('/api/public/on-call', async (req, res) => {
    const { city, state, cep } = req.query;
    try {
      // Robust date generation for Brazil (YYYY-MM-DD)
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      
      console.log(`[API] On-call request: today=${today}, city=${city}, state=${state}, cep=${cep}`);

      // Optimized strategy
      let pharmaciesSnapshot;
      try {
        let pharmaciesQuery = db.collection('pharmacies').where('is_active', '==', 1);
        if (city && state && !cep) {
          // Note: This may require a composite index (is_active, city, state)
          // If it fails, the catch block will fallback to a safer query
          pharmaciesQuery = pharmaciesQuery.where('city', '==', city as string).where('state', '==', state as string);
        }
        pharmaciesSnapshot = await pharmaciesQuery.get();
      } catch (idxError: any) {
        console.warn('[API Warning] Optimized pharmacy query failed (likely missing index), falling back to broad query:', idxError.message);
        pharmaciesSnapshot = await db.collection('pharmacies').where('is_active', '==', 1).get();
      }

      const [shiftsSnapshot] = await Promise.all([
        db.collection('shifts').where('date', '==', today).get()
      ]);
      
      const pharmaciesMap = new Map(pharmaciesSnapshot.docs.map(doc => [doc.id, doc.data()]));
      const onCallPharmacies = [];
      const cleanSearchCep = cep ? (cep as string).replace(/\D/g, '').substring(0, 5) : null;

      for (const shiftDoc of shiftsSnapshot.docs) {
        const shift = shiftDoc.data();
        const pharmacy = pharmaciesMap.get(shift.pharmacy_id) as any;
        
        if (pharmacy) {
          // If we didn't filter by city/state in query (e.g. searching by name or CEP), filter here
          if (city && state && !cep) { 
             const pCity = pharmacy.city || '';
             const pState = pharmacy.state || '';
             if (pCity.toLowerCase() !== (city as string).toLowerCase() || 
                 pState.toLowerCase() !== (state as string).toLowerCase()) {
               continue;
             }
          }

          if (cleanSearchCep) {
            const pharmCep = (pharmacy.cep || pharmacy.zip || '').replace(/\D/g, '').substring(0, 5);
            if (pharmCep !== cleanSearchCep) continue;
          }
          
          onCallPharmacies.push({
            id: shift.pharmacy_id,
            ...(pharmacy as any),
            shift: {
              start_time: shift.start_time,
              end_time: shift.end_time,
              is_24h: shift.is_24h
            }
          });
        }
      }

      res.setHeader('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
      res.json(onCallPharmacies);
    } catch (err: any) {
      console.error('[API Error] On-call fetch failure:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // Public: Get Highlights
  app.get('/api/public/highlights', async (req, res) => {
    const { city, state, cep } = req.query;
    const now = new Date().toISOString();
    
    try {
      const [highlightsSnapshot, pharmaciesSnapshot] = await Promise.all([
        db.collection('highlights').where('date_start', '<=', now).get(),
        db.collection('pharmacies').where('is_active', '==', 1).get()
      ]);

      const pharmaciesMap = new Map(pharmaciesSnapshot.docs.map(doc => [doc.id, doc.data()]));
      const highlights = highlightsSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((h: any) => h.date_end >= now);
      
      const cleanSearchCep = cep ? (cep as string).replace(/\D/g, '').substring(0, 5) : null;

      const result = [];
      for (const h of highlights) {
        if (city && state && !cep) {
          if (h.city.toLowerCase() !== (city as string).toLowerCase() || 
              h.state.toLowerCase() !== (state as string).toLowerCase()) {
            continue;
          }
        }

        const p = pharmaciesMap.get(h.pharmacy_id);
        
        if (p) {
          if (cleanSearchCep) {
             const pharmCep = (p.cep || (p as any).zip || '').replace(/\D/g, '').substring(0, 5);
             if (pharmCep !== cleanSearchCep) continue;
          }

          result.push({ 
            ...h, 
            name: p.name, 
            phone: p.phone, 
            whatsapp: p.whatsapp, 
            street: p.street, 
            number: p.number, 
            neighborhood: p.neighborhood, 
            city: p.city, 
            state: p.state 
          });
        }
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Register Click
  app.post('/api/public/pharmacies/:id/click', async (req, res) => {
    const { id } = req.params;
    const { type } = req.body; // 'whatsapp' or 'map'
    
    try {
      const now = new Date().toISOString();
      const clickData = {
        pharmacy_id: id,
        type,
        created_at: now,
        updated_at: now
      };

      // Perform updatesatomically
      const batch = db.batch();
      const clickRef = db.collection('clicks').doc();
      batch.set(clickRef, clickData);

      const pharmacyRef = db.collection('pharmacies').doc(id);
      batch.update(pharmacyRef, {
        [`${type}_clicks`]: admin.firestore.FieldValue.increment(1),
        updated_at: now
      });

      await batch.commit();
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Get Mercado Pago Config (Public Key)
  app.get('/api/public/mercadopago-config', async (req, res) => {
    try {
      const configDoc = await db.collection('config').doc('mercadopago').get();
      const config = configDoc.data();
      res.json({
        public_key: config?.public_key || process.env.VITE_MERCADOPAGO_PUBLIC_KEY || ''
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Get Subscription Plans
  app.get('/api/public/subscription-plans', async (req, res) => {
    try {
      const plansDoc = await db.collection('config').doc('subscription_plans').get();
      if (!plansDoc.exists) {
        return res.json({
          monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months' },
          annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years' }
        });
      }
      res.json(plansDoc.data());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Get Profile
  app.get('/api/pharmacy/profile', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyDoc = pharmacySnapshot.docs[0];
      const pharmacy = { id: pharmacyDoc.id, ...pharmacyDoc.data() };
      
      const subsSnapshot = await db.collection('subscriptions').where('pharmacy_id', '==', pharmacy.id).get();
      const subs = subsSnapshot.docs.map(doc => doc.data());
      // Sort by created_at descending to get latest
      subs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const sub = subs[0];
      
      res.json({ ...pharmacy, subscription: sub });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Update Profile
  app.put('/api/pharmacy/profile', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyDoc = pharmacySnapshot.docs[0];
      const { name, phone, whatsapp, street, number, neighborhood, city, state } = req.body;
      
      const updatedData = {
        name, phone, whatsapp, street, number, neighborhood, city, state,
        updated_at: new Date().toISOString()
      };
      
      await db.collection('pharmacies').doc(pharmacyDoc.id).update(updatedData);
      
      res.json({ id: pharmacyDoc.id, ...pharmacyDoc.data(), ...updatedData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Get Highlights
  app.get('/api/pharmacy/highlights', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const highlightsSnapshot = await db.collection('highlights').where('pharmacy_id', '==', pharmacyId).get();
      const highlights = highlightsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(highlights);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Get Payments
  app.get('/api/pharmacy/payments', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const paymentsSnapshot = await db.collection('payments').where('pharmacy_id', '==', pharmacyId).get();
      const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(payments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Get Reports
  app.get('/api/pharmacy/reports', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const clicksSnapshot = await db.collection('clicks').where('pharmacy_id', '==', pharmacyId).get();
      const clicks = clicksSnapshot.docs.map(doc => doc.data());
      
      // Aggregate clicks by day for the last 30 days
      const last30Days = [...Array(30)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();

      const dailyClicks = last30Days.map(date => {
        const dayClicks = clicks.filter((c: any) => c.created_at.startsWith(date));
        return {
          date: date.split('-').reverse().slice(0, 2).join('/'), // DD/MM
          whatsapp: dayClicks.filter((c: any) => c.type === 'whatsapp').length,
          map: dayClicks.filter((c: any) => c.type === 'map').length
        };
      });

      res.json({ dailyClicks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Get Shifts
  app.get('/api/pharmacy/shifts', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const shiftsSnapshot = await db.collection('shifts').where('pharmacy_id', '==', pharmacyId).get();
      const shifts = shiftsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(shifts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Create Shift
  app.post('/api/pharmacy/shifts', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const { date, start_time, end_time, is_24h } = req.body;
      
      const newShift = {
        pharmacy_id: pharmacyId,
        date,
        start_time: is_24h ? '00:00' : start_time,
        end_time: is_24h ? '23:59' : end_time,
        is_24h: is_24h ? 1 : 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const docRef = await db.collection('shifts').add(newShift);
      res.status(201).json({ id: docRef.id, ...newShift });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Update Shift
  app.put('/api/pharmacy/shifts/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const shiftDoc = await db.collection('shifts').doc(req.params.id).get();
      
      if (!shiftDoc.exists || shiftDoc.data()?.pharmacy_id !== pharmacyId) {
        return res.status(404).json({ error: 'Shift not found' });
      }
      
      const { date, start_time, end_time, is_24h } = req.body;
      
      const updatedData = {
        date,
        start_time: is_24h ? '00:00' : start_time,
        end_time: is_24h ? '23:59' : end_time,
        is_24h: is_24h ? 1 : 0,
        updated_at: new Date().toISOString()
      };
      
      await db.collection('shifts').doc(req.params.id).update(updatedData);
      res.json({ id: req.params.id, ...shiftDoc.data(), ...updatedData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Delete Shift
  app.delete('/api/pharmacy/shifts/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const shiftDoc = await db.collection('shifts').doc(req.params.id).get();
      
      if (!shiftDoc.exists || shiftDoc.data()?.pharmacy_id !== pharmacyId) {
        return res.status(404).json({ error: 'Shift not found' });
      }
      
      await db.collection('shifts').doc(req.params.id).delete();
      res.json({ message: 'Shift deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Subscriptions: Create Subscription (Recurrent)
  app.post('/api/subscriptions/create', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });

    try {
      const { card_token, email, payment_method_id, installments = 1, identificationType, identificationNumber, planType = 'annual' } = req.body;
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyDoc = pharmacySnapshot.docs[0];
      const pharmacyData = pharmacyDoc.data();
      const pharmacyId = pharmacyDoc.id;

      // Fetch dynamic plan config
      const plansDoc = await db.collection('config').doc('subscription_plans').get();
      const plansData = plansDoc.exists ? plansDoc.data() : {
        monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months' },
        annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years' }
      };
      const planConfig = (plansData as any)[planType];
      if (!planConfig || !planConfig.active) {
         return res.status(400).json({ error: 'Plano selecionado não está disponível.' });
      }

      // Handle Free Plan bypass
      if (planConfig.price === 0) {
        const now = new Date().toISOString();
        const nextBilling = calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'years');
        
        await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          status: 'active',
          plan_type: planType,
          amount: 0,
          created_at: now,
          updated_at: now,
          expires_at: nextBilling,
          next_billing_date: nextBilling
        });

        await db.collection('pharmacies').doc(pharmacyId).update({
          is_active: 1,
          subscription_active: true,
          sub_status: 'active',
          updated_at: now
        });

        await updateDashboardStats();
        return res.json({ success: true, message: 'Plano gratuito ativado!' });
      }

      const { customerClient, preApprovalClient, isMock } = await getMPClient();

      // 1. Ensure Customer exists (Optionally stored in MP)
      let customerId = pharmacyData.mp_customer_id;
      if (!customerId && !isMock) {
        try {
          const customer = await customerClient.create({
            body: {
              email: email || pharmacyData.email,
              first_name: pharmacyData.name.split(' ')[0],
              last_name: pharmacyData.name.split(' ').slice(1).join(' ') || 'Farmácia',
              identification: {
                type: identificationType || 'CPF',
                number: identificationNumber
              }
            }
          });
          customerId = customer?.id;
          if (customerId) {
            await db.collection('pharmacies').doc(pharmacyId).update({ mp_customer_id: customerId });
          }
        } catch (e: any) {
          console.warn(`Note: MP Customer creation failed (${e.message}). Attempting fallback search...`);
          try {
            const customerEmail = email || pharmacyData.email;
            const searchResult = await customerClient.search({ options: { email: customerEmail } });
            
            if (searchResult && searchResult.results && searchResult.results.length > 0) {
              customerId = searchResult.results[0].id;
              if (customerId) {
                await db.collection('pharmacies').doc(pharmacyId).update({ mp_customer_id: customerId });
                console.log(`Fallback successful: Linked existing MP Customer ${customerId} to Pharmacy ${pharmacyId}`);
              }
            } else {
              console.warn('Fallback search yielded no results for email:', customerEmail);
            }
          } catch (searchError: any) {
             console.error('Fallback customer search also failed:', searchError.message);
          }
        }
      }

      // 2. Create PreApproval (Subscription)
      const now = new Date();
      const endYear = addYears(now, 1);
      
      const appUrl = process.env.APP_URL || 'https://farmaciasdeplantao.app.br';
      
      const preApprovalBody: any = {
        back_url: `${appUrl}/pharmacy`,
        reason: `${planConfig.title} - Farmácia de Plantão Brasil`,
        notification_url: `${appUrl}/webhooks`,
        auto_recurring: {
          frequency: planConfig.frequency,
          frequency_type: planConfig.frequency_type, // 'months' | 'years'
          transaction_amount: planConfig.price,
          currency_id: 'BRL',
          // Free trial or initial payment logic can go here
        },
        payer_email: email || pharmacyData.email,
        status: 'pending'
      };

      // If we have a card token, we can try to finalize it
      if (card_token) {
        preApprovalBody.card_token_id = card_token;
        preApprovalBody.status = 'authorized'; 
      }

      let subscriptionResponse: any;
      try {
        if (isMock) throw new Error('mock_mode');
        subscriptionResponse = await preApprovalClient.create({ body: preApprovalBody });
      } catch (subError: any) {
        if (isMock || subError.message === 'mock_mode') {
          subscriptionResponse = {
            id: 'sub_' + uuidv4().substring(0, 8),
            status: 'pending', // Do not automatically authorize in mock mode
            reason: preApprovalBody.reason,
            init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=mock'
          };
        } else {
          console.error('Mercado Pago API Subscription Error:', subError.message || subError);
          const formatted = formatMPError(subError);
          return res.status(subError.status || 500).json({ 
            error: formatted.message, 
            details: formatted.details 
          });
        }
      }

      // 3. Save to Firestore
      const subData = {
        pharmacy_id: pharmacyId,
        mp_preapproval_id: subscriptionResponse.id,
        status: subscriptionResponse.status === 'authorized' ? 'active' : 'pending',
        amount: planConfig.price,
        plan_type: planType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        next_billing_date: calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'months'),
        init_point: subscriptionResponse.init_point
      };

      await db.collection('subscriptions').add(subData);

      // If authorized, activate pharmacy
      if (subData.status === 'active') {
        await db.collection('pharmacies').doc(pharmacyId).update({
          is_active: 1,
          subscription_active: true
        });
      }

      res.json({
        success: true,
        subscription_id: subscriptionResponse.id,
        status: subData.status,
        init_point: subscriptionResponse.init_point
      });

    } catch (err: any) {
      console.error('Error creating subscription:', err);
      res.status(500).json({ error: 'Erro ao processar assinatura: ' + err.message });
    }
  });

  // Pharmacy: Cancel Subscription voluntarily
  app.delete('/api/subscriptions/cancel', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });

    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      
      const pharmacyDoc = pharmacySnapshot.docs[0];
      const pharmacyId = pharmacyDoc.id;

      // Find active subscription
      const subSnapshot = await db.collection('subscriptions')
        .where('pharmacy_id', '==', pharmacyId)
        .where('status', 'in', ['active', 'pending', 'authorized'])
        .get();

      if (subSnapshot.empty) {
        return res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada para cancelar.' });
      }

      const activeSubDoc = subSnapshot.docs[0];
      const activeSub = activeSubDoc.data();

      // Cancel in Mercado Pago if managed by them
      if (activeSub.mp_preapproval_id && !activeSub.mp_preapproval_id.startsWith('sub_mock') && activeSub.mp_preapproval_id !== 'mock') {
        const { preApprovalClient, isMock } = await getMPClient();
        if (!isMock) {
          try {
            await preApprovalClient.update({
              id: activeSub.mp_preapproval_id,
              body: { status: 'cancelled' }
            });
          } catch (mpError: any) {
            console.error('Error cancelling sub in MP:', mpError.message);
            // We ignore if it's already cancelled in MP to unblock the user locally
            if (mpError.status !== 400 && mpError.status !== 404) {
              const formatted = formatMPError(mpError);
              return res.status(mpError.status || 500).json({ 
                error: 'Erro no MercadoPago ao cancelar: ' + formatted.message,
                details: formatted.details
              });
            }
          }
        }
      }

      const now = new Date().toISOString();

      // Deactivate Sub
      await db.collection('subscriptions').doc(activeSubDoc.id).update({
        status: 'cancelled',
        updated_at: now
      });

      // Deactivate Pharmacy
      await db.collection('pharmacies').doc(pharmacyId).update({
        is_active: 0,
        subscription_active: false,
        sub_status: 'cancelled',
        updated_at: now
      });

      res.json({ success: true, message: 'Assinatura cancelada com sucesso.' });
    } catch (err: any) {
      console.error('Error in /api/subscriptions/cancel:', err);
      res.status(500).json({ error: 'Erro ao cancelar assinatura: ' + err.message });
    }
  });

  // Pharmacy: Update Subscription Card Token
  app.put('/api/subscriptions/update-card', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });

    try {
      const { card_token } = req.body;
      if (!card_token) return res.status(400).json({ error: 'Token do cartão não fornecido.' });

      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      const pharmacyId = pharmacySnapshot.docs[0].id;

      // Find active subscription
      const subSnapshot = await db.collection('subscriptions')
        .where('pharmacy_id', '==', pharmacyId)
        .where('status', 'in', ['active', 'pending'])
        .get();

      if (subSnapshot.empty) {
        return res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada para atualizar o cartão.' });
      }

      // Filter sub with MP preapproval
      let activeSub = null;
      let activeSubDocId = null;
      for (const doc of subSnapshot.docs) {
        const data = doc.data();
        if (data.mp_preapproval_id && !data.mp_preapproval_id.startsWith('sub_mock') && data.mp_preapproval_id !== 'mock') {
          activeSub = data;
          activeSubDocId = doc.id;
          break;
        }
      }

      if (!activeSub) {
         return res.status(400).json({ error: 'Assinatura atual não é gerenciada pelo Mercado Pago.' });
      }

      const { preApprovalClient, isMock } = await getMPClient();
      if (isMock) {
        return res.json({ success: true, message: 'Cartão atualizado (modo mock).' });
      }

      try {
        await preApprovalClient.update({
          id: activeSub.mp_preapproval_id,
          body: { card_token_id: card_token }
        });
      } catch (mpError: any) {
        console.error('Error updating card in Mercado Pago:', mpError.message);
        const formatted = formatMPError(mpError);
        return res.status(mpError.status || 500).json({ 
          error: formatted.message,
          details: formatted.details
        });
      }

      // Update timestamp
      await db.collection('subscriptions').doc(activeSubDocId).update({
        updated_at: new Date().toISOString()
      });

      res.json({ success: true, message: 'Cartão atualizado com sucesso.' });
    } catch (err: any) {
      console.error('Error in /api/subscriptions/update-card:', err);
      res.status(500).json({ error: 'Erro ao analisar atualização de cartão: ' + err.message });
    }
  });

  // Pharmacy: Upgrade/Downgrade Subscription
  app.put('/api/subscriptions/update', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const { planType, card_token, email, identificationType, identificationNumber } = req.body;
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      const pharmacyId = pharmacySnapshot.docs[0].id;

      // 2. Create NEW
      const plansDoc = await db.collection('config').doc('subscription_plans').get();
      const plansData = plansDoc.exists ? plansDoc.data() : {
        monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months' },
        annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years' }
      };
      const planConfig = (plansData as any)[planType];
      if (!planConfig || !planConfig.active) return res.status(400).json({ error: 'Plano selecionado não disponível' });

      // Handle Free Plan bypass for updates
      if (planConfig.price === 0) {
        const now = new Date().toISOString();
        const nextBilling = calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'months');
        
        const newSubRef = await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          status: 'active',
          plan_type: planType,
          amount: 0,
          created_at: now,
          updated_at: now,
          expires_at: nextBilling,
          next_billing_date: nextBilling
        });

        await db.collection('pharmacies').doc(pharmacyId).update({
          is_active: 1,
          subscription_active: true,
          sub_status: 'active',
          updated_at: now
        });

        await cancelExistingSubscriptions(pharmacyId, newSubRef.id);

        await updateDashboardStats();
        return res.json({ success: true, message: 'Plano gratuito ativado!' });
      }

      const { preApprovalClient, isMock } = await getMPClient();
      const appUrl = process.env.APP_URL || 'https://farmaciasdeplantao.app.br';

      const preApprovalBody: any = {
        back_url: `${appUrl}/pharmacy`,
        reason: `${planConfig.title} (Troca) - Farmácia de Plantão Brasil`,
        notification_url: `${appUrl}/webhooks`,
        auto_recurring: {
          frequency: planConfig.frequency,
          frequency_type: planConfig.frequency_type,
          transaction_amount: planConfig.price,
          currency_id: 'BRL',
        },
        payer_email: email || pharmacySnapshot.docs[0].data().email,
        status: card_token ? 'authorized' : 'pending'
      };
      if (card_token) preApprovalBody.card_token_id = card_token;

      let subscriptionResponse: any;
      try {
        if (isMock) throw new Error('mock_mode');
        subscriptionResponse = await preApprovalClient.create({ body: preApprovalBody });
      } catch (e: any) {
        if (isMock || e.message === 'mock_mode') {
          subscriptionResponse = {
            id: 'sub_' + uuidv4().substring(0, 8),
            status: card_token ? 'authorized' : 'pending',
            reason: preApprovalBody.reason,
            init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=mock'
          };
        } else {
          console.error('Mercado Pago API Upgrade Error:', e.message || e);
          return res.status(e.status || 500).json({ 
            error: 'Erro na API do Mercado Pago ao atualizar', 
            details: e.message || 'Falha ao processar troca de plano real.' 
          });
        }
      }

      const subData = {
        pharmacy_id: pharmacyId,
        mp_preapproval_id: subscriptionResponse.id,
        status: subscriptionResponse.status === 'authorized' ? 'active' : 'pending',
        amount: planConfig.price,
        plan_type: planType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        next_billing_date: calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'months'),
        init_point: subscriptionResponse.init_point
      };

      const newSubRef = await db.collection('subscriptions').add(subData);

      if (subData.status === 'active') {
        await db.collection('pharmacies').doc(pharmacyId).update({ is_active: 1, subscription_active: true });
      }

      // 3. Cancel OLD only if NEW was created pointing correctly to the new database entry ID
      await cancelExistingSubscriptions(pharmacyId, newSubRef.id);

      res.json({
        success: true,
        message: 'Plano atualizado. Por favor, conclua o pagamento se necessário.',
        subscription_id: subscriptionResponse.id,
        init_point: subscriptionResponse.init_point
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Payments: Generate Pix
  app.post('/api/payments/pix', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const { planType = 'annual' } = req.body;
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      const pharmacy = pharmacySnapshot.docs[0].data();
      const pharmacyId = pharmacySnapshot.docs[0].id;

      // Fetch dynamic plan config
      const plansDoc = await db.collection('config').doc('subscription_plans').get();
      const plansData = plansDoc.exists ? plansDoc.data() : {
        monthly: { active: true, price: 6.90, title: 'Plano Mensal' },
        annual: { active: true, price: 69.96, title: 'Plano Anual' }
      };
      const planConfig = (plansData as any)[planType];
      if (!planConfig || !planConfig.active) {
         return res.status(400).json({ error: 'Plano selecionado não está disponível.' });
      }

      let paymentResponse: any = null;
      const transactionAmount = planConfig.price;
      const idempotencyKey = uuidv4();

      const expirationDate = new Date();
      expirationDate.setMinutes(expirationDate.getMinutes() + 30);
      const isoExpiration = expirationDate.toISOString();

      const { paymentClient, isMock } = await getMPClient();
      const appUrl = process.env.APP_URL || 'https://farmaciasdeplantao.app.br';

      try {
        if (isMock) throw new Error('mock_mode');
        paymentResponse = await paymentClient.create({
          body: {
            transaction_amount: transactionAmount,
            description: `${planConfig.title} - Farmácia de Plantão Brasil`,
            payment_method_id: 'pix',
            date_of_expiration: isoExpiration,
            notification_url: `${appUrl}/webhooks`,
            payer: {
              email: pharmacy.email,
              first_name: pharmacy.name.split(' ')[0],
              last_name: pharmacy.name.split(' ').slice(1).join(' ') || 'Farmácia'
            }
          },
          requestOptions: { idempotencyKey }
        });
      } catch (mpError: any) {
        if (isMock || mpError.message === 'mock_mode') {
          paymentResponse = {
            id: Math.floor(Math.random() * 1000000000),
            status: 'pending',
            point_of_interaction: {
              transaction_data: {
                qr_code: '00020101021126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426655440000520400005303986540569.965802BR5913FARMACIA TESTE6008BRASILIA62070503***63041D3D',
                qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
              }
            }
          };
        } else {
          console.error('Mercado Pago API PIX Error:', mpError.message || mpError);
          const formatted = formatMPError(mpError);
          return res.status(mpError.status || 500).json({ 
            error: formatted.message, 
            details: formatted.details 
          });
        }
      }

      const mpPaymentId = paymentResponse.id.toString();

      // Save payment intent
      const now = new Date().toISOString();
      await db.collection('payments').add({
        pharmacy_id: pharmacyId,
        amount: transactionAmount,
        method: 'pix',
        plan_type: planType, // Added plan_type
        status: 'pending',
        mp_payment_id: mpPaymentId,
        created_at: now,
        updated_at: now
      });

      res.json({
        payment_id: mpPaymentId,
        qr_code: paymentResponse.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: paymentResponse.point_of_interaction?.transaction_data?.qr_code_base64
      });

    } catch (err: any) {
      console.error('Error generating Pix:', err);
      res.status(500).json({ error: 'Erro ao gerar pagamento Pix' });
    }
  });

  // Webhook: Receive Mercado Pago Notifications
  app.post('/webhooks', express.json(), async (req, res) => {
    // 1. Signature Validation (Security)
    const xSignature = req.headers['x-signature'] as string;
    const xRequestId = req.headers['x-request-id'] as string;
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

    if (xSignature && xRequestId && secret) {
      try {
        const parts = xSignature.split(',');
        let ts = '';
        let hash = '';
        parts.forEach(part => {
          const [key, value] = part.split('=');
          if (key.trim() === 'ts') ts = value;
          if (key.trim() === 'v1') hash = value;
        });

        // For Mercado Pago signature v1: 
        // id : event_id or data.id from url parameters
        const urlParams = new URLSearchParams(req.query as any);
        const dataId = urlParams.get('data.id') || req.body.data?.id || req.query.id;
        
        if (ts && hash && dataId) {
          const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
          const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
          
          if (hmac !== hash) {
            console.error('Invalid Webhook Signature. Expected:', hash, 'Got:', hmac);
            return res.status(403).json({ error: 'Invalid Signature' });
          }
        }
      } catch (e) {
        console.error('Error validating webhook signature', e);
        // Continue processing in development if validation errors out 
      }
    } else {
      console.warn('Webhook received without X-Signature headers or Webhook Secret missing in .env. Processing as unverified.');
    }

    // Send immediate 200 OK to Mercado Pago to prevent Timeout/Retries
    res.status(200).json({ success: true, message: 'Webhook received and queued for processing' });

    // Run processing asynchronously
    (async () => {
      const { type, action, data } = req.body;
      const eventId = req.query.id || req.body.id; // Mercado Pago sends ID in query or body depending on event
      
      // 2. Handle standard payment events (Pix, single cards)
      if (type === 'payment' && data && data.id) {
        try {
          const paymentId = data.id.toString();
          // Use the API client to physically verify the payment status to further prevent spoofing
          const { paymentClient } = await getMPClient();
          const verifiedPayment = await paymentClient.get({ id: paymentId });
          
          const paymentsSnapshot = await db.collection('payments').where('mp_payment_id', '==', paymentId).get();
          if (!paymentsSnapshot.empty) {
            const paymentDoc = paymentsSnapshot.docs[0];
            const localPayment = paymentDoc.data();
            
            if (localPayment.status !== verifiedPayment.status) {
              await db.collection('payments').doc(paymentDoc.id).update({
                status: verifiedPayment.status,
                updated_at: new Date().toISOString()
              });

              if (verifiedPayment.status === 'approved') {
                const pharmacyId = localPayment.pharmacy_id;
                const planType = localPayment.plan_type || 'annual';

                // Fetch dynamic plan config to know duration
                const plansDoc = await db.collection('config').doc('subscription_plans').get();
                const plansData = plansDoc.exists ? plansDoc.data() : {
                  monthly: { frequency: 1, frequency_type: 'months' },
                  annual: { frequency: 1, frequency_type: 'years' }
                };
                const planConfig = (plansData as any)[planType] || { frequency: 1, frequency_type: 'years' };

                let expiresAt = new Date();
                if (planConfig.frequency_type === 'years') {
                  expiresAt = addYears(expiresAt, planConfig.frequency || 1);
                } else if (planConfig.frequency_type === 'months') {
                  expiresAt = addMonths(expiresAt, planConfig.frequency || 1);
                } else {
                  expiresAt = addDays(expiresAt, planConfig.frequency || 30);
                }
                
                // 1. Cancel ANY other existing active/pending subscription to ensure only the new one is active
                await cancelExistingSubscriptions(pharmacyId);

                // We create a NEW one for fixed durations like PIX
                await db.collection('subscriptions').add({
                  pharmacy_id: pharmacyId,
                  status: 'active',
                  plan_type: planType,
                  expires_at: expiresAt.toISOString(),
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });

                // Ensure pharmacy is active
                const pharmDoc = await db.collection('pharmacies').doc(pharmacyId).get();
                if (pharmDoc.exists) {
                  await db.collection('pharmacies').doc(pharmacyId).update({ 
                    is_active: 1,
                    sub_status: 'active',
                    subscription_active: true,
                    updated_at: new Date().toISOString()
                  });
                  emailService.sendPaymentApprovedEmail(pharmDoc.data()?.email, pharmDoc.data()?.name);
                }

                await updateDashboardStats();
                console.log(`Payment ${paymentId} verified and approved. Pharmacy ${pharmacyId} activated.`);
              } else if (verifiedPayment.status === 'refunded' || verifiedPayment.status === 'charged_back' || verifiedPayment.status === 'rejected') {
                const pharmacyId = localPayment.pharmacy_id;
                
                // Handle refund/chargeback/reject: cancel subscriptions and deactivate profile.
                // Note: 'cancelled' (e.g., abandoned Pix) is intentionally ignored to prevent 'Morte Súbita' of active subs.
                await cancelExistingSubscriptions(pharmacyId);
                
                const pharmDoc = await db.collection('pharmacies').doc(pharmacyId).get();
                if (pharmDoc.exists) {
                  await db.collection('pharmacies').doc(pharmacyId).update({ 
                    is_active: 0,
                    sub_status: 'cancelled',
                    subscription_active: false,
                    updated_at: new Date().toISOString()
                  });
                  emailService.sendSubscriptionCancelledEmail(pharmDoc.data()?.email, pharmDoc.data()?.name);
                }
                await updateDashboardStats();
                console.log(`Payment ${paymentId} ${verifiedPayment.status}. Pharmacy ${pharmacyId} deactivated.`);
              }
            }
          }
        } catch (err) {
          console.error('Webhook processing error (Payment):', err);
        }
      }

      // 3. Handle Subscription PreApproval events
      if (type === 'subscription_preapproval' || action === 'created' || action === 'updated') {
        const preApprovalId = data?.id || eventId;
        if (preApprovalId) {
          try {
            const { preApprovalClient } = await getMPClient();
            const verifiedSub = await preApprovalClient.get({ id: preApprovalId });
            
            if (verifiedSub && verifiedSub.id) {
              const subsSnapshot = await db.collection('subscriptions').where('mp_preapproval_id', '==', verifiedSub.id).get();
              if (!subsSnapshot.empty) {
                 const subDoc = subsSnapshot.docs[0];
                 const currentStatus = subDoc.data().status;
                 let newStatus = 'pending';
                 if (verifiedSub.status === 'authorized') newStatus = 'active';
                 else if (verifiedSub.status === 'cancelled') newStatus = 'cancelled';
                 else if (verifiedSub.status === 'paused') newStatus = 'paused';
                 else if (verifiedSub.status === 'suspended') newStatus = 'suspended';

                 if (currentStatus !== newStatus || verifiedSub.status === 'cancelled') {
                   await db.collection('subscriptions').doc(subDoc.id).update({
                     status: newStatus,
                     next_billing_date: verifiedSub.next_payment_date || null,
                     updated_at: new Date().toISOString()
                   });

                   const pharmDocRef = db.collection('pharmacies').doc(subDoc.data().pharmacy_id);
                   const pharmDoc = await pharmDocRef.get();
                   
                   if (pharmDoc.exists) {
                     const email = pharmDoc.data()?.email;
                     const name = pharmDoc.data()?.name;

                     if (newStatus === 'active') {
                        await pharmDocRef.update({ 
                          is_active: 1, 
                          subscription_active: true,
                          sub_status: 'active',
                          updated_at: new Date().toISOString()
                        });
                        emailService.sendSubscriptionActiveEmail(email, name);
                        console.log(`Subscription ${verifiedSub.id} activated pharmacy ${subDoc.data().pharmacy_id}`);
                     } else if (newStatus === 'pending') {
                        emailService.sendSubscriptionFailedEmail(email, name);
                     } else if (newStatus === 'cancelled') {
                        await pharmDocRef.update({ 
                          is_active: 0, 
                          subscription_active: false,
                          sub_status: 'cancelled',
                          updated_at: new Date().toISOString()
                        });
                        emailService.sendSubscriptionCancelledEmail(email, name);
                        console.log(`Subscription ${verifiedSub.id} cancelled pharmacy ${subDoc.data().pharmacy_id}`);
                     } else if (newStatus === 'paused' || newStatus === 'suspended') {
                        await pharmDocRef.update({ 
                          is_active: 0, 
                          subscription_active: false,
                          sub_status: newStatus,
                          updated_at: new Date().toISOString()
                        });
                        console.log(`Subscription ${verifiedSub.id} ${newStatus} for pharmacy ${subDoc.data().pharmacy_id}`);
                     }
                     
                     await updateDashboardStats();
                   }
                 }
              }
            }
          } catch (err) {
            console.error('Webhook processing error (PreApproval):', err);
          }
        }
      }
    })().catch(err => console.error('Unhandled error in async webhook processing:', err));
  });

  // Dev: Simulate Payment Approval
  app.post('/api/dev/simulate-payment', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy' && req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const { payment_id } = req.body;
      const paymentsSnapshot = await db.collection('payments').where('mp_payment_id', '==', payment_id).get();
      
      if (paymentsSnapshot.empty) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      const paymentDoc = paymentsSnapshot.docs[0];
      const payment = paymentDoc.data();
      
      const pharmacyId = payment.pharmacy_id;
      const planType = payment.plan_type || 'annual';

      // Fetch dynamic plan config to know duration
      const plansDoc = await db.collection('config').doc('subscription_plans').get();
      const plansData = plansDoc.exists ? plansDoc.data() : {
        monthly: { frequency: 1, frequency_type: 'months' },
        annual: { frequency: 1, frequency_type: 'years' }
      };
      const planConfig = (plansData as any)[planType] || { frequency: 1, frequency_type: 'years' };

      const nextBillingDate = calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'months');
      
      await db.collection('payments').doc(paymentDoc.id).update({
        status: 'approved',
        updated_at: new Date().toISOString()
      });

      // Update/Create Subscription
      const subSnapshot = await db.collection('subscriptions').where('pharmacy_id', '==', pharmacyId).get();
      if (!subSnapshot.empty) {
        await subSnapshot.docs[0].ref.update({
          status: 'active',
          updated_at: new Date().toISOString(),
          expires_at: nextBillingDate,
          next_billing_date: nextBillingDate
        });
      } else {
        await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          status: 'active',
          plan_type: planType,
          amount: planConfig.price || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: nextBillingDate,
          next_billing_date: nextBillingDate
        });
      }

      // Update pharmacy
      await db.collection('pharmacies').doc(pharmacyId).update({
        is_active: 1,
        subscription_active: true,
        updated_at: new Date().toISOString()
      });

      const pharmDoc = await db.collection('pharmacies').doc(pharmacyId).get();
      if (pharmDoc.exists) {
        await db.collection('pharmacies').doc(pharmacyId).update({ 
          is_active: 1,
          sub_status: 'active',
          updated_at: new Date().toISOString()
        });
        emailService.sendPaymentApprovedEmail(pharmDoc.data()?.email, pharmDoc.data()?.name);
        await updateDashboardStats();
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // User: Get Profile (Self)
  app.get('/api/user/profile', authenticateToken, async (req: any, res) => {
    try {
      const userDoc = await db.collection('users').doc(req.user.id).get();
      if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado' });
      
      const userData = userDoc.data();
      let profileData: any = { ...userData, id: req.user.id };

      if (userData?.role === 'pharmacy') {
        const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
        if (!pharmacySnapshot.empty) {
          const pharmacyData = pharmacySnapshot.docs[0].data();
          profileData = { ...profileData, ...pharmacyData, pharmacy_id: pharmacySnapshot.docs[0].id, user_id: req.user.id };
        }
      }

      res.json(profileData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // User: Update Profile (Self)
  app.put('/api/user/profile', authenticateToken, async (req: any, res) => {
    const userId = req.user.id;
    const { password, cep, street, number, neighborhood, city, state, name, phone, whatsapp, lat, lng } = req.body;
    
    try {
      // Update User Document
      const userUpdate: any = {
        updated_at: new Date().toISOString()
      };
      if (cep) userUpdate.cep = cep;
      if (street) userUpdate.street = street;
      if (number) userUpdate.number = number;
      if (neighborhood) userUpdate.neighborhood = neighborhood;
      if (city) userUpdate.city = city;
      if (state) userUpdate.state = state;
      if (name) userUpdate.name = name;

      await db.collection('users').doc(userId).update(userUpdate);

      // If Pharmacy, update Pharmacy Document too
      if (req.user.role === 'pharmacy') {
        const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', userId).get();
        if (!pharmacySnapshot.empty) {
          const pharmacyId = pharmacySnapshot.docs[0].id;
          const pharmacyUpdate: any = {
            updated_at: new Date().toISOString()
          };
          if (cep) pharmacyUpdate.cep = cep;
          if (street) pharmacyUpdate.street = street;
          if (number) pharmacyUpdate.number = number;
          if (neighborhood) pharmacyUpdate.neighborhood = neighborhood;
          if (city) pharmacyUpdate.city = city;
          if (state) pharmacyUpdate.state = state;
          if (name) pharmacyUpdate.name = name;
          if (phone) pharmacyUpdate.phone = phone;
          if (whatsapp) pharmacyUpdate.whatsapp = whatsapp;
          if (lat !== undefined) pharmacyUpdate.lat = lat;
          if (lng !== undefined) pharmacyUpdate.lng = lng;
          // Sync denormalized name
          if (name) pharmacyUpdate.name = name;
          
          await db.collection('pharmacies').doc(pharmacyId).update(pharmacyUpdate);
        }
      }

      // Update Password if provided
      if (password) {
        await auth.updateUser(userId, { password });
      }

      res.json({ success: true, message: 'Perfil atualizado com sucesso' });
    } catch (err: any) {
      console.error('Error updating profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get all pharmacies
  app.get('/api/admin/pharmacies', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmaciesSnapshot = await db.collection('pharmacies').get();
      const result = pharmaciesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get pharmacy payments
  app.get('/api/admin/pharmacies/:id/payments', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const snapshot = await db.collection('payments')
        .where('pharmacy_id', '==', req.params.id)
        .orderBy('created_at', 'desc')
        .get();
      
      const payments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      res.json(payments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Activate Pharmacy
  app.post('/api/admin/pharmacies/:id/activate', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { id } = req.params;
    
    try {
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) return res.status(404).json({ error: 'Pharmacy not found' });

      const now = new Date().toISOString();
      await db.collection('pharmacies').doc(id).update({ 
        is_active: 1,
        sub_status: 'active',
        updated_at: now
      });

      const expiresAt = addYears(new Date(), 1);

      const subsSnapshot = await db.collection('subscriptions')
        .where('pharmacy_id', '==', id)
        .where('status', '==', 'pending')
        .get();
      
      if (!subsSnapshot.empty) {
        await db.collection('subscriptions').doc(subsSnapshot.docs[0].id).update({
          status: 'active',
          expires_at: expiresAt.toISOString(),
          updated_at: now
        });
      } else {
        await db.collection('subscriptions').add({
          pharmacy_id: id,
          status: 'active',
          expires_at: expiresAt.toISOString(),
          created_at: now,
          updated_at: now
        });
      }

      await db.collection('payments').add({
        pharmacy_id: id,
        amount: 69.96,
        method: 'pix',
        status: 'approved',
        created_at: now,
        updated_at: now
      });

      const pharmacy = pharmacyDoc.data();
      if (pharmacy) {
        emailService.sendPaymentApprovedEmail(pharmacy.email, pharmacy.name);
      }

      await updateDashboardStats();
      await logAdminAction(req.user.id, 'pharmacy', id, 'activate', { prev_status: 'inactive' });
      res.json({ message: 'Pharmacy activated successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Deactivate Pharmacy
  app.post('/api/admin/pharmacies/:id/deactivate', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { id } = req.params;
    
    try {
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) return res.status(404).json({ error: 'Pharmacy not found' });

      const now = new Date().toISOString();
      await db.collection('pharmacies').doc(id).update({ 
        is_active: 0,
        sub_status: 'expired',
        updated_at: now
      });

      const subsSnapshot = await db.collection('subscriptions')
        .where('pharmacy_id', '==', id)
        .where('status', '==', 'active')
        .get();
      
      if (!subsSnapshot.empty) {
        await db.collection('subscriptions').doc(subsSnapshot.docs[0].id).update({
          status: 'expired',
          updated_at: now
        });
      }

      await updateDashboardStats();
      await logAdminAction(req.user.id, 'pharmacy', id, 'deactivate', { prev_status: 'active' });
      res.json({ message: 'Pharmacy deactivated successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete Pharmacy
  app.delete('/api/admin/pharmacies/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { id } = req.params;
    
    try {
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) return res.status(404).json({ error: 'Pharmacy not found' });
      const pharmacy = pharmacyDoc.data();

      // Delete user from Firebase Auth
      if (pharmacy?.user_id) {
        try {
          await auth.deleteUser(pharmacy.user_id);
        } catch (e) {
          console.warn('User not found in Auth, skipping delete');
        }
        // Delete from users collection
        try {
          await db.collection('users').doc(pharmacy.user_id).delete();
        } catch (e) {
          console.warn('User not found in Firestore, skipping delete');
        }
      }

      // Delete from Firestore
      await db.collection('pharmacies').doc(id).delete();
      
      const subsSnapshot = await db.collection('subscriptions').where('pharmacy_id', '==', id).get();
      for (const doc of subsSnapshot.docs) await doc.ref.delete();
      
      const highlightsSnapshot = await db.collection('highlights').where('pharmacy_id', '==', id).get();
      for (const doc of highlightsSnapshot.docs) await doc.ref.delete();
      
      const paymentsSnapshot = await db.collection('payments').where('pharmacy_id', '==', id).get();
      for (const doc of paymentsSnapshot.docs) await doc.ref.delete();

      const shiftsSnapshot = await db.collection('shifts').where('pharmacy_id', '==', id).get();
      for (const doc of shiftsSnapshot.docs) await doc.ref.delete();

      const clicksSnapshot = await db.collection('clicks').where('pharmacy_id', '==', id).get();
      for (const doc of clicksSnapshot.docs) await doc.ref.delete();

      await updateDashboardStats();
      await logAdminAction(req.user.id, 'pharmacy', id, 'delete', { deleted_email: pharmacy?.email });
      res.json({ message: 'Pharmacy deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update Pharmacy
  app.put('/api/admin/pharmacies/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { id } = req.params;
    const { email, password, name, phone, whatsapp, street, number, neighborhood, city, state, cep } = req.body;
    
    try {
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) {
        return res.status(404).json({ error: 'Farmácia não encontrada' });
      }
      const pharmacyData = pharmacyDoc.data()!;
      const userId = pharmacyData.user_id;

      // Update Auth User if email or password provided
      if (email || password) {
        try {
          const updateData: any = {};
          if (email) updateData.email = email;
          if (password) updateData.password = password;
          
          if (userId && !userId.startsWith('dummy_')) {
            await auth.updateUser(userId, updateData);
          } else if (email && password) {
            // Create real user if it was a dummy
            const userRecord = await auth.createUser({ email, password });
            const now = new Date().toISOString();
            await db.collection('users').doc(userRecord.uid).set({
              email,
              role: 'pharmacy',
              created_at: now,
              updated_at: now
            });
            await db.collection('pharmacies').doc(id).update({ 
              user_id: userRecord.uid,
              updated_at: now
            });
          }
        } catch (authError: any) {
          console.error('Error updating Auth user:', authError);
          // Continue updating Firestore even if Auth fails
        }
      }

      const updatedData: any = {
        name, phone, whatsapp, street, number, neighborhood, city, state, cep,
        updated_at: new Date().toISOString()
      };
      if (email) updatedData.email = email;
      
      await db.collection('pharmacies').doc(id).update(updatedData);
      
      // Also update user doc if exists
      if (userId && !userId.startsWith('dummy_')) {
        const userUpdate: any = { updated_at: new Date().toISOString() };
        if (email) userUpdate.email = email;
        if (cep) userUpdate.cep = cep;
        if (street) userUpdate.street = street;
        if (number) userUpdate.number = number;
        if (neighborhood) userUpdate.neighborhood = neighborhood;
        if (city) userUpdate.city = city;
        if (state) userUpdate.state = state;
        
        await db.collection('users').doc(userId).update(userUpdate);
      }

      await logAdminAction(req.user.id, 'pharmacy', id, 'update', { 
        updated_fields: Object.keys(updatedData)
      });
      res.json({ id, ...pharmacyData, ...updatedData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Create Pharmacy
  app.post('/api/admin/pharmacies', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { email, password, name, phone, whatsapp, street, number, neighborhood, city, state } = req.body;
    
    try {
      let userId;
      try {
        const userRecord = await auth.createUser({
          email,
          password,
        });
        userId = userRecord.uid;
      } catch (authError: any) {
        console.error('Error creating Auth user:', authError);
        if (authError.code === 'auth/email-already-exists') {
          const userRecord = await auth.getUserByEmail(email);
          userId = userRecord.uid;
          if (password) {
            await auth.updateUser(userId, { password });
          }
        } else {
          // Fallback to dummy user if auth creation fails (e.g., no service account)
          userId = `dummy_${uuidv4()}`;
        }
      }

      const now = new Date().toISOString();
      await db.collection('users').doc(userId).set({
        email,
        role: 'pharmacy',
        created_at: now,
        updated_at: now
      });
      
      const pharmacyId = uuidv4();
      
      await db.collection('pharmacies').doc(pharmacyId).set({
        user_id: userId,
        name,
        phone,
        whatsapp,
        email,
        user_email: email,
        sub_status: 'active',
        website: '',
        street,
        number,
        neighborhood,
        city,
        state,
        zip: '',
        is_active: 1,
        created_at: now,
        updated_at: now
      });
      
      const expiresAt = addYears(new Date(), 1);

      await db.collection('subscriptions').add({
        pharmacy_id: pharmacyId,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        created_at: now,
        updated_at: now
      });

      await updateDashboardStats();
      res.status(201).json({ message: 'Pharmacy created successfully' });
    } catch (error: any) {
      console.error('Admin Create Pharmacy Error:', error);
      res.status(500).json({ error: error.message || 'Server error' });
    }
  });

  // Admin: Get All Shifts
  app.get('/api/admin/shifts', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const [shiftsSnapshot, pharmaciesSnapshot] = await Promise.all([
        db.collection('shifts').get(),
        db.collection('pharmacies').get()
      ]);

      const pharmaciesMap = new Map(pharmaciesSnapshot.docs.map(doc => [doc.id, doc.data()]));
      const shifts = shiftsSnapshot.docs.map(sDoc => {
        const s = sDoc.data();
        const pharmacy = pharmaciesMap.get(s.pharmacy_id);
        return { 
          id: sDoc.id, 
          ...s, 
          pharmacy_name: pharmacy?.name || 'Desconhecida' 
        };
      });

      res.json(shifts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Create Shift
  app.post('/api/admin/shifts', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const { pharmacy_id, date, start_time, end_time, is_24h } = req.body;
      const newShift = {
        pharmacy_id,
        date,
        start_time: is_24h ? '00:00' : start_time,
        end_time: is_24h ? '23:59' : end_time,
        is_24h: is_24h ? 1 : 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const docRef = await db.collection('shifts').add(newShift);
      res.status(201).json({ id: docRef.id, ...newShift });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update Shift
  app.put('/api/admin/shifts/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const shiftDoc = await db.collection('shifts').doc(req.params.id).get();
      if (!shiftDoc.exists) return res.status(404).json({ error: 'Shift not found' });
      
      const { pharmacy_id, date, start_time, end_time, is_24h } = req.body;
      const updatedData = {
        pharmacy_id,
        date,
        start_time: is_24h ? '00:00' : start_time,
        end_time: is_24h ? '23:59' : end_time,
        is_24h: is_24h ? 1 : 0,
        updated_at: new Date().toISOString()
      };
      await db.collection('shifts').doc(req.params.id).update(updatedData);
      res.json({ id: req.params.id, ...shiftDoc.data(), ...updatedData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete Shift
  app.delete('/api/admin/shifts/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      await db.collection('shifts').doc(req.params.id).delete();
      res.json({ message: 'Shift deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Reports
  app.get('/api/admin/reports', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const statsDoc = await db.collection('config').doc('stats').get();
      const stats = statsDoc.data();
      
      if (!stats) {
        // Fallback if stats not yet generated
        await updateDashboardStats();
        const newStatsDoc = await db.collection('config').doc('stats').get();
        return res.json(newStatsDoc.data());
      }
      
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Sync System Data (Optimization Tool)
  app.post('/api/admin/sync-data', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmaciesSnapshot = await db.collection('pharmacies').get();
      
      for (const pDoc of pharmaciesSnapshot.docs) {
        const p = pDoc.data();
        
        // Fetch user email if missing
        let email = p.user_email;
        if (!email) {
          const userDoc = await db.collection('users').doc(p.user_id).get();
          email = userDoc.data()?.email || '';
        }
        
        // Fetch last subscription if missing
        let status = p.sub_status;
        if (!status) {
          const subsSnapshot = await db.collection('subscriptions')
            .where('pharmacy_id', '==', pDoc.id)
            .get();
          const subs = subsSnapshot.docs.map(doc => doc.data());
          subs.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
          status = subs[0]?.status || 'pending';
        }
        
        await pDoc.ref.update({
          user_email: email,
          sub_status: status
        });
      }
      
      await updateDashboardStats();
      res.json({ success: true, message: 'Dados sincronizados e otimizados' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Set Highlight
  app.post('/api/admin/highlights', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { pharmacy_id, type, date_start, date_end, city, state } = req.body;
    
    try {
      const now = new Date().toISOString();
      const docRef = await db.collection('highlights').add({
        pharmacy_id,
        type,
        date_start,
        date_end,
        city,
        state,
        created_at: now,
        updated_at: now
      });
      res.json({ message: 'Highlight added', id: docRef.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Config
  app.get('/api/admin/config', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const configDoc = await db.collection('config').doc('mercadopago').get();
      res.json(configDoc.data() || {});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update Config
  app.post('/api/admin/config', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const { public_key, access_token } = req.body;
      const now = new Date().toISOString();
      await db.collection('config').doc('mercadopago').set({
        public_key,
        access_token,
        updated_at: now
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Subscription Plans
  app.get('/api/admin/subscription-plans', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const plansDoc = await db.collection('config').doc('subscription_plans').get();
      if (!plansDoc.exists) {
        return res.json({
          monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months' },
          annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years' }
        });
      }
      res.json(plansDoc.data());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Subscriptions (Subscribers)
  app.get('/api/admin/subscriptions', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const subsSnapshot = await db.collection('subscriptions').get();
      const pharmaciesSnapshot = await db.collection('pharmacies').get();
      
      const pharmMap = new Map();
      pharmaciesSnapshot.forEach(doc => pharmMap.set(doc.id, doc.data()));

      const subs = subsSnapshot.docs.map(doc => {
        const data = doc.data();
        const pharm = pharmMap.get(data.pharmacy_id);
        return {
          id: doc.id,
          ...data,
          pharmacy_name: pharm?.name || 'Desconhecida',
          pharmacy_email: pharm?.email || data.payer_email || ''
        };
      });
      res.json(subs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update Subscription
  app.put('/api/admin/subscriptions/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const { status, plan_type, next_billing_date, expires_at } = req.body;
      const subRef = db.collection('subscriptions').doc(req.params.id);
      const subDoc = await subRef.get();
      if (!subDoc.exists) return res.status(404).json({ error: 'Assinatura não encontrada' });

      const updateData: any = {
        status,
        next_billing_date: next_billing_date || null,
        expires_at: expires_at || null,
        updated_at: new Date().toISOString()
      };

      if (plan_type) updateData.plan_type = plan_type;

      await subRef.update(updateData);

      // Sync with pharmacy
      const pharmacyId = subDoc.data()?.pharmacy_id;
      if (pharmacyId) {
         const isActive = status === 'active' || status === 'authorized';
         await db.collection('pharmacies').doc(pharmacyId).update({
           subscription_active: isActive,
           is_active: isActive ? 1 : 0
         });
      }

      await logAdminAction(req.user.id, 'subscription', req.params.id, 'update', { status, plan_type });
      res.json({ message: 'Assinatura atualizada' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete Subscription
  app.delete('/api/admin/subscriptions/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const subRef = db.collection('subscriptions').doc(req.params.id);
      const subDoc = await subRef.get();
      if (!subDoc.exists) return res.status(404).json({ error: 'Assinatura não encontrada' });

      const pharmacyId = subDoc.data()?.pharmacy_id;
      await subRef.delete();

      if (pharmacyId) {
        await db.collection('pharmacies').doc(pharmacyId).update({
          subscription_active: false,
          is_active: 0
        });
      }
      await logAdminAction(req.user.id, 'subscription', req.params.id, 'delete', { pharmacy_id: pharmacyId });
      res.json({ message: 'Assinatura excluída' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Test Mercado Pago Credentials
  app.post('/api/admin/config/test-mercadopago', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { access_token } = req.body;
    
    if (!access_token) return res.status(400).json({ error: 'Token de acesso é obrigatório' });

    try {
      if (access_token === 'TEST-1234567890' || access_token === 'YOUR_MERCADOPAGO_ACCESS_TOKEN') {
        return res.status(400).json({ 
          success: false, 
          error: 'Token de teste/placeholder detectado.',
          details: 'Por favor, insira um Access Token real do seu painel do Mercado Pago.' 
        });
      }

      const tempClient = new MercadoPagoConfig({ accessToken: access_token, options: { timeout: 7000 } });
      const tempCustomer = new Customer(tempClient);
      
      // Perform a search that actually hits the API and verifies the token identity
      console.log('Testing MP Connection with token:', access_token.substring(0, 10) + '...');
      const result = await tempCustomer.search({ options: { limit: 1 } });
      console.log('MP Test Result received.');
      
      res.json({ success: true, message: 'Credenciais válidas! Conexão com Mercado Pago estabelecida com sucesso.' });
    } catch (err: any) {
      console.error('MP Test API Error Payload:', err.message, err.status, JSON.stringify(err.cause || {}));
      // MP errors often contain detailed messages in cause or message
      const errorMsg = err.message || 'Erro de autenticação com Mercado Pago';
      res.status(401).json({ 
        success: false, 
        error: errorMsg,
        details: err.cause?.[0]?.description || 'Verifique se o Access Token está correto.'
      });
    }
  });

  // Admin: Save Subscription Plans
  app.put('/api/admin/subscription-plans', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      await db.collection('config').doc('subscription_plans').set({
        ...req.body,
        updated_at: new Date().toISOString()
      });
      await logAdminAction(req.user.id, 'config', 'subscription_plans', 'update', { plans: Object.keys(req.body) });
      res.json({ message: 'Planos atualizados com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Catch-all for API routes to return JSON instead of HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.url}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false 
      },
      appType: 'spa',
    });
    console.log('Vite middleware initialized');
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Cron job to check expiring subscriptions daily at 00:00
  cron.schedule('0 0 * * *', async () => {
    try {
      const today = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(today.getDate() + 7);
      
      const subsSnapshot = await db.collection('subscriptions')
        .where('status', '==', 'active')
        .get();
      
      const expiringSubs = subsSnapshot.docs.filter(doc => {
        const s = doc.data();
        if (!s.expires_at) return false;
        const expiresAt = new Date(s.expires_at);
        
        return expiresAt.getFullYear() === sevenDaysFromNow.getFullYear() &&
               expiresAt.getMonth() === sevenDaysFromNow.getMonth() &&
               expiresAt.getDate() === sevenDaysFromNow.getDate();
      });
      
      for (const subDoc of expiringSubs) {
        const sub = subDoc.data();
        const pharmacyDoc = await db.collection('pharmacies').doc(sub.pharmacy_id).get();
        const pharmacy = pharmacyDoc.data();
        if (pharmacy) {
          emailService.sendSubscriptionExpiringEmail(pharmacy.email, pharmacy.name, 7);
        }
      }
    } catch (err) {
      console.error('Cron job error:', err);
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
