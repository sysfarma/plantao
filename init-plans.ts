import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));

admin.initializeApp({
  projectId: firebaseConfig.projectId,
});
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function setFreePlan() {
  const docRef = db.collection('config').doc('subscription_plans');
  const doc = await docRef.get();
  
  if (!doc.exists) {
    await docRef.set({
      free: { active: true, price: 0, title: 'Plano Gratuito', frequency: 1, frequency_type: 'years', benefits: [] },
      monthly: { active: true, price: 6.90, title: 'Plano Mensal', frequency: 1, frequency_type: 'months', benefits: [] },
      annual: { active: true, price: 69.96, title: 'Plano Anual', frequency: 1, frequency_type: 'years', benefits: [] }
    });
  } else {
    const data = doc.data() || {};
    let needsUpdate = false;
    if (!data.free && !Object.values(data).some((x:any) => x.price === 0)) {
      data.free = { active: true, price: 0, title: 'Plano Gratuito', frequency: 1, frequency_type: 'years', benefits: [] };
      needsUpdate = true;
    }
    if (needsUpdate) {
      await docRef.update(data);
    }
  }
  console.log("Plans ensured.");
  process.exit(0);
}

setFreePlan();
