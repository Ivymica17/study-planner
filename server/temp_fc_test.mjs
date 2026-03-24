import 'dotenv/config';
import fetch from 'node-fetch';

(async () => {
  try {
    const loginRes = await fetch('http://localhost:5000/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ivymica17@gmail.com',password:'password123'})});
    const loginData = await loginRes.json();
    console.log('login',loginRes.status,loginData);
    if(!loginRes.ok) return;
    const token = loginData.token;
    const modulesRes = await fetch('http://localhost:5000/modules',{headers:{'x-auth-token':token}});
    const modulesData = await modulesRes.json();
    console.log('modules',modulesRes.status,modulesData.length);
    if(!modulesRes.ok) return;
    if(!modulesData.length){console.log('no modules'); return;}
    const moduleId = modulesData[0]._id;
    console.log('moduleId', moduleId);
    const fcRes = await fetch(`http://localhost:5000/flashcards/${moduleId}/generate`, {method:'POST', headers:{'x-auth-token':token}});
    const fcData = await fcRes.json();
    console.log('flashcard', fcRes.status, fcData);
  } catch(err){ console.error('err', err); }
})();
