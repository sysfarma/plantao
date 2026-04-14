import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';
import fetch from 'node-fetch';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const auth = getAuth(app);

async function test() {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, 'sys.farmaciasdeplantao@gmail.com', 'admin123');
    const token = await userCredential.user.getIdToken();
    
    const res = await fetch('http://localhost:3000/api/admin/pharmacies', {
      headers: { 'X-App-Token': `Bearer ${token}` }
    });
    const text = await res.text();
    console.log('Admin Pharmacies Status:', res.status);
    console.log('Body:', text.substring(0, 200));
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
test();
