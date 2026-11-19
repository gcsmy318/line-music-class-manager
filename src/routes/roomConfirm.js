'use strict';
// Old GPS URL preserved, but it now checks in one selected approved booking.
const express=require('express');
const {db}=require('../config/firebase');
const {bangkokDate,userOwnsBooking,checkinBooking}=require('../services/roomCheckinService');
const router=express.Router();
function access(req,res,next){
  if(!req.session.user)return res.redirect('/login');
  if(!['student','admin','staff'].includes(req.session.user.role))return res.redirect('/dashboard');
  next();
}
router.get('/',access,async(req,res)=>{
  try {
    const today=bangkokDate();
    // Don't allow the URL to initiate a historical check-in.
    const selectedDate=/^\d{4}-\d{2}-\d{2}$/.test(req.query.date||'')?req.query.date:today;
    const snap=await db.collection('bookings').where('bookingDate','==',selectedDate).get();
    const bookings=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(b=>b.status==='approved'&&userOwnsBooking(b,req.session.user));
    res.render('pages/roomConfirm/index',{title:'เช็คอินใช้ห้องซ้อม',user:req.session.user,
      bookings,selectedDate,facultyLat:Number(process.env.ROOM_CHECKIN_LAT||7.166300),
      facultyLng:Number(process.env.ROOM_CHECKIN_LNG||100.611800),
      allowRadius:Number(process.env.ROOM_CHECKIN_RADIUS_METERS||50)});
  }catch(e){console.error('room confirm get',e);res.status(500).send('ไม่สามารถโหลดการจอง');}
});
router.post('/checkin',access,async(req,res)=>{
  try {
    const result=await checkinBooking({
      bookingId:req.body.bookingId,user:req.session.user,
      latitude:req.body.latitude,longitude:req.body.longitude,
      scanType:'web_gps_checkin'
    });
    req.flash(result.duplicate?'error':'success',result.duplicate?'รายการนี้เช็คอินแล้ว':'เช็คอินห้องซ้อมสำเร็จ');
  }catch(e){req.flash('error',e.message);}
  res.redirect('/room-confirm');
});
module.exports=router;
