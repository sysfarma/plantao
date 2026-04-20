import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';

// Initialize Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const auth = getAuth(app);
const db = getFirestore(app, config.firestoreDatabaseId);

async function createAuthUsers() {
  const adminEmail = process.env.ADMIN_EMAIL || 'sys.farmaciasdeplantao@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  console.log('Starting Auth user creation...');

  // 1. Ensure Admin User
  try {
    let user;
    try {
      user = await auth.getUserByEmail(adminEmail);
      console.log(`Admin user ${adminEmail} already exists.`);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        user = await auth.createUser({
          email: adminEmail,
          password: adminPassword,
          displayName: 'Administrador'
        });
        console.log(`Admin user ${adminEmail} created.`);
      } else {
        throw e;
      }
    }

    // Ensure Firestore profile for Admin
    const adminDoc = await db.collection('users').doc(user.uid).get();
    if (!adminDoc.exists) {
      await db.collection('users').doc(user.uid).set({
        email: adminEmail,
        name: 'Administrador',
        role: 'admin',
        created_at: new Date().toISOString()
      });
      console.log('Admin Firestore profile created.');
    }
  } catch (error) {
    console.error('Error with Admin user:', error);
  }

  // 2. Create users from pharmacies (if they have emails)
  try {
    const pharmaciesSnapshot = await db.collection('pharmacies').get();
    console.log(`Checking ${pharmaciesSnapshot.size} pharmacies for Auth accounts...`);
    
    for (const doc of pharmaciesSnapshot.docs) {
      const p = doc.data();
      if (p.email && p.user_id) {
        try {
          await auth.getUser(p.user_id);
          // console.log(`User ${p.email} already exists.`);
        } catch (e: any) {
          if (e.code === 'auth/user-not-found') {
            try {
              // Create user with the specific UID from the seed
              await auth.createUser({
                uid: p.user_id,
                email: p.email,
                password: 'password123', // Default password for seeds
                displayName: p.name
              });
              console.log(`Created Auth account for ${p.email} (UID: ${p.user_id})`);
            } catch (createError: any) {
              console.error(`Failed to create user ${p.email}:`, createError.message);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error creating pharmacy users:', error);
  }

  console.log('Auth user creation completed.');
  process.exit(0);
}

createAuthUsers();
