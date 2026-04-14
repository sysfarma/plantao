import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

async function test() {
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform'
  });
  const client = await auth.getClient();
  const credentials = await auth.getCredentials();
  console.log('Credentials:', credentials);
  
  const projectId = await auth.getProjectId();
  console.log('Project ID:', projectId);
}

test();
