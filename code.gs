// =========================================================================
// SUPREME GAS ARCHITECT V2.24 - BACKEND LOGIC (PPT INTEGRATION)
// =========================================================================

const SPREADSHEET_ID = "1URxGBxkD72XrrTG1JddwhCE7O4xK8lyqAiBX0-uLO4E";
const TARGET_GID = 337924468;
const POKOK_DOA_GID = 188690064;

// DATA SUMBER ULANG TAHUN BARU
const BIRTHDAY_SPREADSHEET_ID = "1JIr0fEy7Rru7NEHwvEKSCScUztuHiYv_OGQfZs_xOzw";
const BIRTHDAY_TARGET_GID = 2083740695;

// MODUL PPT
const PPT_TARGET_GID = 1023217467;
const DRIVE_FOLDER_ID = "1FJNkSs2kpg0g4_e-c-uRtPuPA0s6tb9P";
const ALLOWED_DOMAIN = "skl.sch.id";

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('DASHBOARD JADWAL TBI 2026/2027')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getDashboardData() {
  try {
    return { 
      status: "success", 
      data: {
        sysStatus: "Sistem Terhubung",
        sysTahun: "TA 2026/2027",
        userEmail: Session.getActiveUser().getEmail()
      } 
    };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}

function getJadwalData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets();
    let targetSheet = null;
    
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === TARGET_GID) {
        targetSheet = sheets[i];
        break;
      }
    }
    
    if (!targetSheet) return { status: "error", message: "Sheet Jadwal tidak ditemukan." };
    
    const data = targetSheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return { status: "success", data: [] };
    
    const result = [];
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      if (!row[0] || row[0].toString().trim() === "") continue; 
      result.push({
        id: generateUUID(),
        tanggal: row[0] ? row[0].toString().trim() : "-",
        worldview: row[1] ? row[1].toString().trim() : "-",
        profil: row[2] ? row[2].toString().trim() : "-",
        bestra: row[3] ? row[3].toString().trim() : "-",
        karakter: row[4] ? row[4].toString().trim() : "-",
        temaBulanan: row[5] ? row[5].toString().trim() : "-",
        temaMingguan: row[6] ? row[6].toString().trim() : "-",
        nasAlkitab: row[7] ? row[7].toString().trim() : "-",
        tujuan: row[8] ? row[8].toString().trim() : "-",
        pertanyaan: row[9] ? row[9].toString().trim() : "-",
        pelayan: row[10] ? row[10].toString().trim() : "-"
      });
    }
    return { status: "success", data: result };
  } catch (error) {
    return { status: "error", message: "Gagal memuat jadwal: " + error.toString() };
  }
}

function getPokokDoaData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets();
    let targetSheet = null;
    
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === POKOK_DOA_GID) {
        targetSheet = sheets[i];
        break;
      }
    }
    
    if (!targetSheet) return { status: "error", message: "Sheet Pokok Doa tidak ditemukan." };
    
    const data = targetSheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return { status: "success", data: [] };
    
    const result = [];
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      if (!row[0] || row[0].toString().trim() === "") continue; 
      result.push({
        id: generateUUID(),
        bulan: row[0] ? row[0].toString().trim() : "-",
        hari: row[1] ? row[1].toString().trim() : "-",
        tanggal: row[2] ? row[2].toString().trim() : "-",
        doa: row[3] ? row[3].toString().trim() : "-"
      });
    }
    return { status: "success", data: result };
  } catch (error) {
    return { status: "error", message: "Gagal memuat Pokok Doa: " + error.toString() };
  }
}

function getBirthdayData() {
  try {
    const ss = SpreadsheetApp.openById(BIRTHDAY_SPREADSHEET_ID);
    const sheets = ss.getSheets();
    let targetSheet = null;
    
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === BIRTHDAY_TARGET_GID) {
        targetSheet = sheets[i];
        break;
      }
    }
    
    if (!targetSheet) return { status: "error", message: "Sheet Ulang Tahun tidak ditemukan." };
    
    const data = targetSheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return { status: "success", data: [] };
    
    const result = [];
    for (let i = 1; i < data.length; i++) {
      let name = data[i][1] ? data[i][1].toString().trim() : "";
      let ttl = data[i][3] ? data[i][3].toString().trim() : "";
      
      if (name !== "" && ttl !== "") {
        result.push({ name: name, ttl: ttl });
      }
    }
    return { status: "success", data: result };
  } catch (error) {
    return { status: "error", message: "Gagal memuat data Ulang Tahun: " + error.toString() };
  }
}

// MODUL PPT LOGIC
function getPPTData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets();
    let targetSheet = null;
    
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === PPT_TARGET_GID) {
        targetSheet = sheets[i];
        break;
      }
    }
    
    if (!targetSheet) return { status: "error", message: "Sheet PPT tidak ditemukan." };
    
    const data = targetSheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return { status: "success", data: [] };
    
    const result = [];
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      if (!row[0] || row[0].toString().trim() === "") continue; 
      result.push({
        id: row[0].toString().trim(),
        tanggal: row[1] ? row[1].toString().trim() : "-",
        judul: row[2] ? row[2].toString().trim() : "-",
        link: row[3] ? row[3].toString().trim() : "-",
        uploader: row[4] ? row[4].toString().trim() : "-"
      });
    }
    return { status: "success", data: result.reverse() };
  } catch (error) {
    return { status: "error", message: "Gagal memuat data PPT: " + error.toString() };
  }
}

function uploadPPTFile(obj) {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail.endsWith(ALLOWED_DOMAIN)) {
      throw new Error("Akses ditolak. Gunakan email sekolah yang sah (@skl.sch.id).");
    }

    let fileUrl = obj.url;

    if (obj.fileData) {
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const decodedFile = Utilities.base64Decode(obj.fileData.split(",")[1]);
      const blob = Utilities.newBlob(decodedFile, obj.mimeType, obj.fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrl = file.getUrl();
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets();
    let targetSheet = null;
    
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === PPT_TARGET_GID) {
        targetSheet = sheets[i];
        break;
      }
    }
    
    if (!targetSheet) throw new Error("Sheet PPT tidak ditemukan.");
    
    targetSheet.appendRow([
      generateUUID(),
      new Date().toLocaleDateString('id-ID'),
      obj.judul,
      fileUrl,
      userEmail
    ]);

    return { status: "success" };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}