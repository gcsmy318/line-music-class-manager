'use strict';
const express=require('express');
const crypto=require('crypto');
const QRCode=require('qrcode');
const { db }=require('../config/firebase');
const {
  bangkokDate, userOwnsBooking, inBookingWindow, checkinBooking
}=require('../services/roomCheckinService');
const router=express.Router();
// Canonical public HTTPS origin for Render: do not trust proxy protocol as the browser URL.
function publicRoomQrOrigin(req) {
  const host = String(req.get('host') || '').split(':')[0].toLowerCase();
  if (host === 'line-music-class-manager.onrender.com') {
    return 'https://line-music-class-manager.onrender.com';
  }
  const configured = String(process.env.WEB_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')) {
        return parsed.origin;
      }
    } catch (_) { /* invalid configured URL */ }
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://line-music-class-manager.onrender.com';
  }
  return `${req.protocol}://${req.get('host')}`;
}

const token=()=>crypto.randomBytes(32).toString('hex');
const baseUrl=req=>publicRoomQrOrigin(req);
const qrUrl=(req,t)=>`${baseUrl(req)}/room-qr/${encodeURIComponent(t)}`;
function login(req,res,next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function admin(req,res,next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role!=='admin') return res.status(403).send('เฉพาะ Admin');
  next();
}

function safePost(req, res, next) {
  const allowedOrigins = new Set([
    'https://line-music-class-manager.onrender.com'
  ]);

  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:3000');
  }

  const originHeader = req.get('Origin');
  const refererHeader = req.get('Referer');

  let requestOrigin;

  try {
    if (originHeader && originHeader !== 'null') {
      requestOrigin = new URL(originHeader).origin;
    } else if (!originHeader && refererHeader) {
      requestOrigin = new URL(refererHeader).origin;
    }
  } catch (_) {
    requestOrigin = null;
  }

  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    console.warn('[RoomQR] Origin rejected', {
      origin: originHeader || null,
      referer: refererHeader || null,
      parsedOrigin: requestOrigin || null,
      host: req.get('host'),
      protocol: req.protocol
    });

    return res.status(403).send('Invalid origin');
  }

  return next();
}

