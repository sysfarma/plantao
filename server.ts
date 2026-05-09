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
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { emailService } from './emailService.ts';

// --- Validation Schemas ---
const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;
const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/;

function generateSlug(name: string, city: string, state: string): string {
  const combined = `${name}-${city}-${state}`;
  if (!combined) return '';
  return combined
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const pharmacySchema = z.object({
  name: z.string().min(3, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  whatsapp: z.string().optional().or(z.literal('')),
  cnpj: z.string().optional().or(z.literal('')),
  street: z.string().min(5, "Endereço muito curto").optional().or(z.literal('')),
  number: z.string().optional().or(z.literal('')),
  neighborhood: z.string().min(2, "Bairro obrigatório").optional().or(z.literal('')),
  city: z.string().min(2, "Cidade obrigatória").optional().or(z.literal('')),
  state: z.string().length(2, "Estado deve ter 2 letras (UF)").optional().or(z.literal('')),
  cep: z.string().optional().or(z.literal('')),
  website: z.string().optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  logo_url: z.string().optional().or(z.literal('')),
  coordinates: z.object({
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional()
  }).nullable().optional(),
  operating_hours: z.any().optional(),
  is_active: z.number().optional(),
  sub_status: z.string().optional()
});

// --- Geocoding Helper ---
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'FarmaciasDePlantaoBrasil/1.0';

async function geocodeAddress(street: string, number: string, city: string, state: string) {
  const query = encodeURIComponent(`${street}, ${number}, ${city}, ${state}, Brazil`);
  const url = `${NOMINATIM_BASE_URL}/search?format=json&q=${query}&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pt-BR'
      }
    });

    if (!response.ok) return null;
    const data: any = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
  return null;
}
// -------------------------

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

// Interfaces
interface SubscriptionData {
  pharmacy_id: string;
  mp_preapproval_id: string;
  status: string;
  amount: number;
  plan_type: string;
  created_at: string;
  updated_at: string;
  next_billing_date: string;
  init_point: string | undefined;
  user_id?: string;
}

const db = getFirestore(admin.apps[0], firebaseConfig.firestoreDatabaseId);
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth(admin.apps[0]);

// Sitemap Cache Variables
let sitemapCache: string | null = null;
let sitemapCacheTimestamp: number = 0;
const SITEMAP_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const ERRORS = {
  PHARMACY_NOT_FOUND: 'Farmácia não encontrada',
  SHIFT_NOT_FOUND: 'Plantão não encontrado',
  USER_NOT_FOUND: 'Usuário não encontrado',
  ACCESS_DENIED: 'Acesso negado',
  INTERNAL_ERROR: 'Erro interno do servidor',
  PAYMENT_NOT_FOUND: 'Pagamento não encontrado',
  INVALID_PAYLOAD: 'Dados inválidos',
  UNAUTHORIZED: 'Não autorizado',
  SUBSCRIPTION_NOT_FOUND: 'Assinatura não encontrada',
  ACTIVE_SUBSCRIPTION_EXISTS: 'Você já possui uma assinatura ativa',
  TOKEN_REQUIRED: 'Token não fornecido ou inválido',
  INVALID_TOKEN: 'Token inválido ou expirado',
  TOKEN_EXPIRED: 'Token expirado',
  EMAIL_REQUIRED: 'E-mail é obrigatório',
  PROFILE_SYNC_FAILED: 'Falha ao sincronizar perfil',
  PLAN_NOT_AVAILABLE: 'Plano não disponível',
  NO_ACTIVE_SUBSCRIPTION: 'Nenhuma assinatura ativa encontrada',
  CARD_TOKEN_REQUIRED: 'Dados do cartão não fornecidos',
  NOT_MP_SUBSCRIPTION: 'Assinatura não gerenciada pelo Mercado Pago',
  PIX_GENERATION_FAILED: 'Erro ao gerar pagamento Pix',
  SECURITY_HEADERS_MISSING: 'Cabeçalhos de segurança ausentes',
  INVALID_SIGNATURE: 'Assinatura inválida',
  SIGNATURE_ERROR: 'Erro de validação de assinatura',
  CONFIG_ERROR: 'Configuração do sistema pendente',
  SUBSCRIPTION_PROCESS_ERROR: 'Erro ao processar assinatura',
  SUBSCRIPTION_CANCEL_ERROR: 'Erro ao cancelar assinatura',
  CARD_UPDATE_ERROR: 'Erro ao atualizar dados do cartão',
  ACCESS_TOKEN_REQUIRED: 'Token de acesso é obrigatório',
  TEST_TOKEN_DETECTED: 'Token de teste/placeholder detectado.',
  ROUTE_NOT_FOUND: 'Rota não encontrada'
};

const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Haversine distance formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

// --- Dashboard Stats Aggregator ---
let lastStatsUpdate = 0;
const STATS_UPDATE_COOLDOWN = 5 * 60 * 1000; // 5 minute cache/throttle

/**
 * Tracks a successful payment in pre-calculated stats documents
 * Idempotent: will not count the same paymentId twice
 */
async function trackPaymentMetric(amount: number, dateStr: string, paymentId?: string) {
  try {
    if (paymentId) {
      const processedRef = db.collection('stats_processed_payments').doc(paymentId);
      const processedDoc = await processedRef.get();
      if (processedDoc.exists) {
        console.log(`[Stats] Payment ${paymentId} already tracked, skipping.`);
        return;
      }
      // Record that we are processing this payment
      await processedRef.set({ tracked_at: new Date().toISOString(), amount });
    }

    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11
    
    const yearRef = db.collection('stats_revenue').doc(`year_${year}`);
    const statsRef = db.collection('config').doc('stats');

    const updateData: any = {
      [`m${month}`]: admin.firestore.FieldValue.increment(amount),
      total: admin.firestore.FieldValue.increment(amount),
      lastUpdate: new Date().toISOString()
    };

    // Ensure document exists before incrementing if needed (or use set with merge)
    await yearRef.set(updateData, { merge: true });
    
    // Also update the global total in the main stats doc
    await statsRef.set({
      totalRevenue: admin.firestore.FieldValue.increment(amount),
      lastUpdate: new Date().toISOString()
    }, { merge: true });
    
    console.log(`[Stats] Tracked payment of ${amount} for ${year}-${month + 1}`);
  } catch (err) {
    console.error('Error tracking payment metric:', err);
  }
}

async function updateDashboardStats(force = false) {
  const now = Date.now();
  if (!force && lastStatsUpdate && (now - lastStatsUpdate < STATS_UPDATE_COOLDOWN)) {
    console.log('[Stats] Skipping dashboard update (throttled)');
    return; // Skip if updated recently
  }
  lastStatsUpdate = now;

  try {
    const pharmaCount = (await db.collection('pharmacies').count().get()).data().count;
    const activePharmaCount = (await db.collection('pharmacies').where('is_active', 'in', [1, true]).count().get()).data().count;
    
    const currentYear = new Date().getFullYear();
    const yearRef = db.collection('stats_revenue').doc(`year_${currentYear}`);
    const statsRef = db.collection('config').doc('stats');
    
    const [yearDoc, globalStatsDoc] = await Promise.all([
      yearRef.get(),
      statsRef.get()
    ]);
    
    const yearData = yearDoc.exists ? yearDoc.data() || {} : {};
    const globalStatsData = globalStatsDoc.exists ? globalStatsDoc.data() || {} : {};
    
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const revenueByMonth = monthNames.map((month, index) => ({
      name: month,
      total: yearData[`m${index}`] || 0
    }));

    const totalRevenue = globalStatsData.totalRevenue || 0;

    await statsRef.set({
      totalPharmacies: pharmaCount,
      activePharmacies: activePharmaCount,
      totalRevenue,
      revenueByMonth,
      pharmacyStatus: [
        { name: 'Ativas', value: activePharmaCount },
        { name: 'Inativas', value: pharmaCount - activePharmaCount }
      ],
      lastUpdate: new Date().toISOString()
    }, { merge: true });

    console.log('[Stats] Dashboard stats updated incrementally (no recovery scan).');
  } catch (err) {
    console.error('Error updating dashboard stats:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy for express-rate-limit behind Cloud Run
  app.set('trust proxy', 1);

  app.use(cors());
  app.use(express.json());

  // --- Rate Limiters ---
  const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // stricter for auth
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many webhook events',
    standardHeaders: true,
    legacyHeaders: false,
  });
  // ---------------------

  // --- Validation Middleware ---
  const validate = (schema: z.ZodSchema) => (req: any, res: any, next: any) => {
    try {
      const result = schema.parse({
        query: req.query,
        params: req.params,
        body: req.body
      });
      // Optionally replace with parsed data for type safety
      // req.validatedData = result;
      next();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: ERRORS.INVALID_PAYLOAD,
          details: err.issues.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(err);
    }
  };

  // Schemas
  const publicSearchSchema = z.object({
    query: z.object({
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      name: z.string().optional(),
      cep: z.string().regex(/^\d{5}-?\d{3}$|^\d{8}$/).optional().or(z.string().length(0).optional()),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).passthrough()
  });

  const onCallSchema = z.object({
    query: z.object({
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      cep: z.string().optional(),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
    }).passthrough()
  });
  // ----------------------------

  // Auth Middleware
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'] || req.headers['x-app-token'];
    let token = authHeader && authHeader.split(' ')[1];
    
    if (!token && req.body && req.body.token) {
      token = req.body.token;
    }

    if (!token || token === 'null' || token === 'undefined') {
      console.log('Auth Middleware: No valid token provided');
      return res.status(401).json({ error: ERRORS.TOKEN_REQUIRED });
    }

    try {
      // Basic JWT format check
      if (token === 'mock' || token === 'TEST' || token.split('.').length !== 3) {
        throw new Error('Token is not in JWT format');
      }

      const decodedToken = await auth.verifyIdToken(token);
      
      const emailVerified = decodedToken.email_verified === true;
      const adminEnv = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.replace(/['"]/g, '').trim() : null;
      const isMasterAdmin = decodedToken.email === 'sys.farmaciasdeplantao@gmail.com';
      const isConfigAdmin = adminEnv && decodedToken.email === adminEnv;
      const isAdmin = (isMasterAdmin || isConfigAdmin) && emailVerified;

      req.user = {
        id: decodedToken.uid,
        uid: decodedToken.uid,
        email: decodedToken.email,
        email_verified: emailVerified,
        role: isAdmin ? 'admin' : (decodedToken.role || 'pharmacy')
      };
      next();
    } catch (err) {
      console.error('Auth Middleware Error:', err);
      return res.status(403).json({ error: ERRORS.INVALID_TOKEN });
    }
  };

  // --- API Routes ---

  // Debug: Check Admin Status
  app.get('/api/debug/admin-check', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    }
    try {
      const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.replace(/['"]/g, '').trim() : 'sys.farmaciasdeplantao@gmail.com';
      if (!adminEmail) return res.status(500).json({ error: ERRORS.CONFIG_ERROR });
      let userRecord = null;
      try {
        userRecord = await auth.getUserByEmail(adminEmail);
      } catch (e) {
        return res.json({ authExists: false, error: ERRORS.USER_NOT_FOUND });
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



  // Rate limiting handled via Firestore 
  // Forgot Password
  app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const nowMs = Date.now();
    
    if (ip !== 'unknown') {
      const clientKey = crypto.createHash('md5').update(`reset_${ip}`).digest('hex');
      const rlRef = db.collection('rate_limits').doc(clientKey);
      try {
        const doc = await rlRef.get();
        if (doc.exists) {
          const data = doc.data();
          if (data && nowMs - data.timestamp < 60000) { // 1 min limit per IP
            return res.json({ message: 'Se o e-mail existir, um link foi enviado.' });
          }
        }
        await rlRef.set({ timestamp: nowMs });
      } catch (e) {
        console.error("Rate limit check error:", e);
      }
    }

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: ERRORS.EMAIL_REQUIRED });

    try {
      const userSnapshot = await db.collection('users').where('email', '==', email).get();
      
      if (!userSnapshot.empty) {
        // Prevent email bombing - Security fix: use limit(1) and orderBy to prevent OOM
        const recentResets = await db.collection('password_resets')
          .where('email', '==', email)
          .orderBy('created_at', 'desc')
          .limit(1)
          .get();
        
        const lastReset = recentResets.empty ? null : recentResets.docs[0].data();
        
        if (lastReset) {
          const lastResetTime = new Date(lastReset.created_at).getTime();
          const fifteenMinutes = 15 * 60 * 1000;
          if (Date.now() - lastResetTime < fifteenMinutes) {
             return res.json({ message: 'Se o e-mail existir, um link foi enviado.' });
          }
        }

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
  app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    const { token, password } = req.body;
    try {
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      const resetSnapshot = await db.collection('password_resets').where('token', '==', hashedToken).get();
      
      if (resetSnapshot.empty) return res.status(400).json({ error: ERRORS.INVALID_TOKEN });
      
      const resetDoc = resetSnapshot.docs[0];
      const resetData = resetDoc.data();
      
      if (new Date(resetData.expires_at) < new Date()) {
        await resetDoc.ref.delete();
        return res.status(400).json({ error: ERRORS.TOKEN_EXPIRED });
      }
      
      const userSnapshot = await db.collection('users').where('email', '==', resetData.email).get();
      if (userSnapshot.empty) return res.status(400).json({ error: ERRORS.USER_NOT_FOUND });
      
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
  app.post('/api/auth/google-sync', authLimiter, authenticateToken, async (req: any, res) => {
    const { name } = req.body;
    try {
      const userDoc = await db.collection('users').doc(req.user.id).get();
      
      if (!userDoc.exists) {
        // Create new user profile
        // Role is securely validated and provided by the authenticateToken middleware
        const role = req.user.role;
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
            user_id: req.user.id,
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
        const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.replace(/['"]/g, '').trim() : 'sys.farmaciasdeplantao@gmail.com';
        if (((adminEmail && req.user.email === adminEmail) || req.user.email === 'sys.farmaciasdeplantao@gmail.com') && userData?.role !== 'admin') {
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
      res.status(500).json({ error: ERRORS.PROFILE_SYNC_FAILED });
    }
  });

  // Register Pharmacy
  app.post('/api/auth/register', authLimiter, authenticateToken, async (req: any, res) => {
    const { pharmacyData } = req.body;
    
    try {
      const userId = req.user.uid;
      const email = req.user.email; // Use verified email from token
      // Role is securely validated and provided by the authenticateToken middleware
      const role = req.user.role === 'admin' ? 'admin' : 'pharmacy';
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
        
        const pdoc2 = await db.collection('pharmacies').doc(pharmacyId).get();
        await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          user_id: pdoc2.data()?.user_id || '',
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

  // Helper to ensure query params are strings (prevents Type Juggling / Pollution)
  const ensureString = (val: any): string => {
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return String(val[0] || '');
    return '';
  };

  // Helper object to extract only public PII-safe fields
  const sanitizePublicPharmacy = (id: string, data: any) => ({
    id,
    slug: data.slug || generateSlug(data.name || '', data.city || '', data.state || ''),
    name: data.name || '',
    street: data.street || '',
    number: data.number || '',
    neighborhood: data.neighborhood || '',
    city: data.city || '',
    state: data.state || '',
    zip: data.zip || data.cep || '',
    cep: data.cep || data.zip || '',
    phone: data.phone || '',
    whatsapp: data.whatsapp || '',
    website: data.website || '',
    latitude: data.latitude || data.lat || null,
    longitude: data.longitude || data.lng || null,
    lat: data.lat || data.latitude || null,
    lng: data.lng || data.longitude || null,
    description: data.description || '',
    logo_url: data.logo_url || null,
    operating_hours: data.operating_hours || null,
    is_active: data.is_active,
    created_at: data.created_at,
    updated_at: data.updated_at
  });

  // Public: Get Single Pharmacy Details
  app.get('/api/public/pharmacies/:id', publicLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      let pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      let pharmacyId = id;
      
      if (!pharmacyDoc.exists) {
        // Try to fall back to search by slug
        const snapshot = await db.collection('pharmacies')
          .where('slug', '==', id)
          .where('is_active', '==', 1)
          .limit(1)
          .get();
          
        if (snapshot.empty) {
          return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
        }
        pharmacyDoc = snapshot.docs[0] as any;
        pharmacyId = pharmacyDoc.id;
      }

      const data = pharmacyDoc.data()!;
      if (!data.is_active) {
        return res.status(404).json({ error: 'Farmácia inativa.' });
      }

      const pharmacy = sanitizePublicPharmacy(pharmacyId, data);

      // Check if on call today
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      const shiftsSnapshot = await db.collection('shifts')
        .where('pharmacy_id', '==', pharmacyId)
        .where('date', '==', today)
        .limit(1)
        .get();
      
      const onCall = !shiftsSnapshot.empty;
      const shiftData = onCall ? shiftsSnapshot.docs[0].data() : null;

      res.json({ 
        ...pharmacy, 
        on_call: onCall,
        current_shift: shiftData
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Sitemap
  app.get('/sitemap.xml', publicLimiter, async (req, res) => {
    try {
      const now = Date.now();
      
      // Serve from cache if available and not expired
      if (sitemapCache && (now - sitemapCacheTimestamp < SITEMAP_CACHE_DURATION)) {
        res.header('Content-Type', 'application/xml');
        return res.send(sitemapCache);
      }

      console.log('Refreshing sitemap.xml cache...');
      const snapshot = await db.collection('pharmacies').where('is_active', 'in', [1, true]).get();
      const cities = new Set<string>();
      
      snapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.city && data.state) {
          const slug = `${data.state.toLowerCase()}/${data.city.toLowerCase().trim().replace(/\s+/g, '-')}`;
          cities.add(slug);
        }
      });

      const frontendUrl = process.env.VITE_APP_URL || 'https://farmaciasdeplantao.app.br';
      let xml = '<?xml version="1.0" encoding="UTF-8"?>';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
      
      // Home
      xml += `<url><loc>${frontendUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;
      // Main On-Call page
      xml += `<url><loc>${frontendUrl}/plantao</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>`;
      
      // Dynamic Cities
      cities.forEach(slug => {
        xml += `<url><loc>${frontendUrl}/plantao/${slug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;
      });

      xml += '</urlset>';

      // Update cache
      sitemapCache = xml;
      sitemapCacheTimestamp = now;

      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (err) {
      console.error('Sitemap error:', err);
      res.status(500).end();
    }
  });

  // Public: Get Pharmacies by City/State
  app.get('/api/public/pharmacies', publicLimiter, validate(publicSearchSchema), async (req, res) => {
    const city = ensureString(req.query.city);
    const state = ensureString(req.query.state);
    const name = ensureString(req.query.name);
    const cep = ensureString(req.query.cep);
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const cursorId = req.query.cursor as string;
    
    try {
      let pharmaciesQuery: any = db.collection('pharmacies').where('is_active', 'in', [1, true]);

      // 1. Native Firestore Filters
      if (state) {
        pharmaciesQuery = pharmaciesQuery.where('state', '==', state.toUpperCase());
      }
      
      if (city && lat === null && lng === null) {
        pharmaciesQuery = pharmaciesQuery.where('city', '==', city);
      }

      const isComplexQuery = !!(lat !== null && lng !== null) || !!name || !!cep;
      
      let pharmaciesDocs: any[] = [];
      let total: number = 0;
      let nextCursor: string | null = null;
      let currentLimit = isComplexQuery ? 2000 : limit;

      // Real pagination using cursors for simple queries
      if (!isComplexQuery) {
        pharmaciesQuery = pharmaciesQuery.orderBy('name', 'asc');
        if (cursorId) {
          const lastDoc = await db.collection('pharmacies').doc(cursorId).get();
          if (lastDoc.exists) {
            pharmaciesQuery = pharmaciesQuery.startAfter(lastDoc);
          }
        }
        const snapshot = await pharmaciesQuery.limit(limit).get();
        pharmaciesDocs = snapshot.docs;
        if (pharmaciesDocs.length === limit) {
          nextCursor = pharmaciesDocs[pharmaciesDocs.length - 1].id;
        }
        // For total in simple queries we might need a separate count if we want pagination info
        // But for performance, we might skip it or use the count() aggregation
        total = (await pharmaciesQuery.count().get()).data().count;
      } else {
        const snapshot = await pharmaciesQuery.limit(2000).get();
        pharmaciesDocs = snapshot.docs;
      }

      let pharmacies = pharmaciesDocs.map((doc: any) => sanitizePublicPharmacy(doc.id, doc.data()));

      // 2. Distance Filtering (Memory fallback for radius search)
      if (lat !== null && lng !== null) {
        pharmacies = pharmacies.filter((p: any) => {
          const pLat = p.lat || p.latitude;
          const pLng = p.lng || p.longitude;
          if (pLat && pLng) {
            const dist = getDistance(lat, lng, Number(pLat), Number(pLng));
            (p as any).distance = dist;
            return dist <= 20; // 20km radius
          }
          // If search has city, don't filter out pharmacies without coords
          if (city) {
            return normalize(p.city || '') === normalize(city);
          }
          return false;
        }).sort((a, b) => {
          // Sort by distance if both have it, otherwise distance-less at the end
          if ((a as any).distance !== undefined && (b as any).distance !== undefined) {
             return (a as any).distance - (b as any).distance;
          }
          if ((a as any).distance !== undefined) return -1;
          if ((b as any).distance !== undefined) return 1;
          return 0;
        });
      }

      // 3. Additional In-Memory Filters (Name search etc)
      if (cep) {
        const cleanSearchCep = cep.replace(/\D/g, '').substring(0, 5);
        if (cleanSearchCep.length >= 2) { // Minimum 2 digits for prefix
          pharmacies = pharmacies.filter((p: any) => {
            const pharmCep = (p.cep || p.zip || '').replace(/\D/g, '').substring(0, 5);
            return pharmCep.startsWith(cleanSearchCep) || cleanSearchCep.startsWith(pharmCep.substring(0, 5));
          });
        }
      }

      // 3. City Filtering
      if (city && !(lat !== null && lng !== null)) {
        pharmacies = pharmacies.filter((p: any) => normalize(p.city || '') === normalize(city));
      }
      
      // 4. Name Filtering
      if (name) {
        pharmacies = pharmacies.filter((p: any) => 
          normalize(p.name || '').includes(normalize(name))
        );
      }

      let finalData = pharmacies;
      let finalTotal = isComplexQuery ? pharmacies.length : total;

      if (isComplexQuery) {
        const startIndex = (page - 1) * limit;
        finalData = pharmacies.slice(startIndex, startIndex + limit);
      }

      // 5. Inject on_call status for results (safe-wrapped)
      try {
        if (finalData.length > 0) {
          const today = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(new Date());
  
          const pharmacyIds = finalData.map(p => p.id).filter(id => !!id);
          if (pharmacyIds.length > 0) {
            const chunkedIds = [];
            for (let i = 0; i < pharmacyIds.length; i += 30) {
              chunkedIds.push(pharmacyIds.slice(i, i + 30));
            }
  
            const onCallIds = new Set<string>();
            await Promise.all(chunkedIds.map(async (chunk) => {
              if (!chunk.length) return;
              const snapshot = await db.collection('shifts')
                .where('date', '==', today)
                .where('pharmacy_id', 'in', chunk)
                .get();
              snapshot.docs.forEach(doc => {
                const shiftData = doc.data();
                if (shiftData && shiftData.pharmacy_id) {
                  onCallIds.add(shiftData.pharmacy_id);
                }
              });
            }));
  
            finalData.forEach(p => {
              (p as any).on_call = onCallIds.has(p.id);
            });
          }
        }
      } catch (onCallErr) {
        console.error('[API] Error injecting on_call status in /pharmacies:', onCallErr);
      }

      res.json({
        data: finalData,
        pagination: {
          total: finalTotal,
          page,
          limit,
          totalPages: Math.ceil(finalTotal / limit),
          nextCursor: nextCursor || null
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Get On-Call Pharmacies (Plantões de Hoje)
  app.get('/api/public/on-call', publicLimiter, validate(onCallSchema), async (req, res) => {
    const city = ensureString(req.query.city);
    const state = ensureString(req.query.state);
    const cep = ensureString(req.query.cep);
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    
    try {
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      
      console.log(`[API] On-call request: today=${today}, city=${city}, state=${state}, cep=${cep}, lat=${lat}, lng=${lng}`);

      // 1. Fetch pharmacy IDs for the specific state first to filter early
      let allowedPharmacyIds: string[] | null = null;
      if (state) {
        let pQuery: any = db.collection('pharmacies').where('state', '==', state.toUpperCase()).where('is_active', 'in', [1, true]);
        const pSnapshot = await pQuery.select('city', 'lat', 'lng', 'latitude', 'longitude').get();
        
        let docs = pSnapshot.docs;
        
        // If we have coordinates, preferred filtering is by distance
        if (lat !== null && lng !== null) {
          docs = docs.filter(doc => {
            const data = doc.data();
            const pLat = data.lat || data.latitude;
            const pLng = data.lng || data.longitude;
            if (pLat && pLng) {
               return getDistance(lat, lng, Number(pLat), Number(pLng)) <= 20;
            }
            // Fallback: If no coords but city matches, keep it
            if (city) {
              return normalize(data.city || '') === normalize(city);
            }
            return false;
          });
        } else if (city) {
          // Optimization: Check for exact city match in firestore if possible
          // But here we already have the state snapshot, so memory filtering is okay for now
          // unless results are huge.
          docs = docs.filter(doc => normalize(doc.data().city || '') === normalize(city));
        }
        
        allowedPharmacyIds = docs.map(doc => doc.id);
        
        if (allowedPharmacyIds.length === 0) {
          return res.json([]);
        }
      }

      // 2. Extract active shifts for today
      let shiftsQuery: any = db.collection('shifts').where('date', '==', today);
      
      if (state) {
        shiftsQuery = shiftsQuery.where('state', '==', state.toUpperCase());
      }
      
      // Note: city in shifts is stored as it appears in the pharmacy profile.
      // If we had a normalized_city, we would use it here.
      // For now, filtering by state already dramatically improves the 500-limit bottleneck.
      
      const shiftsSnapshot = await shiftsQuery.limit(1000).get();
      
      if (shiftsSnapshot.empty) {
        return res.json([]);
      }

      let pharmacyIds = [...new Set(shiftsSnapshot.docs.map(doc => (doc.data() as any).pharmacy_id))];
      
      // Secondary filter: Match against the localized allowedPharmacyIds if coordinates or city were provided
      if (allowedPharmacyIds) {
        pharmacyIds = (pharmacyIds as string[]).filter(id => allowedPharmacyIds!.includes(id));
      }

      if (pharmacyIds.length === 0) {
        return res.json([]);
      }

  // 1. Load the corresponding pharmacy documents (PARALLELIZED)
      const pharmaciesMap = new Map();
      const chunks = [];
      for (let i = 0; i < pharmacyIds.length; i += 30) {
        chunks.push(pharmacyIds.slice(i, i + 30));
      }

      await Promise.all(chunks.map(async (chunk) => {
        const pharmacysSnapshot = await db.collection('pharmacies')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .where('is_active', 'in', [1, true])
          .get();
        
        pharmacysSnapshot.docs.forEach(doc => {
          // Store already sanitized data in the map to ensure consistency
          pharmaciesMap.set(doc.id, sanitizePublicPharmacy(doc.id, doc.data()));
        });
      }));

      const onCallPharmacies = [];
      const cleanSearchCep = cep ? cep.replace(/\D/g, '').substring(0, 5) : null;

      for (const shiftDoc of shiftsSnapshot.docs) {
        const shift = shiftDoc.data() as any;
        const sanitizedPharmacy = pharmaciesMap.get(shift.pharmacy_id);
        
        if (sanitizedPharmacy) {
          // Filter by CEP if needed
          if (cleanSearchCep && lat === null) {
            const pharmCep = (sanitizedPharmacy.cep || sanitizedPharmacy.zip || '').replace(/\D/g, '').substring(0, 5);
            if (!pharmCep.startsWith(cleanSearchCep) && !cleanSearchCep.startsWith(pharmCep.substring(0, 5))) {
              continue;
            }
          }
          
          const onCallResult = {
            ...sanitizedPharmacy,
            shift: {
              start_time: shift.start_time,
              end_time: shift.end_time,
              is_24h: shift.is_24h
            }
          };

          if (lat !== null && lng !== null) {
            (onCallResult as any).distance = getDistance(lat, lng, Number(onCallResult.lat), Number(onCallResult.lng));
          }

          onCallPharmacies.push(onCallResult);
        }
      }

      // Sort by distance if available
      if (lat !== null && lng !== null) {
        onCallPharmacies.sort((a, b) => ((a as any).distance || 0) - ((b as any).distance || 0));
      }

      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json(onCallPharmacies);
    } catch (err: any) {
      console.error('[API Error] On-call fetch failure:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // Public: Get Highlights
  app.get('/api/public/highlights', publicLimiter, validate(publicSearchSchema), async (req, res) => {
    const city = ensureString(req.query.city);
    const state = ensureString(req.query.state);
    const cep = ensureString(req.query.cep);
    const now = new Date().toISOString();
    
    try {
      // 1. Fetch highlights active now (Native filter by state/city if provided)
      let highlightsQuery: any = db.collection('highlights').where('date_start', '<=', now);
      if (state) {
        highlightsQuery = highlightsQuery.where('state', '==', state.toUpperCase());
      }
      if (city && state) {
        highlightsQuery = highlightsQuery.where('city', '==', city);
      }

      const highlightsSnapshot = await highlightsQuery.get();

      let highlights = highlightsSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((h: any) => h.date_end >= now);
      
      if (highlights.length === 0) {
        return res.json([]);
      }

      // 2. Fetch only the pharmacies referenced by highlights (PARALLELIZED)
      const pharmacyIds = [...new Set(highlights.map(h => h.pharmacy_id))];
      const pharmaciesMap = new Map();
      
      const chunks = [];
      for (let i = 0; i < pharmacyIds.length; i += 30) {
        chunks.push(pharmacyIds.slice(i, i + 30));
      }

      await Promise.all(chunks.map(async (chunk) => {
        const pharmacysSnapshot = await db.collection('pharmacies')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .where('is_active', 'in', [1, true])
          .get();
        
        pharmacysSnapshot.docs.forEach(doc => {
          // Apply sanitization immediately when fetching
          pharmaciesMap.set(doc.id, sanitizePublicPharmacy(doc.id, doc.data()));
        });
      }));

      const cleanSearchCep = cep ? cep.replace(/\D/g, '').substring(0, 5) : null;
      const result = [];

      // Fetch on_call status for pharmacies in highlights (safe-wrapped)
      try {
        const today = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());
  
        const onCallIds = new Set<string>();
        if (pharmacyIds.length > 0) {
          await Promise.all(chunks.map(async (chunk) => {
            if (!chunk.length) return;
            const snapshot = await db.collection('shifts')
              .where('date', '==', today)
              .where('pharmacy_id', 'in', chunk)
              .get();
            snapshot.docs.forEach(doc => {
              const shiftData = doc.data();
              if (shiftData && shiftData.pharmacy_id) {
                onCallIds.add(shiftData.pharmacy_id);
              }
            });
          }));
        }
  
        for (const h of highlights) {
          const p = pharmaciesMap.get(h.pharmacy_id);
          if (!p) continue;
  
          // Filtering by city/state
          if (city && state && !cep) {
            if ((p.city || '').toLowerCase() !== city.toLowerCase() || 
                (p.state || '').toLowerCase() !== state.toLowerCase()) {
              continue;
            }
          }
  
          if (cleanSearchCep) {
            const pharmCep = (p.cep || p.zip || '').replace(/\D/g, '').substring(0, 5);
            if (pharmCep !== cleanSearchCep) continue;
          }
          
          result.push({
            ...p, // p is already sanitized and has the correct pharmacy id
            on_call: onCallIds.has(h.pharmacy_id),
            highlight_id: h.id, // Save the highlight record ID separately
            type: h.type, // Include type so frontend knows if it's a 'day' highlight
            date_start: h.date_start,
            date_end: h.date_end
          });
        }
      } catch (onCallErr) {
        console.error('[API] Error injecting on_call status in /highlights:', onCallErr);
        // Fallback: push without on_call
        for (const h of highlights) {
          const p = pharmaciesMap.get(h.pharmacy_id);
          if (p && !result.find(r => (r as any).id === p.id)) {
            result.push({
              ...p,
              on_call: false,
              highlight_id: h.id,
              type: h.type,
              date_start: h.date_start,
              date_end: h.date_end
            });
          }
        }
      }

      res.json(result);
    } catch (err: any) {
      console.error('[API Error] Highlights fetch failure:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // Public: Register Click
  app.post('/api/public/pharmacies/:id/click', publicLimiter, async (req, res) => {
    const { id } = req.params;
    const { type } = req.body; // 'whatsapp' or 'map'
    
    // Add rate limiting via Firestore to prevent serverless concurrency bypass
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const nowMs = Date.now();
    
    if (ip !== 'unknown') {
      const hashKey = crypto.createHash('md5').update(`click_${ip}_${id}_${type}`).digest('hex');
      const rlRef = db.collection('rate_limits').doc(hashKey);
      try {
        const doc = await rlRef.get();
        if (doc.exists) {
          const data = doc.data();
          if (data && nowMs - data.timestamp < 300000) { // Limit 1 click per type per pharmacy per IP every 5 minutes
            return res.json({ success: true, message: 'Click ignored due to rate limit' });
          }
        }
        await rlRef.set({ timestamp: nowMs });
      } catch (e) {
        console.error("Rate limit check error:", e);
      }
    }

    try {
      const now = new Date().toISOString();
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) {
        return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      }

      const pharmacyData = pharmacyDoc.data()!;
      const userId = pharmacyData.user_id || '';

      const clickData = {
        pharmacy_id: id,
        user_id: userId,
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

  // Public: Get Server Time (for on-call sync)
  app.get('/api/status/time', (req, res) => {
    const now = new Date();
    const serverDate = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    
    res.json({
      date: serverDate,
      timestamp: now.toISOString(),
      timezone: 'America/Sao_Paulo'
    });
  });

  // Public: Get Mercado Pago Config (Public Key)
  app.get('/api/public/mercadopago-config', publicLimiter, async (req, res) => {
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
  app.get('/api/public/subscription-plans', publicLimiter, async (req, res) => {
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
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
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
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyDoc = pharmacySnapshot.docs[0];
      const { 
        name = '', phone = '', whatsapp = '', 
        street = '', number = '', neighborhood = '', 
        city = '', state = '', cep = '' 
      } = req.body;
      
      const updatedData = {
        name, phone, whatsapp, street, number, neighborhood, city, state, cep,
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
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
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
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      
      // Filter: Show all payments but limit for safety or performance if needed. 
      // For now, let's just make it a standard fetch but we could add pagination if it grows too large.
      const paymentsSnapshot = await db.collection('payments')
        .where('pharmacy_id', '==', pharmacyId)
        .orderBy('created_at', 'desc')
        .limit(100) // Show last 100 payments
        .get();
        
      const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(payments);
    } catch (err: any) {
      console.error('Pharmacy payments error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Get Reports
  app.get('/api/pharmacy/reports', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy' && req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;

      // Filter temporal padrão: Últimos 30 dias
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString();

      const clicksSnapshot = await db.collection('clicks')
        .where('pharmacy_id', '==', pharmacyId)
        .where('created_at', '>=', startDate)
        .orderBy('created_at', 'desc')
        .limit(2000)
        .get();
        
      const clicks = clicksSnapshot.docs.map(doc => doc.data());
      
      // Aggregate clicks by day
      const last30Days = [...Array(31)].map((_, i) => {
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
      console.error('Pharmacy reports error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/pharmacy/audit-logs', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy' && req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.limit) || 20;

    try {
      // First find the pharmacy ID for this user
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      const pharmacyId = pharmacySnapshot.docs[0].id;

      // Fetch logs related to this pharmacy resource
      const snapshot = await db.collection('audit_logs')
        .where('resource_type', '==', 'pharmacy')
        .where('resource_id', '==', pharmacyId)
        .orderBy('timestamp', 'desc')
        .limit(pageSize * 10) // Reasonable limit for paginated view
        .get();

      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const total = logs.length;
      const paginatedLogs = logs.slice((page - 1) * pageSize, page * pageSize);

      res.json({
        data: paginatedLogs,
        total,
        page,
        limit: pageSize
      });
    } catch (err: any) {
      console.error('Pharmacy audit logs error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Get Shifts
  app.get('/api/pharmacy/shifts', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      
      // Filter: Show shifts from the last 30 days and all future shifts
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];

      const shiftsSnapshot = await db.collection('shifts')
        .where('pharmacy_id', '==', pharmacyId)
        .where('date', '>=', startDate)
        .orderBy('date', 'desc')
        .limit(500)
        .get();
        
      const shifts = shiftsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(shifts);
    } catch (err: any) {
      console.error('Pharmacy shifts error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Pharmacy: Create Shift
  app.post('/api/pharmacy/shifts', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const pharmacyData = pharmacySnapshot.docs[0].data();
      const { date, start_time, end_time, is_24h } = req.body;
      
      const newShift = {
        pharmacy_id: pharmacyId,
        date,
        start_time: is_24h ? '00:00' : start_time,
        end_time: is_24h ? '23:59' : end_time,
        is_24h: is_24h ? 1 : 0,
        city: pharmacyData.city || '',
        state: pharmacyData.state || '',
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
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const pharmacyData = pharmacySnapshot.docs[0].data();
      const shiftDoc = await db.collection('shifts').doc(req.params.id).get();
      
      if (!shiftDoc.exists || shiftDoc.data()?.pharmacy_id !== pharmacyId) {
        return res.status(404).json({ error: ERRORS.SHIFT_NOT_FOUND });
      }
      
      const { date, start_time, end_time, is_24h } = req.body;
      
      const updatedData = {
        date,
        start_time: is_24h ? '00:00' : start_time,
        end_time: is_24h ? '23:59' : end_time,
        is_24h: is_24h ? 1 : 0,
        city: pharmacyData.city || '',
        state: pharmacyData.state || '',
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
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyId = pharmacySnapshot.docs[0].id;
      const shiftDoc = await db.collection('shifts').doc(req.params.id).get();
      
      if (!shiftDoc.exists || shiftDoc.data()?.pharmacy_id !== pharmacyId) {
        return res.status(404).json({ error: ERRORS.SHIFT_NOT_FOUND });
      }
      
      await db.collection('shifts').doc(req.params.id).delete();
      res.json({ message: 'Shift deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Subscriptions: Create Subscription (Recurrent)
  app.post('/api/subscriptions/create', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });

    try {
      const { card_token, email, payment_method_id, installments = 1, identificationType, identificationNumber, planType = 'annual' } = req.body;
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyDoc = pharmacySnapshot.docs[0];
      const pharmacyData = pharmacyDoc.data();
      const pharmacyId = pharmacyDoc.id;

      // Fetch private settings for sensitive info
      const privateSnap = await db.collection('pharmacies').doc(pharmacyId).collection('private').doc('settings').get();
      const privateData = privateSnap.exists ? privateSnap.data() : {};
      const mpCustomerId = privateData?.mp_customer_id || pharmacyData?.mp_customer_id;

      // Check if there is already an active subscription for this pharmacy
      const existingActiveSub = await db.collection('subscriptions')
        .where('pharmacy_id', '==', pharmacyId)
        .where('status', '==', 'active')
        .get();

      if (!existingActiveSub.empty) {
        return res.status(400).json({ 
          error: ERRORS.ACTIVE_SUBSCRIPTION_EXISTS,
          details: 'Se deseja alterar seu plano, utilize a opção de Atualizar Plano.'
        });
      }

      // Fetch dynamic plan config
      const plansDoc = await db.collection('config').doc('subscription_plans').get();
      const plansData = plansDoc.exists ? plansDoc.data() : {
        monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months' },
        annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years' }
      };
      const planConfig = (plansData as any)[planType];
      if (!planConfig || !planConfig.active) {
         return res.status(400).json({ error: ERRORS.PLAN_NOT_AVAILABLE });
      }

      // Handle Free Plan bypass
      if (planConfig.price === 0) {
        const now = new Date().toISOString();
        const nextBilling = calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'years');
        
        await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          user_id: req.user.id,
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
      let customerId = mpCustomerId;
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
            await db.collection('pharmacies').doc(pharmacyId).collection('private').doc('settings').set({ 
              mp_customer_id: customerId 
            }, { merge: true });
          }
        } catch (e: any) {
          console.warn(`Note: MP Customer creation failed (${e.message}). Attempting fallback search...`);
          try {
            const customerEmail = email || pharmacyData.email;
            const searchResult = await customerClient.search({ options: { email: customerEmail } });
            
            if (searchResult && searchResult.results && searchResult.results.length > 0) {
              customerId = searchResult.results[0].id;
              if (customerId) {
                await db.collection('pharmacies').doc(pharmacyId).collection('private').doc('settings').set({ 
                  mp_customer_id: customerId 
                }, { merge: true });
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
        status: 'pending',
        external_reference: pharmacyId
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
      const subData: SubscriptionData = {
        pharmacy_id: pharmacyId,
        mp_preapproval_id: subscriptionResponse.id,
        status: subscriptionResponse.status === 'authorized' ? 'active' : 'pending',
        amount: planConfig.price,
        plan_type: planType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        next_billing_date: calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'months'),
        init_point: subscriptionResponse.init_point,
        user_id: req.user.id
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
      res.status(500).json({ error: ERRORS.SUBSCRIPTION_PROCESS_ERROR + ': ' + err.message });
    }
  });

  // Pharmacy: Cancel Subscription voluntarily
  app.delete('/api/subscriptions/cancel', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });

    try {
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      
      const pharmacyDoc = pharmacySnapshot.docs[0];
      const pharmacyId = pharmacyDoc.id;

      // Find active subscription
      const subSnapshot = await db.collection('subscriptions')
        .where('pharmacy_id', '==', pharmacyId)
        .where('status', 'in', ['active', 'pending', 'authorized'])
        .get();

      if (subSnapshot.empty) {
        return res.status(400).json({ error: ERRORS.NO_ACTIVE_SUBSCRIPTION });
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
                error: ERRORS.SUBSCRIPTION_CANCEL_ERROR,
                details: formatted.message
              });
            }
          }
        }
      }

      const now = new Date().toISOString();

      // Deactivate Sub locally
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

      await updateDashboardStats();

      res.json({ success: true, message: 'Assinatura cancelada com sucesso.' });
    } catch (err: any) {
      console.error('Error in /api/subscriptions/cancel:', err);
      res.status(500).json({ error: ERRORS.SUBSCRIPTION_CANCEL_ERROR + ': ' + err.message });
    }
  });

  // Pharmacy: Update Subscription Card Token
  app.put('/api/subscriptions/update-card', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });

    try {
      const { card_token } = req.body;
      if (!card_token) return res.status(400).json({ error: ERRORS.CARD_TOKEN_REQUIRED });

      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      const pharmacyId = pharmacySnapshot.docs[0].id;

      // Find active subscription
      const subSnapshot = await db.collection('subscriptions')
        .where('pharmacy_id', '==', pharmacyId)
        .where('status', 'in', ['active', 'pending'])
        .get();

      if (subSnapshot.empty) {
        return res.status(404).json({ error: ERRORS.NO_ACTIVE_SUBSCRIPTION });
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
         return res.status(400).json({ error: ERRORS.NOT_MP_SUBSCRIPTION });
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
      res.status(500).json({ error: ERRORS.CARD_UPDATE_ERROR + ': ' + err.message });
    }
  });

  // Pharmacy: Upgrade/Downgrade Subscription
  app.put('/api/subscriptions/update', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const { planType, card_token, email, identificationType, identificationNumber } = req.body;
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      const pharmacyId = pharmacySnapshot.docs[0].id;

      // 2. Create NEW
      const plansDoc = await db.collection('config').doc('subscription_plans').get();
      const plansData = plansDoc.exists ? plansDoc.data() : {
        monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months' },
        annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years' }
      };
      const planConfig = (plansData as any)[planType];
      if (!planConfig || !planConfig.active) return res.status(400).json({ error: ERRORS.PLAN_NOT_AVAILABLE });

      // Handle Free Plan bypass for updates
      if (planConfig.price === 0) {
        const now = new Date().toISOString();
        const nextBilling = calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'months');
        
        const newSubRef = await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          user_id: req.user.id,
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
            error: ERRORS.CARD_UPDATE_ERROR, 
            details: e.message || 'Falha ao processar troca de plano real.' 
          });
        }
      }

      const subData: SubscriptionData = {
        pharmacy_id: pharmacyId,
        mp_preapproval_id: subscriptionResponse.id,
        status: subscriptionResponse.status === 'authorized' ? 'active' : 'pending',
        amount: planConfig.price,
        plan_type: planType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        next_billing_date: calculateNextBillingDate(planConfig.frequency || 1, planConfig.frequency_type || 'months'),
        init_point: subscriptionResponse.init_point,
        user_id: req.user.id
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
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const { planType = 'annual' } = req.body;
      const pharmacySnapshot = await db.collection('pharmacies').where('user_id', '==', req.user.id).get();
      if (pharmacySnapshot.empty) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
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
         return res.status(400).json({ error: ERRORS.PLAN_NOT_AVAILABLE });
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
        user_id: req.user.id,
        amount: transactionAmount,
        method: 'pix',
        plan_type: planType,
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
      res.status(500).json({ error: ERRORS.PIX_GENERATION_FAILED });
    }
  });

  // Webhook: Receive Mercado Pago Notifications
  app.post('/webhooks', webhookLimiter, express.json(), async (req, res) => {
    // 1. Signature Validation (Security)
    const xSignature = req.headers['x-signature'] as string;
    const xRequestId = req.headers['x-request-id'] as string;
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

    if (!xSignature || !xRequestId || !secret) {
      console.error('Missing Webhook Signature headers or Webhook Secret.');
      return res.status(400).json({ error: ERRORS.SECURITY_HEADERS_MISSING });
    }

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
      
      if (!ts || !hash || !dataId) {
        console.error('Invalid signature format or missing data ID.');
        return res.status(400).json({ error: ERRORS.INVALID_SIGNATURE });
      }

      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
      const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
      
      if (hmac !== hash) {
        console.error('Invalid Webhook Signature. Expected:', hash, 'Got:', hmac);
        return res.status(403).json({ error: ERRORS.INVALID_SIGNATURE });
      }
    } catch (e) {
      console.error('Error validating webhook signature', e);
      return res.status(500).json({ error: ERRORS.SIGNATURE_ERROR });
    }

    // Send immediate 200 OK to Mercado Pago to prevent Timeout/Retries
    res.status(200).json({ success: true, message: 'Webhook received and queued for processing' });

    // Run processing asynchronously
    (async () => {
      let { type, action, data } = req.body;
      const eventId = req.query.id || req.body.id || req.query['data.id'];
      
      // Normalize type and action based on Mercado Pago inconsistent webhook schemas
      if (!type && req.query.type) type = req.query.type;
      if (!type && req.query.topic) type = req.query.topic;
      if (action && typeof action === 'string') {
         if (action.startsWith('payment')) type = 'payment';
         if (action.startsWith('subscription')) type = 'subscription_preapproval';
      }
      
      // 2. Handle standard payment events (Pix, single cards)
      const paymentId = (data && data.id) || req.query['data.id'];
      if (type === 'payment' && paymentId) {
        try {
          const paymentIdStr = paymentId.toString();
          // Use the API client to physically verify the payment status to further prevent spoofing
          const { paymentClient } = await getMPClient();
          const verifiedPayment = await paymentClient.get({ id: paymentIdStr });
          
          const paymentsSnapshot = await db.collection('payments').where('mp_payment_id', '==', paymentIdStr).get();
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
                
                // 0. Double check if we already processed this specific payment to avoid redundancy
                const existingSubFromPayment = await db.collection('subscriptions')
                  .where('mp_payment_id', '==', paymentIdStr)
                  .get();

                if (existingSubFromPayment.empty) {
                  // 1. Cancel ANY other existing active/pending subscription to ensure only the new one is active
                  await cancelExistingSubscriptions(pharmacyId);

                  const pharmDoc1 = await db.collection('pharmacies').doc(pharmacyId).get();
                  // We create a NEW one for fixed durations like PIX
                  await db.collection('subscriptions').add({
                    pharmacy_id: pharmacyId,
                    user_id: pharmDoc1.data()?.user_id || '',
                    status: 'active',
                    plan_type: planType,
                    mp_payment_id: paymentIdStr, // Record the payment ID for idempotency/redundancy check
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
                    subscription_active: true,
                    updated_at: new Date().toISOString()
                  });
                  emailService.sendPaymentApprovedEmail(pharmDoc.data()?.email, pharmDoc.data()?.name);
                }

                await trackPaymentMetric(verifiedPayment.transaction_amount || localPayment.amount || 0, verifiedPayment.date_approved || new Date().toISOString(), paymentIdStr);
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
              } else {
                // REDUNDANCY PROTECTION: Handle subscription created in MP but missing in our DB
                const pharmacyId = verifiedSub.external_reference;
                if (pharmacyId) {
                  // Before adding, ensure we don't have another active one
                  await cancelExistingSubscriptions(pharmacyId);
                  
                  const pharmSnap = await db.collection('pharmacies').doc(pharmacyId).get();
                  if (pharmSnap.exists) {
                    const pharmData = pharmSnap.data();
                    const now = new Date().toISOString();
                    
                    let newStatus = 'pending';
                    if (verifiedSub.status === 'authorized') newStatus = 'active';

                    await db.collection('subscriptions').add({
                      pharmacy_id: pharmacyId,
                      user_id: pharmData?.user_id || '',
                      mp_preapproval_id: verifiedSub.id,
                      status: newStatus,
                      plan_type: verifiedSub.reason?.toLowerCase().includes('mensal') ? 'monthly' : 'annual',
                      amount: verifiedSub.auto_recurring?.transaction_amount || 0,
                      created_at: now,
                      updated_at: now,
                      next_billing_date: verifiedSub.next_payment_date || null
                    });

                    if (newStatus === 'active') {
                       await db.collection('pharmacies').doc(pharmacyId).update({
                         is_active: 1,
                         subscription_active: true,
                         sub_status: 'active',
                         updated_at: now
                       });
                       emailService.sendSubscriptionActiveEmail(pharmData?.email, pharmData?.name);
                       console.log(`[Webhook] Redundant/Recovered subscription ${verifiedSub.id} activated for pharmacy ${pharmacyId}`);
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
    if (req.user.role !== 'pharmacy' && req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const { payment_id } = req.body;
      const paymentsSnapshot = await db.collection('payments').where('mp_payment_id', '==', payment_id).get();
      
      if (paymentsSnapshot.empty) {
        return res.status(404).json({ error: ERRORS.PAYMENT_NOT_FOUND });
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
        const pharmDoc2 = await db.collection('pharmacies').doc(pharmacyId).get();
        await db.collection('subscriptions').add({
          pharmacy_id: pharmacyId,
          user_id: pharmDoc2.data()?.user_id || '',
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
        await trackPaymentMetric(payment.amount || 0, new Date().toISOString(), paymentDoc.id);
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
      if (!userDoc.exists) return res.status(404).json({ error: ERRORS.USER_NOT_FOUND });
      
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

  // Public: Get General Configuration
  app.get('/api/public/config', async (req, res) => {
    try {
      const configDoc = await db.collection('config').doc('general').get();
      const config = configDoc.data() || {};
      
      res.json({
        whatsapp_support: config.whatsapp_support,
        future_shifts_days: config.future_shifts_days,
        support_email: config.support_email,
        support_phone: config.support_phone,
        whatsapp_active: config.whatsapp_active,
        email_support_active: config.email_support_active,
        platform_last_update: config.platform_last_update
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Dashboard Stats
  app.get('/api/admin/stats', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const statsDoc = await db.collection('config').doc('stats').get();
      let data = statsDoc.data();
      
      // Forçar atualização se não existir ou estiver muito antigo (ex: 1 hora)
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      if (!data || !data.lastUpdate || data.lastUpdate < oneHourAgo) {
        await updateDashboardStats();
        const updatedDoc = await db.collection('config').doc('stats').get();
        data = updatedDoc.data();
      }
      
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get all pharmacies compactly for dropdowns
  app.get('/api/admin/pharmacies/all', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const snapshot = await db.collection('pharmacies').orderBy('name', 'asc').get();
      const result = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          city: data.city,
          state: data.state,
          user_id: data.user_id
        };
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get all pharmacies (PAGINAÇÃO NATIVA QUANDO POSSÍVEL)
  app.get('/api/admin/pharmacies', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    const page = Number(req.query.page) || 1;
    const limitNum = Number(req.query.limit) || 20;
    const search = ensureString(req.query.search);
    const sortBy = ensureString(req.query.sortBy) || 'created_at';
    const sortOrder = ensureString(req.query.sortOrder) === 'asc' ? 'asc' : 'desc';
    
    try {
      let result = [];
      let total = 0;

      if (!search) {
        // 1. Paginação Nativa (Sem busca) - Muito mais performante
        total = (await db.collection('pharmacies').count().get()).data().count;
        const pQuery = db.collection('pharmacies')
          .orderBy(sortBy === 'name' ? 'name' : sortBy, sortOrder)
          .offset((page - 1) * limitNum)
          .limit(limitNum);
          
        const snapshot = await pQuery.get();
        result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } else {
        // 2. Busca em Memória (Com busca) - Firestore não suporta busca textual nativa eficiente
        // Limitamos a busca aos primeiros 1000 para evitar estouro de memória/cota
        const normSearch = normalize(search);
        const snapshot = await db.collection('pharmacies').limit(2000).get();
        let allPharma = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        result = allPharma.filter((p: any) => 
          normalize(p.name || '').includes(normSearch) ||
          normalize(p.city || '').includes(normSearch) ||
          normalize(p.email || '').includes(normSearch) ||
          normalize(p.user_email || '').includes(normSearch)
        );
        
        total = result.length;
        
        // Ordenação manual para o resultado filtrado
        result.sort((a: any, b: any) => {
          const valA = a[sortBy] || '';
          const valB = b[sortBy] || '';
          if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
          if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        });
        
        result = result.slice((page - 1) * limitNum, page * limitNum);
      }

      res.json({
        data: result,
        total,
        page,
        limit: limitNum
      });
    } catch (err: any) {
      console.error('Admin pharmacies query error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get pharmacy payments
  app.get('/api/admin/pharmacies/:id/payments', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const snapshot = await db.collection('payments')
        .where('pharmacy_id', '==', req.params.id)
        .orderBy('created_at', 'desc')
        .limit(200) // Limite de segurança
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { id } = req.params;
    
    try {
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });

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
        const pdocState = await db.collection('pharmacies').doc(id).get();
        await db.collection('subscriptions').add({
          pharmacy_id: id,
          user_id: pdocState.data()?.user_id || '',
          status: 'active',
          expires_at: expiresAt.toISOString(),
          created_at: now,
          updated_at: now
        });
      }

      const pdoc = await db.collection('pharmacies').doc(id).get();
      const puser = pdoc.data()?.user_id || '';
      await db.collection('payments').add({
        pharmacy_id: id,
        user_id: puser,
        amount: 69.96,
        method: 'pix',
        status: 'approved',
        created_at: now,
        updated_at: now
      }).then(doc => trackPaymentMetric(69.96, now, doc.id));

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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { id } = req.params;
    
    try {
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });

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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { id } = req.params;
    
    try {
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
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
  app.put('/api/admin/pharmacies/:id', authLimiter, authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { id } = req.params;
    
    try {
      // Validate with Zod
      const validatedData = pharmacySchema.partial().parse(req.body);
      
      const { 
        email: rawEmail, password, name, phone, whatsapp, 
        street, number, neighborhood, city, state, cep,
        website, description, logo_url,
        cnpj, coordinates, operating_hours,
        is_active, sub_status
      } = req.body;
      
      const email = rawEmail?.toString().trim().toLowerCase();
      const cleanCnpj = cnpj?.replace(/\D/g, '');
      
      const pharmacyDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmacyDoc.exists) {
        return res.status(404).json({ error: ERRORS.PHARMACY_NOT_FOUND });
      }
      const pharmacyData = pharmacyDoc.data()!;
      let currentUserId = pharmacyData.user_id;

      const slug = generateSlug(name || pharmacyData.name, city || pharmacyData.city, state || pharmacyData.state);

      // Geocoding logic: Trigger if address changed AND (user didn't manually provide valid coordinates)
      let finalCoordinates = coordinates;
      const userProvidedCoords = coordinates && coordinates.lat !== null && coordinates.lng !== null;
      const addressChanged = street !== pharmacyData.street || city !== pharmacyData.city || number !== pharmacyData.number;
      
      if (!userProvidedCoords && addressChanged && street && city) {
        const geo = await geocodeAddress(street, number || '', city, state || 'RS');
        if (geo) {
          finalCoordinates = geo;
        }
      } else if (!userProvidedCoords && !pharmacyData.coordinates && street && city) {
        // No coordinates at all and we have an address
        const geo = await geocodeAddress(street, number || '', city, state || 'RS');
        if (geo) finalCoordinates = geo;
      }

      // Uniqueness check for CNPJ
      if (cleanCnpj && cleanCnpj !== pharmacyData?.cnpj) {
        const existingCnpj = await db.collection('pharmacies').where('cnpj', '==', cleanCnpj).get();
        if (!existingCnpj.empty) {
          return res.status(400).json({ error: 'Este CNPJ já está cadastrado em outra unidade.' });
        }
      }
      
      // 1. Handle Auth updates
      if (email || password) {
        try {
          const authUpdateData: any = {};
          if (email) authUpdateData.email = email;
          if (password) authUpdateData.password = password;
          
          if (currentUserId && !currentUserId.startsWith('dummy_')) {
            // First check if email belongs to someone else to avoid error
            if (email) {
              try {
                const userByEmail = await auth.getUserByEmail(email);
                if (userByEmail.uid !== currentUserId) {
                  return res.status(400).json({ error: 'Este e-mail já está em uso por outro usuário.' });
                }
              } catch (e: any) {
                // If user not found by email, it's safe to update
              }
            }
            await auth.updateUser(currentUserId, authUpdateData);
          } else if (email) {
            // Check if user exists by email first
            let userRecord;
            try {
              userRecord = await auth.getUserByEmail(email);
            } catch (e: any) {
              // User doesn't exist, we can create
            }
            
            if (userRecord) {
               // Email exists! Let's link this pharmacy to the existing user instead of failing.
               currentUserId = userRecord.uid;
               if (password) {
                 await auth.updateUser(currentUserId, { password });
               }
            } else if (password) {
              // Upgrade dummy to real user
              userRecord = await auth.createUser({ email, password });
              currentUserId = userRecord.uid;
              
              // Create user document immediately
              const now = new Date().toISOString();
              await db.collection('users').doc(currentUserId).set({
                email,
                role: 'pharmacy',
                created_at: now,
                updated_at: now
              });
            }
          }
        } catch (authError: any) {
          console.error('Auth update failed:', authError);
          return res.status(400).json({ 
            error: ERRORS.PROFILE_SYNC_FAILED, 
            details: authError.message 
          });
        }
      }

      // 2. Prepare Update Data
      const now = new Date().toISOString();
      const updatedData: any = { updated_at: now };
      
      const fieldsToSave = { 
        name, phone, whatsapp, street, number, 
        neighborhood, city, state, cep, website, 
        description, logo_url, cnpj: cleanCnpj,
        coordinates: finalCoordinates || null,
        operating_hours: operating_hours || null,
        is_active, sub_status,
        zip: cep,
        slug
      };

      Object.entries(fieldsToSave).forEach(([key, val]) => {
        if (val !== undefined) updatedData[key] = val;
      });
      
      // Ensure we don't accidentally overwrite finalCoordinates with undefined coordinates from req.body
      if (finalCoordinates) {
        updatedData.coordinates = finalCoordinates;
      } else if (coordinates === null) {
        updatedData.coordinates = null;
      }

      if (currentUserId !== undefined) updatedData.user_id = currentUserId;
      if (email) {
        updatedData.email = email;
        updatedData.user_email = email;
      }
      
      await db.collection('pharmacies').doc(id).update(updatedData);
      
      // 3. Sync User Doc
      if (currentUserId && !currentUserId.startsWith('dummy_')) {
        const userUpdate: any = { updated_at: now };
        if (email) userUpdate.email = email;
        if (cep) userUpdate.cep = cep;
        if (city) userUpdate.city = city;
        if (state) userUpdate.state = state;
        
        await db.collection('users').doc(currentUserId).set(userUpdate, { merge: true });
      }

      // 4. Sync Shifts if City/State changed
      if (city || state) {
        const shiftsSnapshot = await db.collection('shifts').where('pharmacy_id', '==', id).get();
        if (!shiftsSnapshot.empty) {
          const batch = db.batch();
          shiftsSnapshot.forEach(sDoc => {
            batch.update(sDoc.ref, {
              city: city || pharmacyData?.city || '',
              state: state || pharmacyData?.state || ''
            });
          });
          await batch.commit();
        }
      }

      await logAdminAction(req.user.id, 'pharmacy', id, 'update', { 
        updated_fields: Object.keys(updatedData)
      });
      
      res.json({ id, ...pharmacyData, ...updatedData });
    } catch (err: any) {
      console.error('Admin update failure:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Create Pharmacy
  app.post('/api/admin/pharmacies', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      // Validate with Zod
      const validatedData = pharmacySchema.parse(req.body);
      
      const { 
        email: rawEmail, password, name, phone, whatsapp, 
        street, number, neighborhood, city, state, cep,
        website, description, logo_url,
        cnpj, coordinates, operating_hours,
        is_active, sub_status
      } = req.body;
      
      const email = rawEmail?.toString().trim().toLowerCase() || '';
      const cleanCnpj = cnpj?.replace(/\D/g, '');
      
      const slug = generateSlug(name, city, state);
      
      // Geocoding logic
      let finalCoordinates = coordinates;
      if (!finalCoordinates && street && city) {
        const geo = await geocodeAddress(street, number || '', city, state);
        if (geo) finalCoordinates = geo;
      }
      
      // Check CNPJ uniqueness
      if (cleanCnpj) {
        const existingCnpj = await db.collection('pharmacies').where('cnpj', '==', cleanCnpj).get();
        if (!existingCnpj.empty) {
          return res.status(400).json({ error: 'Este CNPJ já está cadastrado.' });
        }
      }

      let currentUserId;
      try {
        const userRecord = await auth.createUser({
          email,
          password: password || uuidv4(),
        });
        currentUserId = userRecord.uid;
      } catch (authError: any) {
        if (authError.code === 'auth/email-already-exists') {
          const userRecord = await auth.getUserByEmail(email);
          currentUserId = userRecord.uid;
          if (password) {
            try {
              await auth.updateUser(currentUserId, { password });
            } catch (pwdErr) {
              // ignore
            }
          }
        } else {
          console.error('Error creating Auth user:', authError);
          currentUserId = `dummy_${uuidv4()}`;
        }
      }

      const now = new Date().toISOString();
      await db.collection('users').doc(currentUserId).set({
        email: email || '',
        role: 'pharmacy',
        created_at: now,
        updated_at: now
      }, { merge: true });
      
      const pharmacyId = uuidv4();
      
      await db.collection('pharmacies').doc(pharmacyId).set({
        user_id: currentUserId,
        name: name || 'Nova Farmácia',
        phone: phone || '',
        whatsapp: whatsapp || '',
        email: email || '',
        user_email: email || '',
        cnpj: cleanCnpj || '',
        coordinates: finalCoordinates || null,
        operating_hours: operating_hours || null,
        sub_status: sub_status || 'active',
        website: website || '',
        description: description || '',
        logo_url: logo_url || '',
        street: street || '',
        number: number || '',
        neighborhood: neighborhood || '',
        city: city || '',
        state: state || '',
        cep: cep || '',
        zip: cep || '',
        slug,
        is_active: is_active !== undefined ? is_active : 1,
        created_at: now,
        updated_at: now
      });
      
      const expiresAt = addYears(new Date(), 1);

      await db.collection('subscriptions').add({
        pharmacy_id: pharmacyId,
        user_id: currentUserId,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        created_at: now,
        updated_at: now
      });

      await updateDashboardStats();
      res.status(201).json({ message: 'Pharmacy created successfully' });
    } catch (error: any) {
      console.error('Admin Create Pharmacy Error Stack:', error.stack);
      console.error('Admin Create Pharmacy Error details:', error);
      res.status(500).json({ error: ERRORS.INTERNAL_ERROR, details: error?.message });
    }
  });

  // Admin: Get Pharmacy Logs
  app.get('/api/admin/pharmacies/:id/logs', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { id } = req.params;
    try {
      const logsSnapshot = await db.collection('audit_logs')
        .where('resource_id', '==', id)
        .where('resource_type', '==', 'pharmacy')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();
      
      const logs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Batch Actions for Pharmacies
  app.post('/api/admin/pharmacies/batch', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { ids, action } = req.body; // action: 'activate' | 'deactivate' | 'delete'
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs inválidos.' });
    }

    try {
      const batch = db.batch();
      const now = new Date().toISOString();

      for (const id of ids) {
        const ref = db.collection('pharmacies').doc(id);
        if (action === 'activate') {
          batch.update(ref, { is_active: 1, updated_at: now });
        } else if (action === 'deactivate') {
          batch.update(ref, { is_active: 0, updated_at: now });
        } else if (action === 'delete') {
          batch.delete(ref);
          // Also cleanup logs? Maybe not.
        }
      }

      await batch.commit();
      await logAdminAction(req.user.id, 'pharmacy', 'multiple', `batch_${action}`, { count: ids.length, ids });
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Reset Password Link
  app.post('/api/admin/pharmacies/:id/reset-password', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { id } = req.params;
    
    try {
      const pharmDoc = await db.collection('pharmacies').doc(id).get();
      if (!pharmDoc.exists) return res.status(404).json({ error: 'Farmácia não encontrada.' });
      
      const email = pharmDoc.data()?.email;
      if (!email) return res.status(400).json({ error: 'E-mail não configurado para esta farmácia.' });

      // Generate reset link
      const link = await auth.generatePasswordResetLink(email);
      
      // In a real production app, we would send this via email using a service.
      // Here we will return it so the admin can copy or we can log that it was triggered.
      await logAdminAction(req.user.id, 'pharmacy', id, 'password_reset_triggered', { email });
      
      res.json({ success: true, link });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get All Shifts (PAGINATED)
  app.get('/api/admin/shifts', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    const limitDays = Number(req.query.days) || 30; // Default to last 30 days of shifts
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - limitDays);
    
    try {
      // In a real app, pagination is key. Here we'll limit by date range to keep it manageable.
      const shiftsSnapshot = await db.collection('shifts')
        .where('date', '>=', pastDate.toISOString().split('T')[0])
        .orderBy('date', 'desc')
        .limit(1000)
        .get();

      // We only fetch pharmacies that are in these shifts to save reads
      const pharmacyIds = [...new Set(shiftsSnapshot.docs.map(d => d.data().pharmacy_id))];
      const pharmaciesMap = new Map();
      
      // Fetch pharmacies in chunks of 30
      for (let i = 0; i < pharmacyIds.length; i += 30) {
        const chunk = pharmacyIds.slice(i, i + 30);
        const pSnap = await db.collection('pharmacies').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
        pSnap.forEach(doc => pharmaciesMap.set(doc.id, doc.data()));
      }

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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      console.log('Creating shift:', req.body);
      const { pharmacy_id, user_id, date, start_time, end_time, is_24h } = req.body;
      
      const pharmacyDoc = await db.collection('pharmacies').doc(pharmacy_id).get();
      if (!pharmacyDoc.exists) return res.status(404).json({ error: 'Farmácia não encontrada para o ID informado.' });
      const pharmacyData = pharmacyDoc.data();

      const newShift = {
        pharmacy_id,
        user_id: user_id || pharmacyData?.user_id || '',
        date,
        start_time: is_24h ? '00:00' : start_time,
        end_time: is_24h ? '23:59' : end_time,
        is_24h: is_24h ? 1 : 0,
        city: pharmacyData?.city || '',
        state: pharmacyData?.state || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      console.log('New shift object:', newShift);
      const docRef = await db.collection('shifts').add(newShift);
      console.log('Shift created with ID:', docRef.id);
      
      await updateDashboardStats();
      await logAdminAction(req.user.id, 'shift', docRef.id, 'create', { pharmacy_id, date });
      
      res.status(201).json({ id: docRef.id, ...newShift });
    } catch (err: any) {
      console.error('Error creating shift:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update Shift
  app.put('/api/admin/shifts/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const shiftDoc = await db.collection('shifts').doc(req.params.id).get();
      if (!shiftDoc.exists) return res.status(404).json({ error: ERRORS.SHIFT_NOT_FOUND });
      
      const { pharmacy_id, date, start_time, end_time, is_24h } = req.body;

      const pharmacyDoc = await db.collection('pharmacies').doc(pharmacy_id).get();
      if (!pharmacyDoc.exists) return res.status(404).json({ error: 'Farmácia não encontrada para o ID informado.' });
      const pharmacyData = pharmacyDoc.data();

      const updatedData = {
        pharmacy_id,
        date,
        start_time: is_24h ? '00:00' : start_time,
        end_time: is_24h ? '23:59' : end_time,
        is_24h: is_24h ? 1 : 0,
        city: pharmacyData?.city || '',
        state: pharmacyData?.state || '',
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      await db.collection('shifts').doc(req.params.id).delete();
      res.json({ message: 'Shift deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Reports
  app.get('/api/admin/reports', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    
    try {
      const pharmaciesSnapshot = await db.collection('pharmacies').get();
      const pharmaciesMap = new Map();
      
      for (const pDoc of pharmaciesSnapshot.docs) {
        const p = pDoc.data();
        pharmaciesMap.set(pDoc.id, p);
        
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

      // Sync locations in shifts and cleanup orphans
      const shiftsSnapshot = await db.collection('shifts').get();
      let shiftCleanupCount = 0;
      let shiftSyncCount = 0;

      for (const sDoc of shiftsSnapshot.docs) {
        const s = sDoc.data();
        const pharm = pharmaciesMap.get(s.pharmacy_id);
        
        if (!pharm) {
          // Orphan shift detected - delete it
          await sDoc.ref.delete();
          shiftCleanupCount++;
        } else {
          // Check if location needs sync
          if (s.city !== pharm.city || s.state !== pharm.state) {
            await sDoc.ref.update({
              city: pharm.city || '',
              state: pharm.state || ''
            });
            shiftSyncCount++;
          }
        }
      }
      
      await updateDashboardStats();
      res.json({ 
        success: true, 
        message: `Dados sincronizados. Plantões limpos: ${shiftCleanupCount}. Plantões atualizados: ${shiftSyncCount}.` 
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Set Highlight
  // Admin: Get Highlights (with pharmacy names)
  app.get('/api/admin/highlights', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const snapshot = await db.collection('highlights').orderBy('created_at', 'desc').limit(200).get();
      
      // Pegar todos os pharmacy_ids únicos para buscar nomes em lote
      const pharmacyIds = [...new Set(snapshot.docs.map(doc => doc.data().pharmacy_id))];
      const pharmaciesMap = new Map();
      
      if (pharmacyIds.length > 0) {
        // Fracionar em chunks de 30 para evitar limites do Firestore 'in'
        for (let i = 0; i < pharmacyIds.length; i += 30) {
          const chunk = pharmacyIds.slice(i, i + 30);
          const pSnap = await db.collection('pharmacies').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
          pSnap.forEach(doc => pharmaciesMap.set(doc.id, doc.data().name));
        }
      }

      const highlights = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          pharmacy_name: pharmaciesMap.get(data.pharmacy_id) || 'ID: ' + data.pharmacy_id
        };
      });

      res.json(highlights);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/highlights', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { pharmacy_id, type, date_start, date_end, city, state } = req.body;
    
    try {
      const now = new Date().toISOString();
      const pharmacyDoc = await db.collection('pharmacies').doc(pharmacy_id).get();
      const userId = pharmacyDoc.exists ? (pharmacyDoc.data()?.user_id || '') : '';

      const docRef = await db.collection('highlights').add({
        pharmacy_id,
        user_id: userId,
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

  // Admin: Delete Highlight
  app.delete('/api/admin/highlights/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      await db.collection('highlights').doc(req.params.id).delete();
      res.json({ message: 'Highlight deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Config (MercadoPago + General)
  app.get('/api/admin/config', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const [mpDoc, genDoc] = await Promise.all([
        db.collection('config').doc('mercadopago').get(),
        db.collection('config').doc('general').get()
      ]);
      
      res.json({
        mercadopago: mpDoc.data() || {},
        general: genDoc.data() || {}
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update Config
  app.post('/api/admin/config', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const { mercadopago, general } = req.body;
      const now = new Date().toISOString();
      
      const batch = db.batch();
      
      if (mercadopago) {
        batch.set(db.collection('config').doc('mercadopago'), {
          ...mercadopago,
          updated_at: now
        }, { merge: true });
      }
      
      if (general) {
        batch.set(db.collection('config').doc('general'), {
          ...general,
          updated_at: now
        }, { merge: true });
      }

      await batch.commit();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Subscription Plans
  // Admin: Get Audit Logs
  app.get('/api/admin/audit-logs', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const limitDays = Number(req.query.days) || 7;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.limit) || 50;

    try {
      const snapshot = await db.collection('audit_logs')
        .orderBy('timestamp', 'desc')
        .limit(pageSize * 10) // Limit to keep it reasonable
        .get();

      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      res.json({
        data: logs.slice((page - 1) * pageSize, page * pageSize),
        total: logs.length
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/subscription-plans', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
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

  // Admin: Get Subscriptions (Subscribers - PAGINATED)
  app.get('/api/admin/subscriptions', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const subsSnapshot = await db.collection('subscriptions').orderBy('created_at', 'desc').limit(1000).get();
      
      // Optimization: Instead of fetching ALL pharmacies, fetch only those needed (PARALLELIZED)
      const pharmacyIds = [...new Set(subsSnapshot.docs.map(d => d.data().pharmacy_id))];
      const pharmMap = new Map();
      
      const chunks = [];
      for (let i = 0; i < pharmacyIds.length; i += 30) {
        chunks.push(pharmacyIds.slice(i, i + 30));
      }

      await Promise.all(chunks.map(async (chunk) => {
        const pSnap = await db.collection('pharmacies').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
        pSnap.forEach(doc => pharmMap.set(doc.id, doc.data()));
      }));

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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const { status, plan_type, next_billing_date, expires_at } = req.body;
      const subRef = db.collection('subscriptions').doc(req.params.id);
      const subDoc = await subRef.get();
      if (!subDoc.exists) return res.status(404).json({ error: ERRORS.SUBSCRIPTION_NOT_FOUND });

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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    try {
      const subRef = db.collection('subscriptions').doc(req.params.id);
      const subDoc = await subRef.get();
      if (!subDoc.exists) return res.status(404).json({ error: ERRORS.SUBSCRIPTION_NOT_FOUND });

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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
    const { access_token } = req.body;
    
    if (!access_token) return res.status(400).json({ error: ERRORS.ACCESS_TOKEN_REQUIRED });

    try {
      if (access_token === 'TEST-1234567890' || access_token === 'YOUR_MERCADOPAGO_ACCESS_TOKEN') {
        return res.status(400).json({ 
          success: false, 
          error: ERRORS.TEST_TOKEN_DETECTED,
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
    if (req.user.role !== 'admin') return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
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
    res.status(404).json({ 
      error: ERRORS.ROUTE_NOT_FOUND, 
      details: `${req.method} ${req.url}` 
    });
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
    const distPath = path.join(__dirname, 'dist');
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

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Migration: Populate missing slugs for pharmacies
    try {
      const snapshot = await db.collection('pharmacies').get();
      const batch = db.batch();
      let count = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (!data.slug) {
          const slug = generateSlug(data.name || '', data.city || '', data.state || '');
          batch.update(doc.ref, { slug });
          count++;
        }
      });
      
      if (count > 0) {
        await batch.commit();
        console.log(`Migration: Added slugs to ${count} pharmacies.`);
      }
    } catch (e) {
      console.error('Migration failed:', e);
    }
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
