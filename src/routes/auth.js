const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');
const { comparePassword } = require('../utils/password');
const router = express.Router();

router.get('/login',(req,res)=>res.render('pages/login',{title:'Login',user:req.session.user}));
router.post('/login', async (req,res)=>{
  const { email, password } = req.body;
  const snap = await db.collection('users').where('email','==',email).limit(1).get();
  if(snap.empty){ req.flash('error','ไม่พบผู้ใช้'); return res.redirect('/login'); }
  const doc=snap.docs[0]; const user={id:doc.id,...doc.data()};
  if(user.status !== 'approved'){ req.flash('error','บัญชียังไม่อนุมัติ'); return res.redirect('/login'); }
  if(!await comparePassword(password, user.passwordHash || '')){ req.flash('error','รหัสผ่านไม่ถูกต้อง'); return res.redirect('/login'); }
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    lineUserId: user.lineUserId || '',
    studentId: user.studentId || user.id,
    teacherId: user.teacherId || user.id,
    staffId: user.staffId || user.id
  };
  res.redirect('/dashboard');
});
router.post('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

router.get('/line', (req,res)=>{
  const state = Math.random().toString(36).slice(2);
  req.session.lineState = state;
  const params = new URLSearchParams({
    response_type:'code', client_id:process.env.LINE_LOGIN_CHANNEL_ID, redirect_uri:process.env.LINE_LOGIN_CALLBACK_URL,
    state, scope:'profile openid email', bot_prompt:'normal'
  });
  res.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`);
});

router.get('/line/callback', async (req,res)=>{
  try{
    const { code, state } = req.query;
    if(!code || state !== req.session.lineState) throw new Error('LINE state ไม่ถูกต้อง');
    const tokenResp = await axios.post('https://api.line.me/oauth2/v2.1/token', new URLSearchParams({
      grant_type:'authorization_code', code, redirect_uri:process.env.LINE_LOGIN_CALLBACK_URL,
      client_id:process.env.LINE_LOGIN_CHANNEL_ID, client_secret:process.env.LINE_LOGIN_CHANNEL_SECRET
    }), { headers:{'Content-Type':'application/x-www-form-urlencoded'} });
    const decoded = jwt.decode(tokenResp.data.id_token);
    const profile = await axios.get('https://api.line.me/v2/profile', { headers:{ Authorization:`Bearer ${tokenResp.data.access_token}` }});
    const lineUserId = profile.data.userId;
    let snap = await db.collection('users').where('lineUserId','==',lineUserId).limit(1).get();
    if(snap.empty && decoded?.email) snap = await db.collection('users').where('email','==',decoded.email).limit(1).get();
    if(snap.empty){
      const ref = await db.collection('users').add({
        role:'student', name:profile.data.displayName, email:decoded?.email || '', lineUserId,
        status:'pending', createdAt:new Date().toISOString()
      });
      req.flash('success','ลงทะเบียน LINE แล้ว กรุณารอ Admin อนุมัติ');
      return res.redirect('/login');
    }
    const doc=snap.docs[0]; const user={id:doc.id,...doc.data()};
    await db.collection('users').doc(user.id).set({lineUserId, lineDisplayName:profile.data.displayName, updatedAt:new Date().toISOString()},{merge:true});
    if(user.status !== 'approved'){ req.flash('error','บัญชียังไม่อนุมัติ'); return res.redirect('/login'); }
    req.session.user={id:user.id, name:user.name||profile.data.displayName, email:user.email, role:user.role, lineUserId};
    res.redirect('/dashboard');
  }catch(e){ req.flash('error',e.message); res.redirect('/login'); }
});
module.exports = router;
