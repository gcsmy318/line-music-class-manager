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
router.get('/webhook', (req, res) => {
  res.status(200).send('LINE webhook is ready');
});


router.post('/webhook', async (req,res)=>{
  //if(process.env.NODE_ENV==='production' && !isValidLineSignature(req)) return res.status(401).end();
  res.status(200).end();
  for(const event of req.body.events || []){
    if(event.type !== 'message' || event.message.type !== 'text') continue;
    const text = event.message.text.trim();
    const lineUserId = event.source.userId;
    const user = await findUserByLine(lineUserId);
    try{
  if (text === 'ลงทะเบียน') {
    return replyText(event.replyToken,
      'กรุณาส่งข้อมูลตามรูปแบบนี้:\n\n' +
      'ลงทะเบียน\n' +
      'รหัสนิสิต: 66000001\n' +
      'ชื่อ-สกุล: สมชาย ใจดี\n' +
      'เบอร์โทร: 0812345678\n' +
      'อีเมล: somchai@example.com\n' +
      'วิชาเอก: ดนตรีสากล\n' +
      'ชั้นปี: 1\n' +
      'เครื่องดนตรีหลัก: Guitar\n' +
      'สถานที่ทำงาน: ร้าน ABC\n' +
      'ชั่วโมงทำงานต่อสัปดาห์: 20\n' +
      'รายได้โดยประมาณ: 5000'
    );
  }

      if (text.startsWith('ลงทะเบียน')) {
        const studentId = text.match(/รหัสนิสิต:\s*(.*)/)?.[1]?.trim();
        const fullName = text.match(/ชื่อ-สกุล:\s*(.*)/)?.[1]?.trim();
        const phone = text.match(/เบอร์โทร:\s*(.*)/)?.[1]?.trim();
        const email = text.match(/อีเมล:\s*(.*)/)?.[1]?.trim();
        const major = text.match(/วิชาเอก:\s*(.*)/)?.[1]?.trim();
        const year = text.match(/ชั้นปี:\s*(.*)/)?.[1]?.trim();
        const mainInstrument = text.match(/เครื่องดนตรีหลัก:\s*(.*)/)?.[1]?.trim();
        const workPlace = text.match(/สถานที่ทำงาน:\s*(.*)/)?.[1]?.trim() || '';
        const workHoursPerWeek = text.match(/ชั่วโมงทำงานต่อสัปดาห์:\s*(.*)/)?.[1]?.trim() || '';
        const income = text.match(/รายได้โดยประมาณ:\s*(.*)/)?.[1]?.trim() || '';

        if (!studentId || !fullName || !phone || !email) {
          return replyText(event.replyToken,
            'ข้อมูลไม่ครบ กรุณาส่งแบบนี้:\n\n' +
            'ลงทะเบียน\n' +
            'รหัสนิสิต: 66000001\n' +
            'ชื่อ-สกุล: สมชาย ใจดี\n' +
            'เบอร์โทร: 0812345678\n' +
            'อีเมล: somchai@example.com\n' +
            'วิชาเอก: ดนตรีสากล\n' +
            'ชั้นปี: 1\n' +
            'เครื่องดนตรีหลัก: Guitar'
          );
        }

        const exists = await db.collection('users')
          .where('lineUserId', '==', lineUserId)
          .limit(1)
          .get();

        if (!exists.empty) {
          return replyText(event.replyToken, 'คุณลงทะเบียนไว้แล้ว');
        }

        await db.collection('users').doc(studentId).set({
          userId: studentId,
          role: 'student',
          studentId,
          name: fullName,
          phone,
          email,
          lineUserId,
          status: 'pending',
          createdAt: new Date().toISOString()
        }, { merge: true });

        await db.collection('students').doc(studentId).set({
          studentId,
          fullName,
          phone,
          email,
          major,
          year,
          mainInstrument,
          workPlace,
          workHoursPerWeek,
          income,
          lineUserId,
          createdAt: new Date().toISOString()
        }, { merge: true });

        return replyText(event.replyToken,
          'ลงทะเบียนสำเร็จแล้ว\n' +
          'สถานะ: รอ Admin อนุมัติ\n\n' +
          `รหัสนิสิต: ${studentId}\n` +
          `ชื่อ: ${fullName}`
        );
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
