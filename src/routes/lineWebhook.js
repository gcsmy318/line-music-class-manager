const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firebase');
const { replyText, isValidLineSignature } = require('../services/lineService');
const { generatePassword, hashPassword } = require('../utils/password');
const router = express.Router();

const {
  getThaiDateString,
  getSummaryGroupByDestination,
  saveSummaryGroup,
  setSummaryGroupEnabled,
  buildAttendanceSummary
} = require('../services/attendanceSummaryService');

async function findUserByLine(lineUserId){
  const s=await db.collection('users').where('lineUserId','==',lineUserId).limit(1).get();
  return s.empty?null:{id:s.docs[0].id,...s.docs[0].data()};
}

function getLineDestination(event) {
  if (event.source?.groupId) {
    return {
      destinationId: event.source.groupId,
      sourceType: 'group'
    };
  }

  if (event.source?.roomId) {
    return {
      destinationId: event.source.roomId,
      sourceType: 'room'
    };
  }

  return {
    destinationId: event.source?.userId || '',
    sourceType: 'user'
  };
}

const SUMMARY_OWNER_LINE_ID = 'Uc3b0ae07cb29334f1269218eabbd1bb7';

function canManageSummary(user) {
  return (
    user &&
    user.lineUserId === SUMMARY_OWNER_LINE_ID
  );
}

