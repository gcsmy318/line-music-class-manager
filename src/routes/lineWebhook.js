const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const { db } = require('../config/firebase');

const {
  replyText,
  isValidLineSignature
} = require('../services/lineService');

const {
  getThaiDateString,
  getSummaryGroupByDestination,
  saveSummaryGroup,
  setSummaryGroupEnabled,
  buildAttendanceSummary
} = require('../services/attendanceSummaryService');

const router = express.Router();

/**
 * LINE User ID ที่มีสิทธิ์จัดการระบบสรุป
 */
const SUMMARY_OWNER_LINE_IDS = [
  'U966a1892688e3181890a5788dee7423e'
];

/**
 * ค้นหาผู้ใช้งานจาก LINE User ID
 */
async function findUserByLine(lineUserId) {
  if (!lineUserId) {
    return null;
  }

  const snapshot = await db
    .collection('users')
    .where('lineUserId', '==', lineUserId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

/**
 * ตรวจสอบสิทธิ์เจ้าของระบบ
 */
function canManageSummary(lineUserId) {
  if (!lineUserId) {
    return false;
  }

  return SUMMARY_OWNER_LINE_IDS.includes(
    String(lineUserId).trim()
  );
}

/**
 * ดึงปลายทางของข้อความ
 *
 * groupId = กลุ่ม LINE
 * roomId = ห้องสนทนาแบบหลายคน
 * userId = แชตส่วนตัว
 */
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

/**
 * อ่านคำสั่งตั้งค่ากลุ่ม
 *
 * รองรับ:
 * ตั้งค่ากลุ่ม ชั้นปี: 1 เทอม: 1 ปีการศึกษา: 2569
 * ตั้งค่ากลุ่ม ปี1 เทอม1 2569
 */
function parseSummaryGroupSetting(text) {
  const year =
    text.match(/ชั้นปี\s*:\s*(\d+)/i)?.[1] ||
    text.match(/(?:ชั้น)?ปี\s*(\d+)/i)?.[1];

  const semester =
    text.match(/เทอม\s*:\s*(\d+)/i)?.[1] ||
    text.match(/เทอม\s*(\d+)/i)?.[1] ||
    text.match(/ภาคเรียน\s*:\s*(\d+)/i)?.[1] ||
    text.match(/ภาคเรียน\s*(\d+)/i)?.[1];

  const academicYear =
    text.match(/ปีการศึกษา\s*:\s*(\d{4})/i)?.[1] ||
    text.match(/ปีการศึกษา\s*(\d{4})/i)?.[1] ||
    text.match(/(?:เทอม|ภาคเรียน)\s*:?\s*\d+\s+(\d{4})/i)?.[1];

  return {
    year,
    semester,
    academicYear
  };
}

/**
 * สร้าง QR สำหรับเช็กชื่อ
 */
async function createQr(courseCode, user) {
  const courseSnapshot = await db
    .collection('courses')
    .where('courseCode', '==', courseCode)
    .limit(1)
    .get();

  const course = courseSnapshot.empty
    ? {
        id: '',
        courseCode,
        teacherId: user.id,
        semesterId: ''
      }
    : {
        id: courseSnapshot.docs[0].id,
        ...courseSnapshot.docs[0].data()
      };

  const token = uuidv4();

  const webBaseUrl =
    process.env.WEB_BASE_URL ||
    'http://localhost:3000';

  const url = `${webBaseUrl}/checkin/${token}`;

  const now = new Date();
  const expireTime = new Date(
    now.getTime() + 30 * 60 * 1000
  );

  await db.collection('qr_sessions').add({
    courseId: course.id || '',
    courseCode,
    teacherId: user.id,
    semesterId: course.semesterId || '',
    qrToken: token,
    startTime: now.toISOString(),
    expireTime: expireTime.toISOString(),
    status: 'active',
    createdAt: now.toISOString()
  });

  return {
    url,
    qr: await QRCode.toDataURL(url)
  };
}

/**
 * วันที่ปัจจุบันตามประเทศไทย
 */
function getCurrentThaiDate() {
  return getThaiDateString();
}

/**
 * หน้าเช็กว่า Webhook พร้อมใช้งาน
 */
router.get('/webhook', (req, res) => {
  res.status(200).send('LINE webhook is ready');
});

/**
 * LINE Webhook
 */
router.post('/webhook', async (req, res) => {
  /**
   * เปิดส่วนนี้เมื่อ server.js ใช้:
   *
   * express.json({
   *   verify: verifySignature
   * })
   */
  /*
  if (
    process.env.NODE_ENV === 'production' &&
    !isValidLineSignature(req)
  ) {
    return res.status(401).end();
  }
  */

  // LINE ต้องได้รับ HTTP 200 อย่างรวดเร็ว
  res.status(200).end();

  const events = Array.isArray(req.body?.events)
    ? req.body.events
    : [];

  for (const event of events) {
    if (
      event.type !== 'message' ||
      event.message?.type !== 'text'
    ) {
      continue;
    }

    const text = String(
      event.message.text || ''
    ).trim();

    const lineUserId =
      event.source?.userId || '';

    console.log('LINE EVENT SOURCE:', event.source);
    console.log('CURRENT LINE USER ID:', lineUserId);
    console.log(
      'IS SUMMARY OWNER:',
      canManageSummary(lineUserId)
    );

    try {
      const user = await findUserByLine(lineUserId);

      /**
       * ตรวจ LINE ID
       */
      if (text === 'เช็คไอดี') {
        const {
          destinationId,
          sourceType
        } = getLineDestination(event);

        await replyText(
          event.replyToken,
          'ข้อมูล LINE Webhook\n\n' +
          `User ID:\n${lineUserId || 'ไม่มี userId'}\n\n` +
          `ประเภทแชต: ${sourceType}\n\n` +
          `ปลายทาง:\n${destinationId || 'ไม่มี destinationId'}\n\n` +
          `สิทธิ์เจ้าของระบบ: ${
            canManageSummary(lineUserId)
              ? 'ผ่าน'
              : 'ไม่ผ่าน'
          }`
        );

        continue;
      }

      /**
       * ลงทะเบียนอาจารย์
       */
      if (text.startsWith('ลงทะเบียนอาจารย์')) {
        const teacherId =
          text.match(/รหัสอาจารย์:\s*(.*)/)?.[1]?.trim();

        const fullName =
          text.match(/ชื่อ-สกุล:\s*(.*)/)?.[1]?.trim();

        const phone =
          text.match(/เบอร์โทร:\s*(.*)/)?.[1]?.trim();

        const email =
          text.match(/อีเมล:\s*(.*)/)?.[1]?.trim();

        const department =
          text.match(/สาขา:\s*(.*)/)?.[1]?.trim() || '';

        const instrument =
          text.match(/เครื่องดนตรี:\s*(.*)/)?.[1]?.trim() || '';

        if (
          !teacherId ||
          !fullName ||
          !phone ||
          !email
        ) {
          await replyText(
            event.replyToken,
            'ข้อมูลอาจารย์ไม่ครบ กรุณาส่งแบบนี้:\n\n' +
            'ลงทะเบียนอาจารย์\n' +
            'รหัสอาจารย์: T001\n' +
            'ชื่อ-สกุล: ดร.สมหญิง ใจงาม\n' +
            'เบอร์โทร: 0899999999\n' +
            'อีเมล: teacher@example.com\n' +
            'สาขา: ดนตรีสากล\n' +
            'เครื่องดนตรี: Piano'
          );

          continue;
        }

        const exists = await db
          .collection('users')
          .where('lineUserId', '==', lineUserId)
          .limit(1)
          .get();

        if (!exists.empty) {
          await replyText(
            event.replyToken,
            'คุณลงทะเบียนไว้แล้ว'
          );

          continue;
        }

        const createdAt = new Date().toISOString();

        await db
          .collection('users')
          .doc(teacherId)
          .set(
            {
              userId: teacherId,
              teacherId,
              role: 'teacher',
              name: fullName,
              phone,
              email,
              lineUserId,
              status: 'pending',
              createdAt
            },
            {
              merge: true
            }
          );

        await db
          .collection('teachers')
          .doc(teacherId)
          .set(
            {
              teacherId,
              fullName,
              phone,
              email,
              department,
              instrument,
              lineUserId,
              createdAt
            },
            {
              merge: true
            }
          );

        await replyText(
          event.replyToken,
          'ลงทะเบียนอาจารย์สำเร็จแล้ว\n' +
          'สถานะ: รอ Admin อนุมัติ\n\n' +
          `รหัสอาจารย์: ${teacherId}\n` +
          `ชื่อ: ${fullName}`
        );

        continue;
      }

      /**
       * ลงทะเบียนเจ้าหน้าที่
       */
      if (text.startsWith('ลงทะเบียนเจ้าหน้าที่')) {
        const staffId =
          text.match(/รหัสเจ้าหน้าที่:\s*(.*)/)?.[1]?.trim();

        const fullName =
          text.match(/ชื่อ-สกุล:\s*(.*)/)?.[1]?.trim();

        const phone =
          text.match(/เบอร์โทร:\s*(.*)/)?.[1]?.trim();

        const email =
          text.match(/อีเมล:\s*(.*)/)?.[1]?.trim();

        const position =
          text.match(/ตำแหน่ง:\s*(.*)/)?.[1]?.trim() || '';

        if (
          !staffId ||
          !fullName ||
          !phone ||
          !email
        ) {
          await replyText(
            event.replyToken,
            'ข้อมูลเจ้าหน้าที่ไม่ครบ กรุณาส่งแบบนี้:\n\n' +
            'ลงทะเบียนเจ้าหน้าที่\n' +
            'รหัสเจ้าหน้าที่: S001\n' +
            'ชื่อ-สกุล: นายทดสอบ ระบบ\n' +
            'เบอร์โทร: 0888888888\n' +
            'อีเมล: staff@example.com\n' +
            'ตำแหน่ง: เจ้าหน้าที่ห้องซ้อม'
          );

          continue;
        }

        const exists = await db
          .collection('users')
          .where('lineUserId', '==', lineUserId)
          .limit(1)
          .get();

        if (!exists.empty) {
          await replyText(
            event.replyToken,
            'คุณลงทะเบียนไว้แล้ว'
          );

          continue;
        }

        const createdAt = new Date().toISOString();

        await db
          .collection('users')
          .doc(staffId)
          .set(
            {
              userId: staffId,
              staffId,
              role: 'staff',
              name: fullName,
              phone,
              email,
              lineUserId,
              status: 'pending',
              createdAt
            },
            {
              merge: true
            }
          );

        await db
          .collection('staff')
          .doc(staffId)
          .set(
            {
              staffId,
              fullName,
              phone,
              email,
              position,
              lineUserId,
              createdAt
            },
            {
              merge: true
            }
          );

        await replyText(
          event.replyToken,
          'ลงทะเบียนเจ้าหน้าที่สำเร็จแล้ว\n' +
          'สถานะ: รอ Admin อนุมัติ\n\n' +
          `รหัสเจ้าหน้าที่: ${staffId}\n` +
          `ชื่อ: ${fullName}`
        );

        continue;
      }

      /**
       * ลงทะเบียนนิสิต
       *
       * ต้องอยู่หลังอาจารย์และเจ้าหน้าที่
       * เพราะคำสั่งทั้งสองขึ้นต้นด้วยคำว่า "ลงทะเบียน"
       */
      if (text.startsWith('ลงทะเบียน')) {
        const studentId =
          text.match(/รหัสนิสิต:\s*(.*)/)?.[1]?.trim();

        const fullName =
          text.match(/ชื่อ-สกุล:\s*(.*)/)?.[1]?.trim();

        const phone =
          text.match(/เบอร์โทร:\s*(.*)/)?.[1]?.trim();

        const email =
          text.match(/อีเมล:\s*(.*)/)?.[1]?.trim();

        const major =
          text.match(/วิชาเอก:\s*(.*)/)?.[1]?.trim() || '';

        const year =
          text.match(/ชั้นปี:\s*(.*)/)?.[1]?.trim() || '';

        const mainInstrument =
          text.match(/เครื่องดนตรีหลัก:\s*(.*)/)?.[1]?.trim() || '';

        const workPlace =
          text.match(/สถานที่ทำงาน:\s*(.*)/)?.[1]?.trim() || '';

        const workHoursPerWeek =
          text
            .match(/ชั่วโมงทำงานต่อสัปดาห์:\s*(.*)/)?.[1]
            ?.trim() || '';

        const income =
          text
            .match(/รายได้โดยประมาณ:\s*(.*)/)?.[1]
            ?.trim() || '';

        if (
          !studentId ||
          !fullName ||
          !phone ||
          !email
        ) {
          await replyText(
            event.replyToken,
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

          continue;
        }

        const exists = await db
          .collection('users')
          .where('lineUserId', '==', lineUserId)
          .limit(1)
          .get();

        if (!exists.empty) {
          await replyText(
            event.replyToken,
            'คุณลงทะเบียนไว้แล้ว'
          );

          continue;
        }

        const createdAt = new Date().toISOString();

        await db
          .collection('users')
          .doc(studentId)
          .set(
            {
              userId: studentId,
              role: 'student',
              studentId,
              name: fullName,
              phone,
              email,
              lineUserId,
              status: 'pending',
              createdAt
            },
            {
              merge: true
            }
          );

        await db
          .collection('students')
          .doc(studentId)
          .set(
            {
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
              createdAt
            },
            {
              merge: true
            }
          );

        await replyText(
          event.replyToken,
          'ลงทะเบียนนิสิตสำเร็จแล้ว\n' +
          'สถานะ: รอ Admin อนุมัติ\n\n' +
          `รหัสนิสิต: ${studentId}\n` +
          `ชื่อ: ${fullName}`
        );

        continue;
      }

      /**
       * ตั้งค่ากลุ่มรับสรุป
       */
      if (text.startsWith('ตั้งค่ากลุ่ม')) {
        if (!canManageSummary(lineUserId)) {
          await replyText(
            event.replyToken,
            'ไม่มีสิทธิ์ตั้งค่ากลุ่ม\n\n' +
            `LINE User ID ที่ระบบได้รับ:\n` +
            `${lineUserId || 'ไม่พบ userId'}`
          );

          continue;
        }

        const {
          destinationId,
          sourceType
        } = getLineDestination(event);

        if (!destinationId) {
          await replyText(
            event.replyToken,
            'ไม่พบรหัสปลายทางของ LINE'
          );

          continue;
        }

        if (sourceType === 'user') {
          await replyText(
            event.replyToken,
            'กรุณาพิมพ์คำสั่งนี้ภายในกลุ่ม LINE ที่ต้องการรับสรุป'
          );

          continue;
        }

        const {
          year,
          semester,
          academicYear
        } = parseSummaryGroupSetting(text);

        if (
          !year ||
          !semester ||
          !academicYear
        ) {
          await replyText(
            event.replyToken,
            'รูปแบบไม่ถูกต้อง กรุณาพิมพ์:\n\n' +
            'ตั้งค่ากลุ่ม ชั้นปี: 1 เทอม: 1 ปีการศึกษา: 2569\n\n' +
            'หรือ\n\n' +
            'ตั้งค่ากลุ่ม ปี1 เทอม1 2569'
          );

          continue;
        }

        const config = await saveSummaryGroup({
          destinationId,
          sourceType,
          year,
          semester,
          academicYear,
          configuredBy: lineUserId,
          enabled: true
        });

        await replyText(
          event.replyToken,
          '✅ ตั้งค่ากลุ่มเรียบร้อย\n\n' +
          `ชั้นปี: ${config.studentYear || year}\n` +
          `เทอม: ${config.semester || semester}\n` +
          `ปีการศึกษา: ${
            config.academicYear || academicYear
          }\n` +
          'ส่งอัตโนมัติทุกวันเวลา 20:00 น.'
        );

        continue;
      }

      /**
       * ดูค่ากลุ่ม
       */
      if (
        text === 'ดูค่ากลุ่ม' ||
        text === 'ดูการตั้งค่ากลุ่ม'
      ) {
        const {
          destinationId
        } = getLineDestination(event);

        const config =
          await getSummaryGroupByDestination(
            destinationId
          );

        if (!config) {
          await replyText(
            event.replyToken,
            'กลุ่มนี้ยังไม่ได้ตั้งค่ารับสรุป\n\n' +
            'พิมพ์:\n' +
            'ตั้งค่ากลุ่ม ชั้นปี: 1 เทอม: 1 ปีการศึกษา: 2569'
          );

          continue;
        }

        await replyText(
          event.replyToken,
          '⚙️ การตั้งค่ากลุ่ม\n\n' +
          `ชั้นปี: ${config.studentYear}\n` +
          `เทอม: ${config.semester}\n` +
          `ปีการศึกษา: ${config.academicYear}\n` +
          `เวลาส่ง: ${config.sendTime || '20:00'} น.\n` +
          `สถานะ: ${
            config.enabled
              ? 'เปิดใช้งาน'
              : 'ปิดใช้งาน'
          }`
        );

        continue;
      }

      /**
       * เปิดสรุปอัตโนมัติ
       */
      if (
        text === 'เปิดสรุปกลุ่ม' ||
        text === 'เปิดสรุปอัตโนมัติ'
      ) {
        if (!canManageSummary(lineUserId)) {
          await replyText(
            event.replyToken,
            'ไม่มีสิทธิ์ใช้คำสั่งนี้'
          );

          continue;
        }

        const {
          destinationId
        } = getLineDestination(event);

        const config =
          await setSummaryGroupEnabled(
            destinationId,
            true
          );

        if (!config) {
          await replyText(
            event.replyToken,
            'กลุ่มนี้ยังไม่ได้ตั้งค่า'
          );

          continue;
        }

        await replyText(
          event.replyToken,
          '✅ เปิดสรุปอัตโนมัติแล้ว\n' +
          'ระบบจะส่งทุกวันเวลา 20:00 น.'
        );

        continue;
      }

      /**
       * ปิดสรุปอัตโนมัติ
       */
      if (
        text === 'ปิดสรุปกลุ่ม' ||
        text === 'ปิดสรุปอัตโนมัติ'
      ) {
        if (!canManageSummary(lineUserId)) {
          await replyText(
            event.replyToken,
            'ไม่มีสิทธิ์ใช้คำสั่งนี้'
          );

          continue;
        }

        const {
          destinationId
        } = getLineDestination(event);

        const config =
          await setSummaryGroupEnabled(
            destinationId,
            false
          );

        if (!config) {
          await replyText(
            event.replyToken,
            'กลุ่มนี้ยังไม่ได้ตั้งค่า'
          );

          continue;
        }

        await replyText(
          event.replyToken,
          '⏸ ปิดสรุปอัตโนมัติแล้ว\n' +
          'ยังสามารถพิมพ์ “สรุปเข้าเรียน” เพื่อดูเองได้'
        );

        continue;
      }

      /**
       * ขอสรุปด้วยตนเอง
       */
      if (
        text === 'สรุปเข้าเรียน' ||
        text === 'สรุปการเข้าเรียน' ||
        text === 'สรุปวันนี้'
      ) {
        const {
          destinationId
        } = getLineDestination(event);

        const config =
          await getSummaryGroupByDestination(
            destinationId
          );

        if (!config) {
          await replyText(
            event.replyToken,
            'กลุ่มนี้ยังไม่ได้ตั้งค่า\n\n' +
            'พิมพ์:\n' +
            'ตั้งค่ากลุ่ม ชั้นปี: 1 เทอม: 1 ปีการศึกษา: 2569'
          );

          continue;
        }

        const summary =
          await buildAttendanceSummary(
            config,
            getCurrentThaiDate()
          );

        await replyText(
          event.replyToken,
          summary
        );

        continue;
      }

      /**
       * ขอ QR เช็กชื่อ
       */
      if (text.startsWith('ขอลิงค์')) {
        if (
          !user ||
          !['teacher', 'admin'].includes(user.role)
        ) {
          await replyText(
            event.replyToken,
            'คำสั่งนี้ใช้ได้เฉพาะอาจารย์/Admin'
          );

          continue;
        }

        const parts = text.split(/\s+/);
        const courseCode = parts[1];

        if (!courseCode) {
          await replyText(
            event.replyToken,
            'กรุณาพิมพ์: ขอลิงค์ [รหัสวิชา]'
          );

          continue;
        }

        const {
          url
        } = await createQr(courseCode, user);

        await replyText(
          event.replyToken,
          `ลิงก์เช็กชื่อ ${courseCode}\n` +
          'หมดอายุใน 30 นาที\n' +
          url
        );

        continue;
      }

      /**
       * ส่งงาน
       */
      if (text.startsWith('ส่งงาน')) {
        if (!user) {
          await replyText(
            event.replyToken,
            'กรุณาลงทะเบียนก่อน'
          );

          continue;
        }

        const parts = text.split(/\s+/);
        const courseCode = parts[1];

        const youtubeUrl = parts.find(
          (part) =>
            part.startsWith('http://') ||
            part.startsWith('https://')
        );

        if (
          !courseCode ||
          !youtubeUrl
        ) {
          await replyText(
            event.replyToken,
            'กรุณาพิมพ์:\n' +
            'ส่งงาน [รหัสวิชา] [ลิงก์ YouTube]'
          );

          continue;
        }

        const courseSnapshot = await db
          .collection('courses')
          .where('courseCode', '==', courseCode)
          .limit(1)
          .get();

        const now = new Date();
        const dateString = getCurrentThaiDate();

        await db.collection('submissions').add({
          studentId: user.id,
          courseId: courseSnapshot.empty
            ? ''
            : courseSnapshot.docs[0].id,
          courseCode,
          youtubeUrl,
          status: 'ยังไม่ตรวจ',
          submitDate: dateString,
          submitTime: now.toISOString(),
          createdAt: now.toISOString()
        });

        await replyText(
          event.replyToken,
          'บันทึกการส่งงานแล้ว'
        );

        continue;
      }

      /**
       * บันทึกการลา
       */
      if (text.startsWith('ลา')) {
        if (!user) {
          await replyText(
            event.replyToken,
            'กรุณาลงทะเบียนก่อน'
          );

          continue;
        }

        const parts = text.split(/\s+/);
        const courseCode = parts[1];
        const leaveType = parts[2];
        const reason = parts.slice(3).join(' ');

        if (
          !courseCode ||
          !leaveType
        ) {
          await replyText(
            event.replyToken,
            'กรุณาพิมพ์:\n' +
            'ลา [รหัสวิชา] [ประเภทการลา] [เหตุผล]\n\n' +
            'ตัวอย่าง:\n' +
            'ลา MUS101 ลาป่วย มีไข้'
          );

          continue;
        }

        const now = new Date();

        await db
          .collection('leave_requests')
          .add({
            studentId: user.id,
            courseCode,
            leaveType,
            reason,
            leaveDate: getCurrentThaiDate(),
            createdAt: now.toISOString()
          });

        await replyText(
          event.replyToken,
          'บันทึกการลาแล้ว'
        );

        continue;
      }

      /**
       * ข้อมูลผู้ใช้
       */
      if (text === 'ข้อมูลของฉัน') {
        const message = user
          ? (
              `ชื่อ: ${user.name || '-'}\n` +
              `สถานะ: ${user.status || '-'}\n` +
              `สิทธิ์: ${user.role || '-'}`
            )
          : 'ยังไม่พบข้อมูล กรุณาลงทะเบียน';

        await replyText(
          event.replyToken,
          message
        );

        continue;
      }

      /**
       * ลิงก์ Dashboard
       */
      if (text === 'สรุประบบวันนี้') {
        await replyText(
          event.replyToken,
          `ดูสรุประบบบนเว็บ: ${
            process.env.WEB_BASE_URL ||
            'http://localhost:3000'
          }/dashboard`
        );

        continue;
      }

      /**
       * ไม่มีคำสั่งตรงกัน
       * ไม่ตอบกลับเพื่อลดจำนวนข้อความ LINE OA
       */
    } catch (error) {
      console.error(
        'LINE WEBHOOK EVENT ERROR:',
        error
      );

      try {
        await replyText(
          event.replyToken,
          `เกิดข้อผิดพลาด: ${
            error.message ||
            'ไม่ทราบสาเหตุ'
          }`
        );
      } catch (replyError) {
        console.error(
          'LINE ERROR REPLY FAILED:',
          replyError
        );
      }
    }
  }
});

module.exports = router;