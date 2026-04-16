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
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { addYears } from 'date-fns';
import crypto from 'crypto';
import cron from 'node-cron';
import { emailService } from './emailService.ts';

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

let mpClient: MercadoPagoConfig;
let paymentClient: Payment;
let currentAccessToken: string | null = null;

async function getMPClient() {
  const configDoc = await db.collection('config').doc('mercadopago').get();
  const config = configDoc.data();
  
  const accessToken = config?.access_token || process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-1234567890';
  
  if (!mpClient || currentAccessToken !== accessToken) {
    mpClient = new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } });
    paymentClient = new Payment(mpClient);
    currentAccessToken = accessToken;
  }
  return { mpClient, paymentClient };
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
      const adminEmail = 'sys.farmaciasdeplantao@gmail.com';
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

    if (!token) {
      console.log('Auth Middleware: No token provided');
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
      // Basic JWT format check
      if (token.split('.').length !== 3) {
        throw new Error('Token is not in JWT format');
      }

      const decodedToken = await auth.verifyIdToken(token);
      
      req.user = {
        id: decodedToken.uid,
        email: decodedToken.email,
        role: decodedToken.email === 'sys.farmaciasdeplantao@gmail.com' ? 'admin' : 'pharmacy'
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
        const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour
        
        const now = new Date().toISOString();
        await db.collection('password_resets').add({
          email,
          token,
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
      const resetSnapshot = await db.collection('password_resets').where('token', '==', token).get();
      
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
        const role = (req.user.email === 'sys.farmaciasdeplantao@gmail.com' ? 'admin' : 'client') as 'admin' | 'pharmacy' | 'client';
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
        if (req.user.email === 'sys.farmaciasdeplantao@gmail.com' && userData?.role !== 'admin') {
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
      const role = email === 'sys.farmaciasdeplantao@gmail.com' ? 'admin' : 'pharmacy';
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
          status: 'pending',
          expires_at: null,
          created_at: now,
          updated_at: now
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
    const { city, state, name } = req.query;
    try {
      let query: any = db.collection('pharmacies').where('is_active', '==', 1);

      if (city && state) {
        query = query.where('city', '==', city).where('state', '==', state);
      }
      
      const snapshot = await query.get();
      let pharmacies = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      
      if (name) {
        pharmacies = pharmacies.filter((p: any) => 
          p.name.toLowerCase().includes((name as string).toLowerCase())
        );
      }

      res.json(pharmacies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Get On-Call Pharmacies (Plantões de Hoje)
  app.get('/api/public/on-call', async (req, res) => {
    const { city, state } = req.query;
    try {
      // Get today's date in YYYY-MM-DD format for America/Sao_Paulo
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      
      let shiftsQuery: any = db.collection('shifts').where('date', '==', today);
      const shiftsSnapshot = await shiftsQuery.get();
      
      const onCallPharmacies = [];
      for (const shiftDoc of shiftsSnapshot.docs) {
        const shift = shiftDoc.data();
        const pharmacyDoc = await db.collection('pharmacies').doc(shift.pharmacy_id).get();
        const pharmacy = pharmacyDoc.data();
        
        if (pharmacy && pharmacy.is_active === 1) {
          if (city && state) {
            if (pharmacy.city.toLowerCase() !== (city as string).toLowerCase() || 
                pharmacy.state.toLowerCase() !== (state as string).toLowerCase()) {
              continue;
            }
          }
          
          onCallPharmacies.push({
            id: pharmacyDoc.id,
            ...pharmacy,
            shift: {
              start_time: shift.start_time,
              end_time: shift.end_time,
              is_24h: shift.is_24h
            }
          });
        }
      }

      res.json(onCallPharmacies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Get Highlights
  app.get('/api/public/highlights', async (req, res) => {
    const { city, state } = req.query;
    const now = new Date().toISOString();
    
    try {
      let query: any = db.collection('highlights')
        .where('date_start', '<=', now);
      
      const snapshot = await query.get();
      const highlights = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((h: any) => h.date_end >= now);
      
      const result = [];
      for (const h of highlights) {
        if (city && state) {
          if (h.city.toLowerCase() !== (city as string).toLowerCase() || 
              h.state.toLowerCase() !== (state as string).toLowerCase()) {
            continue;
          }
        }

        const pDoc = await db.collection('pharmacies').doc(h.pharmacy_id).get();
        const p = pDoc.data();
        
        if (p && p.is_active === 1) {
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
      await db.collection('clicks').add({
        pharmacy_id: id,
        type,
        created_at: now,
        updated_at: now
      });
      
      res.json({ success: true });
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

  // Payments: Generate Pix
  app.post('/api/payments/pix', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'Acesso negado' });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: 'Pharmacy not found' });
      const pharmacy = pharmacySnapshot.docs[0].data();
      const pharmacyId = pharmacySnapshot.docs[0].id;

      // In a real app, we would use the actual Mercado Pago API.
      let paymentResponse: any = null;
      const transactionAmount = 69.96;
      const idempotencyKey = uuidv4();

      const { paymentClient } = await getMPClient();
      try {
        paymentResponse = await paymentClient.create({
          body: {
            transaction_amount: transactionAmount,
            description: 'Assinatura Anual - Farmácia de Plantão Brasil',
            payment_method_id: 'pix',
            payer: {
              email: pharmacy.email,
              first_name: pharmacy.name.split(' ')[0],
              last_name: pharmacy.name.split(' ').slice(1).join(' ') || 'Farmácia'
            }
          },
          requestOptions: { idempotencyKey }
        });
      } catch (mpError) {
        console.warn('Mercado Pago API failed, using mock data for development.', mpError);
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
      }

      const mpPaymentId = paymentResponse.id.toString();

      // Save payment intent
      const now = new Date().toISOString();
      await db.collection('payments').add({
        pharmacy_id: pharmacyId,
        amount: transactionAmount,
        method: 'pix',
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
  app.post('/api/webhooks/payment', async (req, res) => {
    const { type, data } = req.body;
    
    if (type === 'payment' && data && data.id) {
      try {
        const paymentId = data.id.toString();
        const paymentsSnapshot = await db.collection('payments').where('mp_payment_id', '==', paymentId).get();
        
        if (!paymentsSnapshot.empty) {
          const paymentDoc = paymentsSnapshot.docs[0];
          const payment = paymentDoc.data();
          
          if (payment.status !== 'approved') {
            await db.collection('payments').doc(paymentDoc.id).update({
              status: 'approved',
              updated_at: new Date().toISOString()
            });

            const pharmacyId = payment.pharmacy_id;
            const expiresAt = addYears(new Date(), 1);

            const subsSnapshot = await db.collection('subscriptions')
              .where('pharmacy_id', '==', pharmacyId)
              .get();
            
            const pendingSub = subsSnapshot.docs.find(doc => doc.data().status === 'pending' || doc.data().status === 'expired');
            
            if (pendingSub) {
              await db.collection('subscriptions').doc(pendingSub.id).update({
                status: 'active',
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString()
              });
            } else {
              await db.collection('subscriptions').add({
                pharmacy_id: pharmacyId,
                status: 'active',
                expires_at: expiresAt.toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }

            // Ensure pharmacy is active
            const pharmDoc = await db.collection('pharmacies').doc(pharmacyId).get();
            if (pharmDoc.exists) {
              await db.collection('pharmacies').doc(pharmacyId).update({ 
                is_active: 1,
                sub_status: 'active',
                updated_at: new Date().toISOString()
              });
              emailService.sendPaymentApprovedEmail(pharmDoc.data()?.email, pharmDoc.data()?.name);
            }

            await updateDashboardStats();
            console.log(`Payment ${paymentId} approved. Pharmacy ${pharmacyId} activated.`);
          }
        }
      } catch (err) {
        console.error('Webhook processing error:', err);
      }
    }
    
    res.status(200).json({ success: true });
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
      
      await db.collection('payments').doc(paymentDoc.id).update({
        status: 'approved',
        updated_at: new Date().toISOString()
      });

      const pharmacyId = payment.pharmacy_id;
      const expiresAt = addYears(new Date(), 1);

      const subsSnapshot = await db.collection('subscriptions')
        .where('pharmacy_id', '==', pharmacyId)
        .get();
      
      const pendingSub = subsSnapshot.docs.find(doc => doc.data().status === 'pending' || doc.data().status === 'expired');
      
      if (pendingSub) {
        await db.collection('subscriptions').doc(pendingSub.id).update({
          status: 'active',
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        });
      } else {
        await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          status: 'active',
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

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
      try {
        await auth.deleteUser(pharmacy?.user_id);
      } catch (e) {
        console.warn('User not found in Auth, skipping delete');
      }

      // Delete from Firestore
      await db.collection('pharmacies').doc(id).delete();
      await db.collection('users').doc(pharmacy?.user_id).delete();
      
      const subsSnapshot = await db.collection('subscriptions').where('pharmacy_id', '==', id).get();
      for (const doc of subsSnapshot.docs) await doc.ref.delete();
      
      const highlightsSnapshot = await db.collection('highlights').where('pharmacy_id', '==', id).get();
      for (const doc of highlightsSnapshot.docs) await doc.ref.delete();
      
      const paymentsSnapshot = await db.collection('payments').where('pharmacy_id', '==', id).get();
      for (const doc of paymentsSnapshot.docs) await doc.ref.delete();

      await updateDashboardStats();
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
      const shiftsSnapshot = await db.collection('shifts').get();
      const shifts = [];
      
      for (const sDoc of shiftsSnapshot.docs) {
        const s = sDoc.data();
        const pharmacyDoc = await db.collection('pharmacies').doc(s.pharmacy_id).get();
        shifts.push({ id: sDoc.id, ...s, pharmacy_name: pharmacyDoc.data()?.name || 'Desconhecida' });
      }
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