function parseSummaryGroupSetting(text) {
  const year =
    text.match(/ชั้นปี\s*:\s*(\d+)/i)?.[1] ||
    text.match(/(?:ชั้น)?ปี\s*(\d+)/i)?.[1];

  const semester =
    text.match(/เทอม\s*:\s*(\d+)/i)?.[1] ||
    text.match(/เทอม\s*(\d+)/i)?.[1] ||
    text.match(/ภาคเรียน\s*:\s*(\d+)/i)?.[1];

  const academicYear =
    text.match(/ปีการศึกษา\s*:\s*(\d{4})/i)?.[1] ||
    text.match(/ปีการศึกษา\s*(\d{4})/i)?.[1] ||
    text.match(/(?:เทอม\s*:?\s*\d+)\s+(\d{4})/i)?.[1];

  return {
    year,
    semester,
    academicYear
  };
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
   /* if (
     process.env.NODE_ENV === 'production' &&
     !isValidLineSignature(req)
    ){
     return res.status(401).end();
    }*/
  res.status(200).end();
  for(const event of req.body.events || []){
    if(event.type !== 'message' || event.message.type !== 'text') continue;
    const text = event.message.text.trim();
    const lineUserId = event.source.userId;
    const user = await findUserByLine(lineUserId);
    try{
/*  if (text === 'ลงทะเบียน') {
    return replyText(event.replyToken,
      'กรุณา Copy ข้อความ แล้วส่งตามรูปแบบนี้:\n\n' +
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
  }*/

/*
     if (text === 'ลงทะเบียน') {
       return replyText(event.replyToken,
         'เลือกรูปแบบลงทะเบียน:\n\n' +
         '1) นิสิต\n' +
         'พิมพ์: ลงทะเบียน\nตามด้วยข้อมูลนิสิต\n\n' +
         '2) อาจารย์\n' +
         'พิมพ์: ลงทะเบียนอาจารย์\nตามด้วยข้อมูลอาจารย์\n\n' +
         '3) เจ้าหน้าที่\n' +
         'พิมพ์: ลงทะเบียนเจ้าหน้าที่\nตามด้วยข้อมูลเจ้าหน้าที่'
       );
     }*/

     /* ลงทะเบียนอาจารย์ */
     if (text.startsWith('ลงทะเบียนอาจารย์')) {
       const teacherId = text.match(/รหัสอาจารย์:\s*(.*)/)?.[1]?.trim();
       const fullName = text.match(/ชื่อ-สกุล:\s*(.*)/)?.[1]?.trim();
       const phone = text.match(/เบอร์โทร:\s*(.*)/)?.[1]?.trim();
       const email = text.match(/อีเมล:\s*(.*)/)?.[1]?.trim();
       const department = text.match(/สาขา:\s*(.*)/)?.[1]?.trim() || '';
       const instrument = text.match(/เครื่องดนตรี:\s*(.*)/)?.[1]?.trim() || '';

       if (!teacherId || !fullName || !phone || !email) {
         return replyText(event.replyToken,
           'ข้อมูลอาจารย์ไม่ครบ กรุณาส่งแบบนี้:\n\n' +
           'ลงทะเบียนอาจารย์\n' +
           'รหัสอาจารย์: T001\n' +
           'ชื่อ-สกุล: ดร.สมหญิง ใจงาม\n' +
           'เบอร์โทร: 0899999999\n' +
           'อีเมล: teacher@example.com\n' +
           'สาขา: ดนตรีสากล\n' +
           'เครื่องดนตรี: Piano'
         );
       }

       const exists = await db.collection('users')
         .where('lineUserId', '==', lineUserId)
         .limit(1)
         .get();

       if (!exists.empty) {
         return replyText(event.replyToken, 'คุณลงทะเบียนไว้แล้ว');
       }

       await db.collection('users').doc(teacherId).set({
         userId: teacherId,
         teacherId,
         role: 'teacher',
         name: fullName,
         phone,
         email,
         lineUserId,
         status: 'pending',
         createdAt: new Date().toISOString()
       }, { merge: true });

       await db.collection('teachers').doc(teacherId).set({
         teacherId,
         fullName,
         phone,
         email,
         department,
         instrument,
         lineUserId,
         createdAt: new Date().toISOString()
       }, { merge: true });

       return replyText(event.replyToken,
         'ลงทะเบียนอาจารย์สำเร็จแล้ว\n' +
         'สถานะ: รอ Admin อนุมัติ\n\n' +
         `รหัสอาจารย์: ${teacherId}\n` +
         `ชื่อ: ${fullName}`
       );
     }

     /* ลงทะเบียนเจ้าหน้าที่ */
     if (text.startsWith('ลงทะเบียนเจ้าหน้าที่')) {
       const staffId = text.match(/รหัสเจ้าหน้าที่:\s*(.*)/)?.[1]?.trim();
       const fullName = text.match(/ชื่อ-สกุล:\s*(.*)/)?.[1]?.trim();
       const phone = text.match(/เบอร์โทร:\s*(.*)/)?.[1]?.trim();
       const email = text.match(/อีเมล:\s*(.*)/)?.[1]?.trim();
       const position = text.match(/ตำแหน่ง:\s*(.*)/)?.[1]?.trim() || '';

       if (!staffId || !fullName || !phone || !email) {
         return replyText(event.replyToken,
           'ข้อมูลเจ้าหน้าที่ไม่ครบ กรุณาส่งแบบนี้:\n\n' +
           'ลงทะเบียนเจ้าหน้าที่\n' +
           'รหัสเจ้าหน้าที่: S001\n' +
           'ชื่อ-สกุล: นายทดสอบ ระบบ\n' +
           'เบอร์โทร: 0888888888\n' +
           'อีเมล: staff@example.com\n' +
           'ตำแหน่ง: เจ้าหน้าที่ห้องซ้อม'
         );
       }

       const exists = await db.collection('users')
         .where('lineUserId', '==', lineUserId)
         .limit(1)
         .get();

       if (!exists.empty) {
         return replyText(event.replyToken, 'คุณลงทะเบียนไว้แล้ว');
       }

       await db.collection('users').doc(staffId).set({
         userId: staffId,
         staffId,
         role: 'staff',
         name: fullName,
         phone,
         email,
         lineUserId,
         status: 'pending',
         createdAt: new Date().toISOString()
       }, { merge: true });

       await db.collection('staff').doc(staffId).set({
         staffId,
         fullName,
         phone,
         email,
         position,
         lineUserId,
         createdAt: new Date().toISOString()
       }, { merge: true });

       return replyText(event.replyToken,
         'ลงทะเบียนเจ้าหน้าที่สำเร็จแล้ว\n' +
         'สถานะ: รอ Admin อนุมัติ\n\n' +
         `รหัสเจ้าหน้าที่: ${staffId}\n` +
         `ชื่อ: ${fullName}`
       );
     }

     /* ลงทะเบียนนิสิต */
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
           'ข้อมูลนิสิตไม่ครบ กรุณาส่งแบบนี้:\n\n' +
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
         'ลงทะเบียนนิสิตสำเร็จแล้ว\n' +
         'สถานะ: รอ Admin อนุมัติ\n\n' +
         `รหัสนิสิต: ${studentId}\n` +
         `ชื่อ: ${fullName}`
       );
     }


if (text.startsWith('ตั้งค่ากลุ่ม')) {
  if (!canManageSummary(user)) {
    return replyText(
      event.replyToken,
      'คำสั่งนี้ใช้ได้เฉพาะ Admin อาจารย์ หรือเจ้าหน้าที่ที่ได้รับอนุมัติแล้ว'
    );
  }

  const { destinationId, sourceType } =
    getLineDestination(event);

  if (sourceType === 'user') {
    return replyText(
      event.replyToken,
      'กรุณาใช้คำสั่งนี้ในกลุ่ม LINE ที่ต้องการรับสรุป'
    );
  }

  const {
    year,
    semester,
    academicYear
  } = parseSummaryGroupSetting(text);

  if (!year || !semester || !academicYear) {
    return replyText(
      event.replyToken,
      'กรุณาพิมพ์:\n' +
      'ตั้งค่ากลุ่ม ชั้นปี: 1 เทอม: 1 ปีการศึกษา: 2569'
    );
  }

  await saveSummaryGroup({
    destinationId,
    sourceType,
    year,
    semester,
    academicYear,
    configuredBy: user.id,
    enabled: true
  });

  return replyText(
    event.replyToken,
    '✅ ตั้งค่ากลุ่มเรียบร้อย\n\n' +
    `ชั้นปี: ${year}\n` +
    `เทอม: ${semester}\n` +
    `ปีการศึกษา: ${academicYear}\n` +
    'ส่งอัตโนมัติทุกวันเวลา 20:00 น.'
  );
}

if (
  text === 'ดูค่ากลุ่ม' ||
  text === 'ดูการตั้งค่ากลุ่ม'
) {
  const { destinationId } =
    getLineDestination(event);

  const config =
    await getSummaryGroupByDestination(destinationId);

  if (!config) {
    return replyText(
      event.replyToken,
      'กลุ่มนี้ยังไม่ได้ตั้งค่ารับสรุป'
    );
  }

  return replyText(
    event.replyToken,
    '⚙️ การตั้งค่ากลุ่ม\n\n' +
    `ชั้นปี: ${config.studentYear}\n` +
    `เทอม: ${config.semester}\n` +
    `ปีการศึกษา: ${config.academicYear}\n` +
    `สถานะ: ${config.enabled ? 'เปิด' : 'ปิด'}`
  );
}

if (text === 'เปิดสรุปกลุ่ม') {
  if (!canManageSummary(user)) {
    return replyText(
      event.replyToken,
      'ไม่มีสิทธิ์ใช้คำสั่งนี้'
    );
  }

  const { destinationId } =
    getLineDestination(event);

  const config =
    await setSummaryGroupEnabled(destinationId, true);

  if (!config) {
    return replyText(
      event.replyToken,
      'กลุ่มนี้ยังไม่ได้ตั้งค่า'
    );
  }

  return replyText(
    event.replyToken,
    '✅ เปิดสรุปอัตโนมัติแล้ว'
  );
}

if (text === 'ปิดสรุปกลุ่ม') {
  if (!canManageSummary(user)) {
    return replyText(
      event.replyToken,
      'ไม่มีสิทธิ์ใช้คำสั่งนี้'
    );
  }

  const { destinationId } =
    getLineDestination(event);

  const config =
    await setSummaryGroupEnabled(destinationId, false);

  if (!config) {
    return replyText(
      event.replyToken,
      'กลุ่มนี้ยังไม่ได้ตั้งค่า'
    );
  }

  return replyText(
    event.replyToken,
    '⏸ ปิดสรุปอัตโนมัติแล้ว'
  );
}

if (
  text === 'สรุปเข้าเรียน' ||
  text === 'สรุปการเข้าเรียน' ||
  text === 'สรุปวันนี้'
) {
  const { destinationId } =
    getLineDestination(event);

  const config =
    await getSummaryGroupByDestination(destinationId);

  if (!config) {
    return replyText(
      event.replyToken,
      'กลุ่มนี้ยังไม่ได้ตั้งค่า\n\n' +
      'พิมพ์:\n' +
      'ตั้งค่ากลุ่ม ชั้นปี: 1 เทอม: 1 ปีการศึกษา: 2569'
    );
  }

  const summary =
    await buildAttendanceSummary(
      config,
      getThaiDateString()
    );

  return replyText(
    event.replyToken,
    summary
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
/*
      if(text.startsWith('สรุปวันนี้') || text === 'สรุประบบวันนี้') return replyText(event.replyToken, `ดูสรุปบนเว็บ: ${process.env.WEB_BASE_URL}/dashboard`);
*/

      if (text === 'สรุประบบวันนี้') {
        return replyText(
          event.replyToken,
          `ดูสรุประบบบนเว็บ: ${process.env.WEB_BASE_URL}/dashboard`
        );
      }

      return;
    }catch(e){ await replyText(event.replyToken, `เกิดข้อผิดพลาด: ${e.message}`); }
  }
});
module.exports=router;
