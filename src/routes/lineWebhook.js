const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firebase');
const { replyText, isValidLineSignature } = require('../services/lineService');
const { generatePassword, hashPassword } = require('../utils/password');
const router = express.Router();

async function findUserByLine(lineUserId){
  const s=await db.collection('users').where('lineUserId','==',lineUserId).limit(1).get();
  return s.empty?null:{id:s.docs[0].id,...s.docs[0].data()};
}
async function createQr(courseCode, user){
  const courseSnap = await db.collection('courses').where('courseCode','==',courseCode).limit(1).get();
  const course = courseSnap.empty ? { courseCode, courseId:'', teacherId:user.id, semesterId:'' } : { id:courseSnap.docs[0].id, ...courseSnap.docs[0].data() };
  const token=uuidv4();
  const url=`${process.env.WEB_BASE_URL}/checkin/${token}`;
  await db.collection('qr_sessions').add({
    courseId:course.id||'', courseCode, teacherId:user.id, semesterId:course.semesterId||'', qrToken:token,
    startTime:new Date().toISOString(), expireTime:new Date(Date.now()+30*60000).toISOString(), status:'active', createdAt:new Date().toISOString()
  });
  return { url, qr: await QRCode.toDataURL(url) };
}
router.post('/webhook', async (req,res)=>{
  if(process.env.NODE_ENV==='production' && !isValidLineSignature(req)) return res.status(401).end();
  res.status(200).end();
  for(const event of req.body.events || []){
    if(event.type !== 'message' || event.message.type !== 'text') continue;
    const text = event.message.text.trim();
    const lineUserId = event.source.userId;
    const user = await findUserByLine(lineUserId);
    try{
      if(text.startsWith('ลงทะเบียนอาจารย์') || text.startsWith('ลงทะเบียนเจ้าหน้าที่') || text.startsWith('ลงทะเบียน')){
        const role = text.startsWith('ลงทะเบียนอาจารย์') ? 'teacher' : text.startsWith('ลงทะเบียนเจ้าหน้าที่') ? 'staff' : 'student';
        const name = text.replace('ลงทะเบียนอาจารย์','').replace('ลงทะเบียนเจ้าหน้าที่','').replace('ลงทะเบียน','').trim() || 'LINE User';
        const exists = await findUserByLine(lineUserId);
        if(exists) return replyText(event.replyToken, 'คุณลงทะเบียนไว้แล้ว');
        await db.collection('users').add({ role, name, lineUserId, status:'pending', createdAt:new Date().toISOString() });
        return replyText(event.replyToken, 'บันทึกลงทะเบียนแล้ว กรุณารอ Admin อนุมัติ');
      }
      if(text.startsWith('ขอลิงค์')){
        if(!user || !['teacher','admin'].includes(user.role)) return replyText(event.replyToken,'คำสั่งนี้ใช้ได้เฉพาะอาจารย์/Admin');
        const courseCode = text.split(/\s+/)[1];
        if(!courseCode) return replyText(event.replyToken,'กรุณาพิมพ์: ขอลิงค์ [รหัสวิชา]');
        const { url } = await createQr(courseCode, user);
        return replyText(event.replyToken, `ลิงก์เช็คชื่อ ${courseCode}\nหมดอายุใน 30 นาที\n${url}`);
      }
      if(text.startsWith('ส่งงาน')){
        if(!user) return replyText(event.replyToken,'กรุณาลงทะเบียนก่อน');
        const parts=text.split(/\s+/); const courseCode=parts[1]; const youtubeUrl=parts.find(p=>p.startsWith('http'));
        if(!courseCode || !youtubeUrl) return replyText(event.replyToken,'กรุณาพิมพ์: ส่งงาน [รหัสวิชา] [ลิงก์ YouTube]');
        const c=await db.collection('courses').where('courseCode','==',courseCode).limit(1).get();
        await db.collection('submissions').add({ studentId:user.id, courseId:c.empty?'':c.docs[0].id, courseCode, youtubeUrl, status:'ยังไม่ตรวจ', submitDate:new Date().toISOString().slice(0,10), submitTime:new Date().toISOString(), createdAt:new Date().toISOString() });
        return replyText(event.replyToken,'บันทึกการส่งงานแล้ว');
      }
      if(text.startsWith('ลา')){
        if(!user) return replyText(event.replyToken,'กรุณาลงทะเบียนก่อน');
        const parts=text.split(/\s+/); const courseCode=parts[1]; const leaveType=parts[2]; const reason=parts.slice(3).join(' ');
        await db.collection('leave_requests').add({ studentId:user.id, courseCode, leaveType, reason, leaveDate:new Date().toISOString().slice(0,10), createdAt:new Date().toISOString() });
        return replyText(event.replyToken,'บันทึกการลาแล้ว');
      }
      if(text === 'ข้อมูลของฉัน') return replyText(event.replyToken, user ? `ชื่อ: ${user.name}\nสถานะ: ${user.status}\nสิทธิ์: ${user.role}` : 'ยังไม่พบข้อมูล กรุณาลงทะเบียน');
      if(text.startsWith('สรุปวันนี้') || text === 'สรุประบบวันนี้') return replyText(event.replyToken, `ดูสรุปบนเว็บ: ${process.env.WEB_BASE_URL}/dashboard`);
      return replyText(event.replyToken, 'คำสั่งที่ใช้ได้: ลงทะเบียน, ขอลิงค์ [รหัสวิชา], ส่งงาน [รหัสวิชา] [ลิงก์], ลา [รหัสวิชา] [ประเภท] [เหตุผล], ข้อมูลของฉัน');
    }catch(e){ await replyText(event.replyToken, `เกิดข้อผิดพลาด: ${e.message}`); }
  }
});
module.exports=router;
