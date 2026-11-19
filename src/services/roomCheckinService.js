'use strict';
const { db } = require('../config/firebase');
const { distanceMeters } = require('../utils/geo');

const CENTER_LAT = Number(process.env.ROOM_CHECKIN_LAT || 7.166300);
const CENTER_LNG = Number(process.env.ROOM_CHECKIN_LNG || 100.611800);
const MAX_DISTANCE = Number(process.env.ROOM_CHECKIN_RADIUS_METERS || 50);

function bangkokDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
}
function bangkokMinutes(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Bangkok', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return Number(parts.hour)*60 + Number(parts.minute);
}
function minutes(s) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s||''))) return NaN;
  const [h,m] = s.split(':').map(Number); return h*60+m;
}
function userOwnsBooking(booking,user) {
  if (!booking || !user) return false;
  const self = new Set([user.id,user.studentId,user.teacherId].filter(Boolean).map(String));
  return [booking.userId,booking.bookerId,booking.studentId,booking.teacherId]
    .filter(Boolean).some(v=>self.has(String(v)));
}
function validateGps(latitude,longitude) {
  if (latitude === '' || longitude === '' || latitude == null || longitude == null) {
    throw new Error('กรุณาเปิด GPS');
  }
  const lat=Number(latitude), lng=Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) {
    throw new Error('พิกัด GPS ไม่ถูกต้อง');
  }
  const distance=distanceMeters(CENTER_LAT,CENTER_LNG,lat,lng);
  if (!Number.isFinite(distance) || distance>MAX_DISTANCE) {
    throw new Error(`อยู่นอกบริเวณห้องซ้อม (${Math.round(distance)} เมตร)`);
  }
  return { lat,lng,distance };
}
function inBookingWindow(b, now = new Date()) {
  const date=bangkokDate(now);
  if (b.bookingDate!==date) return false;
  const start=minutes(b.startTime), end=minutes(b.endTime);
  const current=bangkokMinutes(now);
  if (!Number.isFinite(start)||!Number.isFinite(end)||end<=start) return false;
  return current>=start-15 && current<=end;
}
async function checkinBooking({bookingId,user,latitude,longitude,roomId=null,qrToken=null,scanType='web_gps_checkin'}) {
  if (!bookingId || !user) throw new Error('ต้องเลือกรายการจองและเข้าสู่ระบบก่อน');
  const gps=validateGps(latitude,longitude);
  const now = new Date();
  const bookingRef=db.collection('bookings').doc(String(bookingId));
  const usageLogRef=db.collection('room_usage_logs').doc(`confirmed_${bookingId}`);
  return db.runTransaction(async tx=>{
    const bookingDoc=await tx.get(bookingRef);
    if (!bookingDoc.exists) throw new Error('ไม่พบรายการจอง');
    const b=bookingDoc.data();
    if (!userOwnsBooking(b,user)) throw new Error('ไม่มีสิทธิ์เช็คอินรายการจองนี้');
    if (b.status!=='approved') throw new Error('รายการจองยังไม่ได้รับอนุมัติ หรือถูกยกเลิก');
    if (!b.roomId || (roomId && b.roomId!==roomId)) throw new Error('ห้องที่จองไม่ตรงกับ QR');
    if (!inBookingWindow(b,now)) throw new Error('ยังไม่ถึงช่วงเวลาที่เช็คอินได้ หรือหมดเวลาจองแล้ว');
    const roomRef=db.collection('rooms').doc(String(b.roomId));
    const roomDoc=await tx.get(roomRef);
    const logDoc=await tx.get(usageLogRef);
    if (!roomDoc.exists || roomDoc.data().status!=='active') throw new Error('ห้องนี้ปิดให้บริการ');
    if (qrToken && roomDoc.data().qrToken!==qrToken) throw new Error('QR นี้ถูกเปลี่ยนหรือยกเลิกแล้ว');
    // Keep booking.status='approved'. Both the legacy form and QR share this atomic guard.
    if (b.usageStatus==='checked_in' || b.checkedInAt || logDoc.exists) return { duplicate:true, bookingId };
    const timestamp=now.toISOString();
    tx.set(bookingRef,{
      usageStatus:'checked_in', usageStatusTH:'เข้าใช้งาน', checkedInAt:timestamp,
      checkinLatitude:gps.lat, checkinLongitude:gps.lng,
      checkinDistance:gps.distance, checkinLocationStatus:'อยู่ในพื้นที่คณะดุริยาง'
    },{merge:true});
    tx.create(usageLogRef,{
      bookingId, roomId:b.roomId, roomName:b.roomName || roomDoc.data().roomName || '',
      userId:String(user.id||''), studentId:String(b.studentId||user.studentId||''),
      studentName:b.studentName||user.name||'',
      bookingDate:b.bookingDate,usageDate:b.bookingDate,
      startTime:b.startTime,endTime:b.endTime,
      usageStatus:'checked_in',usageStatusTH:'เข้าใช้งาน',scanType,
      latitude:gps.lat,longitude:gps.lng,distance:gps.distance,
      checkedInAt:timestamp,createdAt:timestamp
    });
    return { duplicate:false, bookingId };
  });
}
module.exports={bangkokDate,bangkokMinutes,minutes,userOwnsBooking,validateGps,inBookingWindow,checkinBooking};
