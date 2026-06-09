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
app.post("/webhook", async (req, res) => {
  try {
    console.log("LINE webhook body:", JSON.stringify(req.body, null, 2));
    const events = req.body.events || [];

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const text = event.message.text.trim();
        const lineUserId = event.source.userId;

        let replyText = "";

        if (text === "ลงทะเบียน") {
          replyText =
            "กรุณาส่งข้อมูลตามรูปแบบนี้:\n\n" +
            "ลงทะเบียน\n" +
            "รหัสนิสิต: 66000001\n" +
            "ชื่อ-สกุล: สมชาย ใจดี\n" +
            "เบอร์โทร: 0812345678\n" +
            "อีเมล: somchai@example.com\n" +
            "วิชาเอก: ดนตรีสากล\n" +
            "ชั้นปี: 1\n" +
            "เครื่องดนตรีหลัก: Guitar\n" +
            "สถานที่ทำงาน: ร้าน ABC\n" +
            "ชั่วโมงทำงานต่อสัปดาห์: 20\n" +
            "รายได้โดยประมาณ: 5000";

        } else if (text.startsWith("ลงทะเบียน")) {
          const studentId = text.match(/รหัสนิสิต:\s*(.*)/)?.[1]?.trim();
          const fullName = text.match(/ชื่อ-สกุล:\s*(.*)/)?.[1]?.trim();
          const phone = text.match(/เบอร์โทร:\s*(.*)/)?.[1]?.trim();
          const email = text.match(/อีเมล:\s*(.*)/)?.[1]?.trim();
          const major = text.match(/วิชาเอก:\s*(.*)/)?.[1]?.trim();
          const year = text.match(/ชั้นปี:\s*(.*)/)?.[1]?.trim();
          const mainInstrument = text.match(/เครื่องดนตรีหลัก:\s*(.*)/)?.[1]?.trim();
          const workPlace = text.match(/สถานที่ทำงาน:\s*(.*)/)?.[1]?.trim() || "";
          const workHoursPerWeek = text.match(/ชั่วโมงทำงานต่อสัปดาห์:\s*(.*)/)?.[1]?.trim() || "";
          const income = text.match(/รายได้โดยประมาณ:\s*(.*)/)?.[1]?.trim() || "";

          if (!studentId || !fullName || !phone || !email) {
            replyText =
              "ข้อมูลไม่ครบ กรุณาส่งแบบนี้:\n\n" +
              "ลงทะเบียน\n" +
              "รหัสนิสิต: 66000001\n" +
              "ชื่อ-สกุล: สมชาย ใจดี\n" +
              "เบอร์โทร: 0812345678\n" +
              "อีเมล: somchai@example.com\n" +
              "วิชาเอก: ดนตรีสากล\n" +
              "ชั้นปี: 1\n" +
              "เครื่องดนตรีหลัก: Guitar";
          } else {
            await db.collection("users").doc(studentId).set({
              userId: studentId,
              role: "student",
              studentId,
              name: fullName,
              phone,
              email,
              lineUserId,
              status: "pending",
              createdAt: new Date().toISOString()
            }, { merge: true });

            await db.collection("students").doc(studentId).set({
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

            replyText =
              "ลงทะเบียนสำเร็จแล้ว\n" +
              "สถานะ: รอ Admin อนุมัติ\n\n" +
              `รหัสนิสิต: ${studentId}\n` +
              `ชื่อ: ${fullName}`;
          }

        } else if (text.startsWith("ขอลิงค์")) {
          replyText = "รับคำขอสร้าง QR Code แล้ว กรุณาระบุรหัสวิชา เช่น ขอลิงค์ MUS101";

        } else if (text.startsWith("ส่งงาน")) {
          replyText = "รับข้อมูลการส่งงานแล้ว";

        } else if (text.startsWith("ลา")) {
          replyText = "รับข้อมูลการลาแล้ว";

        } else {
          replyText =
            "ระบบ LINE Music Class Manager\n\n" +
            "คำสั่งที่ใช้ได้:\n" +
            "ลงทะเบียน\n" +
            "ขอลิงค์ MUS101\n" +
            "ส่งงาน MUS101 ลิงก์ YouTube\n" +
            "ลา MUS101 ลาป่วย เหตุผล";
        }

        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken: event.replyToken,
            messages: [
              {
                type: "text",
                text: replyText
              }
            ]
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error.response?.data || error.message);
    res.status(200).json({ ok: false });
  }
});
module.exports=router;
