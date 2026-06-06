# ⌚ App Watch

แอปเว็บสำหรับเชื่อมต่อและอ่านข้อมูลจาก **Smart Watch** แบบเรียลไทม์ ผ่าน
[Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
โดยตรง — ไม่ต้องลงแอปหรือ build อะไรเลย เปิดในเบราว์เซอร์ได้ทันที

## ทำอะไรได้บ้าง

- 🔗 เชื่อมต่อนาฬิกาผ่าน Bluetooth โดยตรงจากหน้าเว็บ
- ❤️ แสดง **อัตราการเต้นหัวใจ** แบบเรียลไทม์ พร้อมกราฟ
- 🔋 อ่านระดับ **แบตเตอรี่**
- ℹ️ ดูข้อมูลอุปกรณ์ (ผู้ผลิต / รุ่น / เฟิร์มแวร์)
- 📁 บันทึกและ **ส่งออกข้อมูลเป็น CSV**

ใช้มาตรฐาน Bluetooth GATT services:

| Service | UUID | ข้อมูล |
|---|---|---|
| Heart Rate | `0x180D` | อัตราการเต้นหัวใจ (notify) |
| Battery | `0x180F` | ระดับแบตเตอรี่ |
| Device Information | `0x180A` | ผู้ผลิต / รุ่น / เฟิร์มแวร์ |

## ความต้องการ

- **เบราว์เซอร์**: Chrome หรือ Edge (เดสก์ท็อป หรือ Android)
  > ⚠️ Safari และ Firefox **ยังไม่รองรับ** Web Bluetooth
- ต้องเปิดผ่าน `https://` หรือ `localhost` (ข้อกำหนดด้านความปลอดภัย)
- นาฬิกาที่เปิด standard GATT profile (เช่น สายรัดข้อมือวัดหัวใจทั่วไป,
  นาฬิกาที่รองรับ Heart Rate Service)

## วิธีรัน

เนื่องจากเป็นไฟล์ static ล้วน รันได้ด้วยเว็บเซิร์ฟเวอร์ใดก็ได้:

```bash
# วิธีที่ 1: Python (มีติดมากับเครื่องส่วนใหญ่)
python3 -m http.server 8000

# วิธีที่ 2: Node.js
npx serve .
```

จากนั้นเปิด <http://localhost:8000> ใน Chrome แล้วกด **"เชื่อมต่อนาฬิกา"**

## โครงสร้างไฟล์

```
app-watch/
├── index.html   # โครงหน้า + UI
├── styles.css   # ดีไซน์ (ธีมมืด)
├── app.js       # ตรรกะ Web Bluetooth ทั้งหมด
└── README.md
```

## หมายเหตุเรื่องการเชื่อมต่อแบรนด์ใหญ่

นาฬิกาบางยี่ห้อ (Apple Watch, Garmin, Fitbit, Samsung) **ไม่เปิด** standard GATT
ให้เชื่อมต่อตรง แต่ sync ข้อมูลขึ้น cloud แทน หากต้องการข้อมูลจากแบรนด์เหล่านี้
ต้องเชื่อมผ่าน Cloud API ของผู้ผลิต (OAuth2) เช่น:

- **Apple Watch** → Apple HealthKit (ผ่าน iOS app)
- **Fitbit** → [Fitbit Web API](https://dev.fitbit.com/build/reference/web-api/)
- **Garmin** → Garmin Health API
- **Samsung / Wear OS** → [Health Connect](https://developer.android.com/health-and-fitness/guides/health-connect)

แอปนี้เน้นกรณี **เชื่อมต่อตรงผ่าน Bluetooth** ซึ่งใช้ได้กับอุปกรณ์ที่เปิด
standard heart-rate / battery profile