router.get('/admin/room-qrcodes',admin,async(req,res)=>{
  try {
    const snap=await db.collection('rooms').get();
    const rooms=await Promise.all(snap.docs.map(async d=>{
      const v={...d.data(),id:d.id};
      v.qrImage=v.qrToken?await QRCode.toDataURL(qrUrl(req,v.qrToken),{width:240}):'';
      return v;
    }));
    rooms.sort((a,b)=>String(a.roomName||'').localeCompare(String(b.roomName||''),'th'));
    res.render('pages/admin/roomQrcodes',{title:'จัดการ QR ห้องซ้อม',user:req.session.user,rooms});
  }catch(e){console.error('room qr admin',e);res.status(500).send('ไม่สามารถโหลดข้อมูล QR ห้องซ้อม');}
});
router.post('/admin/room-qrcodes/create',admin,safePost,async(req,res)=>{
  try {
    const roomName=String(req.body.roomName||'').trim().slice(0,150);
    const roomType=String(req.body.roomType||'').trim().slice(0,40);
    const roomNo=String(req.body.roomNo||'').trim().slice(0,20);
    if(!roomName || !roomType) throw new Error('กรุณากรอกชื่อและประเภทห้อง');
    await db.collection('rooms').add({roomName,roomType,roomNo,status:'active',qrOnly:false,
      qrToken:token(),qrCreatedAt:new Date().toISOString(),createdAt:new Date().toISOString()});
    req.flash('success','สร้างห้องและ QR สำเร็จ');
  }catch(e){req.flash('error',e.message);}
  res.redirect('/admin/room-qrcodes');
});
router.post('/admin/room-qrcodes/:id/generate',admin,safePost,async(req,res)=>{
  try {
    const ref=db.collection('rooms').doc(req.params.id);
    await db.runTransaction(async tx=>{
      const d=await tx.get(ref);if(!d.exists)throw new Error('ไม่พบห้อง');
      if(!d.data().qrToken)tx.set(ref,{qrToken:token(),qrCreatedAt:new Date().toISOString()},{merge:true});
    });
    req.flash('success','สร้าง QR สำเร็จ');
  }catch(e){req.flash('error',e.message);}
  res.redirect('/admin/room-qrcodes');
});
router.post('/admin/room-qrcodes/:id/rotate',admin,safePost,async(req,res)=>{
  try {
    const ref=db.collection('rooms').doc(req.params.id);
    await db.runTransaction(async tx=>{
      const d=await tx.get(ref);if(!d.exists)throw new Error('ไม่พบห้อง');
      tx.set(ref,{qrToken:token(),qrCreatedAt:new Date().toISOString()},{merge:true});
    });
    req.flash('success','ออก QR ใหม่แล้ว กรุณาเปลี่ยนป้ายหน้าห้อง');
  }catch(e){req.flash('error',e.message);}
  res.redirect('/admin/room-qrcodes');
});
router.get('/admin/room-qrcodes/:id/png',admin,async(req,res)=>{
  try {
    const d=await db.collection('rooms').doc(req.params.id).get();
    if(!d.exists || !d.data().qrToken)return res.status(404).send('ไม่พบ QR');
    const png=await QRCode.toBuffer(qrUrl(req,d.data().qrToken),{type:'png',width:900,margin:3});
    res.set('Content-Type','image/png');
    res.set('Content-Disposition',`attachment; filename="room-${req.params.id.replace(/[^a-zA-Z0-9_-]/g,'')}.png"`);
    res.send(png);
  }catch(e){console.error('qr png',e);res.status(500).send('สร้าง QR ไม่สำเร็จ');}
});
router.get('/room-qr/:token',login,async(req,res)=>{
  try {
    const rooms=await db.collection('rooms').where('qrToken','==',req.params.token).limit(1).get();
    if(rooms.empty) return res.status(404).send('QR ไม่ถูกต้อง หรือถูกเปลี่ยนแล้ว');
    const room={id:rooms.docs[0].id,...rooms.docs[0].data()};
    if(room.status!=='active')return res.status(403).send('ห้องปิดใช้งาน');
    const snap=await db.collection('bookings').where('bookingDate','==',bangkokDate()).get();
    const bookingOptions=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(b=>b.roomId===room.id && b.status==='approved' &&
        userOwnsBooking(b,req.session.user) && inBookingWindow(b))
      .sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
    res.render('pages/roomQr/checkin',{title:'QR เช็คอินห้องซ้อม',user:req.session.user,
      room,token:req.params.token,bookingOptions});
  }catch(e){console.error('qr get',e);res.status(500).send('ไม่สามารถเปิด QR ได้');}
});
router.post('/room-qr/:token/checkin',login,safePost,async(req,res)=>{
  const back=`/room-qr/${encodeURIComponent(req.params.token)}`;
  try {
    const rooms=await db.collection('rooms').where('qrToken','==',req.params.token).limit(1).get();
    if(rooms.empty)throw new Error('QR ไม่ถูกต้องหรือถูกออกใหม่แล้ว');
    const room=rooms.docs[0];
    const result=await checkinBooking({bookingId:req.body.bookingId,user:req.session.user,
      roomId:room.id,qrToken:req.params.token,
      latitude:req.body.latitude,longitude:req.body.longitude,scanType:'room_qr_gps_checkin'});
    req.flash(result.duplicate?'error':'success',result.duplicate?'รายการนี้เช็คอินแล้ว':'เช็คอินห้องซ้อมสำเร็จ');
  }catch(e){console.error('qr checkin',e);req.flash('error',e.message);}
  res.redirect(back);
});
module.exports=router;
