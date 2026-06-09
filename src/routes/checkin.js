const express = require('express');
const { db } = require('../config/firebase');
const { distanceMeters } = require('../utils/geo');
const { requireLogin } = require('../middleware/auth');
const router=express.Router();
router.get('/:token', (req,res)=>res.render('pages/checkin',{title:'Check-in',token:req.params.token,user:req.session.user}));
router.post('/:token', requireLogin, async (req,res)=>{
  const snap=await db.collection('qr_sessions').where('qrToken','==',req.params.token).limit(1).get();
  if(snap.empty) return res.status(404).render('pages/error',{title:'QR ไม่ถูกต้อง',message:'ไม่พบ QR session',user:req.session.user});
  const session={id:snap.docs[0].id,...snap.docs[0].data()};
  if(new Date(session.expireTime) < new Date()) return res.render('pages/error',{title:'หมดอายุ',message:'QR Code หมดอายุแล้ว',user:req.session.user});
  const lat=Number(req.body.latitude), lng=Number(req.body.longitude);
  const baseLat=Number(req.body.classLatitude || lat), baseLng=Number(req.body.classLongitude || lng);
  const dist=distanceMeters(baseLat,baseLng,lat,lng);
  await db.collection('attendance').add({ qrSessionId:session.id, studentId:req.session.user.id, courseId:session.courseId, courseCode:session.courseCode, teacherId:session.teacherId, semesterId:session.semesterId, checkInTime:new Date().toISOString(), latitude:lat, longitude:lng, distance:dist, locationStatus:dist<=50?'ในพื้นที่':'นอกพื้นที่', attendanceStatus:'มาเรียน', createdAt:new Date().toISOString() });
  res.render('pages/success',{title:'เช็คชื่อสำเร็จ',message:`บันทึกแล้ว (${dist.toFixed(0)} เมตร / ${dist<=50?'ในพื้นที่':'นอกพื้นที่'})`,user:req.session.user});
});
module.exports=router;
