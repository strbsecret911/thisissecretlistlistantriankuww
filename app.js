import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy,
  doc, updateDoc, serverTimestamp,
  getDocs, where, Timestamp, writeBatch, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ✅ Firebase project: listorderrr (CDN)
const firebaseConfig = {
  apiKey: "AIzaSyDprHL_l6VoXJbNgUYjYfo7iwgg06NuqMQ",
  authDomain: "listorderrr.firebaseapp.com",
  projectId: "listorderrr",
  storageBucket: "listorderrr.firebasestorage.app",
  messagingSenderId: "974810449740",
  appId: "1:974810449740:web:4263ca79de2e7ec8efb1e9"
};

const ADMIN_EMAIL = "dinijanuari23@gmail.com";

// pagination
const PAGE_SIZE = 10;
let publicPage = 0;
let adminPage = 0;

const ROBUX_OPTIONS = {
  REGULER: ["80 Robux","160 Robux","240 Robux","320 Robux","400 Robux","480 Robux","560 Robux","640 Robux","720 Robux","800 Robux","1.700 Robux","2.100 Robux","3.400 Robux","4.500 Robux","10.000 Robux","22.500 Robux"],
  BASIC: ["500 Robux","580 Robux","660 Robux","740 Robux","820 Robux","1.000 Robux","1.500 Robux","2.000 Robux","2.500 Robux","3.000 Robux","3.500 Robux","4.000 Robux","5.000 Robux","6.000 Robux","15.000 Robux"],
  PREMIUM: ["450 Robux + Premium","1.000 Robux + Premium","1.550 Robux + Premium","2.200 Robux + Premium","2.750 Robux + Premium","3.300 Robux + Premium","4.400 Robux + Premium","5.500 Robux + Premium","11.000 Robux + Premium"],

  Heartopia: [
    "20 hearts diamond",
    "60 hearts diamond",
    "80 hearts diamond",
    "300 + 20 hearts diamond",
    "320 + 20 hearts diamond",
    "360 + 20 hearts diamond",
    "380 + 20 hearts diamond",
    "680 + 50 hearts diamond",
    "700 + 50 hearts diamond",
    "740 + 50 hearts diamond",
    "980 + 70 hearts diamond",
    "1280 + 90 hearts diamond",
    "1340 + 90 hearts diamond",
    "1580 + 110 hearts diamond",
    "1980 + 150 hearts diamond",
    "2280 + 170 hearts diamond",
    "3280 + 270 hearts diamond",
    "6480 + 570 hearts diamond",
    "GAMG Junior Membership (7D)",
    "GAMG Full Membership (30)"
  ],
};

const STATUS = [
  { v: "PENDING", label: "Pending", cls: "pending" },
  { v: "PROSES", label: "Proses", cls: "proses" },
  { v: "DONE", label: "Done", cls: "done" },
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const view = document.getElementById("view");
const navPublic = document.getElementById("navPublic");

let currentUser = null;
let unsubscribeOrders = null;

function fmtTime(ts){
  if(!ts) return "-";
  const d = ts.toDate?.() ? ts.toDate() : new Date(ts);
  return d.toLocaleString("id-ID");
}

function setActiveNav(){
  const hash = location.hash || "#/";
  if (navPublic) navPublic.classList.toggle("active", !hash.startsWith("#/admin"));
}

function stopOrdersListener(){
  if (unsubscribeOrders) { unsubscribeOrders(); unsubscribeOrders = null; }
}

function makePager(total, page, pageSize){
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const safePage = Math.min(Math.max(page, 0), maxPage);
  const start = safePage * pageSize;
  const end = start + pageSize;
  return { maxPage, page: safePage, start, end };
}

/* =========================
   SUMMARY HELPERS
========================= */
function parseRobux(amountLabel){
  const s = String(amountLabel || "");
  const m = s.match(/[\d.]+/);
  if(!m) return 0;
  const num = m[0].replaceAll(".", "");
  const n = parseInt(num, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseHeartDiamond(amountLabel){
  const s = String(amountLabel || "").toLowerCase();
  if (!s.includes("hearts")) return 0;

  const m = s.match(/[\d.]+/g);
  if(!m) return 0;

  const first = m[0].replaceAll(".", "");
  const n = parseInt(first, 10);
  return Number.isFinite(n) ? n : 0;
}

function formatID(n){
  return (n || 0).toLocaleString("id-ID");
}

function calcSummaryFromData(list){
  let pending = 0, proses = 0, done = 0;
  let robuxDone = 0;
  let heartDiamondDone = 0;

  for (const o of list){
    if (o.status === "PENDING") pending++;
    else if (o.status === "PROSES") proses++;
    else if (o.status === "DONE") {
      done++;
      robuxDone += parseRobux(o.amountLabel);
      heartDiamondDone += parseHeartDiamond(o.amountLabel);
    }
  }

  return {
    total: list.length,
    pending,
    proses,
    done,
    robuxDone,
    heartDiamondDone
  };
}

/* =========================
   BACKUP HELPERS (CSV)
========================= */
function monthToRange(monthStr){ // "2025-12"
  const [y, m] = monthStr.split("-").map(x=>parseInt(x,10));
  const start = new Date(y, m-1, 1, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0);
  return {
    startTS: Timestamp.fromDate(start),
    endTS: Timestamp.fromDate(end),
    label: `${String(m).padStart(2,"0")}-${y}`
  };
}

function escapeCSV(v){
  const s = String(v ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

function downloadTextFile(filename, text){
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadMonthlyCSV(monthStr){
  const { startTS, endTS, label } = monthToRange(monthStr);

  const q = query(
    collection(db,"orders"),
    where("createdAt", ">=", startTS),
    where("createdAt", "<", endTS),
    orderBy("createdAt","desc")
  );

  const snap = await getDocs(q);
  const rows = [];
  rows.push(["No","Nominal","Kategori","Status","Waktu Input","Waktu Selesai"].map(escapeCSV).join(","));

  let no = snap.size; // biar nomor terbalik juga
  snap.forEach(docSnap=>{
    const o = docSnap.data();
    const s = STATUS.find(x=>x.v===o.status) || {label:(o.status||"-")};

    rows.push([
      no,
      o.amountLabel || "-",
      o.robuxType || "-",
      s.label,
      fmtTime(o.createdAt),
      fmtTime(o.completedAt)
    ].map(escapeCSV).join(","));

    no--;
  });

  const csv = rows.join("\n");
  downloadTextFile(`backup-orders-${label}.csv`, csv);
}

/* =========================
   RESET HELPERS
   - hapus semua doc di orders (batch 500)
========================= */
async function resetAllOrders(){
  const ok = confirm("Yakin mau RESET antrian?\n\nIni akan menghapus SEMUA data di collection 'orders' dan tidak bisa dibatalkan.");
  if(!ok) return;

  // safety confirm kedua
  const ok2 = confirm("Konfirmasi lagi: Hapus SEMUA order? Klik OK untuk lanjut.");
  if(!ok2) return;

  let deleted = 0;

  while(true){
    const q = query(collection(db,"orders"), orderBy("createdAt","desc"), limit(500));
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();

    deleted += snap.size;
  }

  alert(`Selesai reset. Total terhapus: ${deleted}`);
}

/* =========================
   PUBLIC
========================= */
function renderPublic(){
  stopOrdersListener();

  view.innerHTML = `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Nominal</th>
            <th>Kategori</th>
            <th>Status</th>
            <th>Waktu Input</th>
            <th>Waktu Selesai</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>

    <div class="row" style="justify-content:center; margin-top:12px;">
      <button class="secondary" id="prevBtn">Prev</button>
      <div class="small" id="pageInfo" style="padding:0 6px;"></div>
      <button class="secondary" id="nextBtn">Next</button>
    </div>

    <div class="summaryBox">
      <div class="summaryGrid">
        <div class="summaryItem">
          <div class="summaryLabel">Total Order</div>
          <div class="summaryValue" id="sumTotal">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Robux Terjual (Done)</div>
          <div class="summaryValue" id="sumRobuxDone">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Heart Diamond Terjual (Done)</div>
          <div class="summaryValue" id="sumHeartDiamondDone">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Pending</div>
          <div class="summaryValue" id="sumPending">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Proses</div>
          <div class="summaryValue" id="sumProses">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Done</div>
          <div class="summaryValue" id="sumDone">0</div>
        </div>
      </div>
    </div>
  `;

  const tbody = document.getElementById("tbody");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInfo = document.getElementById("pageInfo");

  const sumTotal = document.getElementById("sumTotal");
  const sumPending = document.getElementById("sumPending");
  const sumProses = document.getElementById("sumProses");
  const sumDone = document.getElementById("sumDone");
  const sumRobuxDone = document.getElementById("sumRobuxDone");
  const sumHeartDiamondDone = document.getElementById("sumHeartDiamondDone");

  const q = query(collection(db,"orders"), orderBy("createdAt","desc"));

  unsubscribeOrders = onSnapshot(q, (snap)=>{
    const allDocs = [];
    snap.forEach(d => allDocs.push(d));

    // SUMMARY global
    const allData = allDocs.map(d => d.data());
    const summary = calcSummaryFromData(allData);
    sumTotal.textContent = formatID(summary.total);
    sumPending.textContent = formatID(summary.pending);
    sumProses.textContent = formatID(summary.proses);
    sumDone.textContent = formatID(summary.done);
    sumRobuxDone.textContent = formatID(summary.robuxDone);
    sumHeartDiamondDone.textContent = formatID(summary.heartDiamondDone);

    // PAGING
    const total = allDocs.length;
    const pager = makePager(total, publicPage, PAGE_SIZE);
    publicPage = pager.page;

    const pageDocs = allDocs.slice(pager.start, pager.end);

    const rows = [];
    pageDocs.forEach((d, idx)=>{
      const o = d.data();
      const s = STATUS.find(x=>x.v===o.status) || {label:(o.status||"-"), cls:""};
      const nomor = total - pager.start - idx;

      rows.push(`
        <tr>
          <td>${nomor}</td>
          <td>${o.amountLabel || "-"}</td>
          <td>${o.robuxType || "-"}</td>
          <td><span class="badge ${s.cls}">${s.label}</span></td>
          <td>${fmtTime(o.createdAt)}</td>
          <td>${fmtTime(o.completedAt)}</td>
        </tr>
      `);
    });

    tbody.innerHTML = rows.length
      ? rows.join("")
      : `<tr><td colspan="6" class="small">Belum ada order.</td></tr>`;

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    pageInfo.textContent = `Page ${publicPage + 1} / ${totalPages}`;

    prevBtn.disabled = publicPage === 0;
    nextBtn.disabled = publicPage >= (totalPages - 1);

    prevBtn.onclick = () => {
      if (publicPage > 0) {
        publicPage--;
        renderPublic();
        window.scrollTo(0, 0);
      }
    };

    nextBtn.onclick = () => {
      if (publicPage < totalPages - 1) {
        publicPage++;
        renderPublic();
        window.scrollTo(0, 0);
      }
    };
  }, (err)=>alert("Gagal load orders: " + (err?.message || err)));
}

/* =========================
   AUTH
========================= */
async function adminLogin(){
  try {
    const res = await signInWithPopup(auth, provider);
    if (res.user?.email !== ADMIN_EMAIL) {
      await signOut(auth);
      alert("Akun ini bukan admin.");
      location.hash = "#/";
    }
  } catch (e) {
    alert("Login gagal: " + (e?.message || e));
  }
}

async function adminLogout(){
  try {
    await signOut(auth);
    location.hash = "#/";
  } catch (e) {
    alert("Logout gagal: " + (e?.message || e));
  }
}

/* =========================
   ADMIN
========================= */
function renderAdmin(){
  const isAdmin = currentUser?.email === ADMIN_EMAIL;
  if (!isAdmin) { location.hash = "#/"; return; }

  stopOrdersListener();

  // default month = bulan sekarang
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  view.innerHTML = `
    <div class="row" style="justify-content:flex-end; margin: 6px 0 12px;">
      <button class="secondary" id="btnLogout">Logout</button>
    </div>

    <div class="card" style="margin: 10px 0 14px;">
      <div class="brand" style="margin-bottom:10px;">Tambah Order Manual</div>

      <div class="row" style="align-items:center; gap:10px; margin-bottom:8px;">
        <label class="small" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="chkCustom" />
          Custom (ketik sendiri)
        </label>
      </div>

      <div class="row" id="rowPreset">
        <select id="selType">
          ${Object.keys(ROBUX_OPTIONS).map(k=>`<option value="${k}">${k}</option>`).join("")}
        </select>

        <select id="selAmount"></select>
      </div>

      <div class="row" id="rowCustom" style="display:none;">
        <input id="inpCustomCategory" placeholder="Kategori (contoh: Mobile Legends / DLL)" />
        <input id="inpCustomNominal" placeholder="Nominal (contoh: 123 Diamonds / Rp 50.000 / dll)" />
      </div>

      <div class="row" style="margin-top:10px;">
        <select id="selStatus">
          ${STATUS.map(s=>`<option value="${s.v}">${s.label}</option>`).join("")}
        </select>

        <button id="btnAdd">Add</button>
      </div>

      <div class="small" style="margin-top:8px;">
        * createdAt auto. completedAt auto update tiap status di-set/diubah.
      </div>
    </div>

    <div class="card" style="margin: 10px 0 14px;">
      <div class="brand" style="margin-bottom:10px;">Backup & Reset</div>
      <div class="row">
        <input id="monthPick" type="month" value="${defaultMonth}" />
        <button class="secondary" id="btnDownload">Download Backup (CSV)</button>
        <button id="btnReset" style="background:#b91c1c;">Reset Antrian</button>
      </div>
      <div class="small" style="margin-top:8px;">
        * Backup akan mengambil data dari bulan yang dipilih berdasarkan <b>createdAt</b>.
      </div>
    </div>

    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Nominal</th>
            <th>Kategori</th>
            <th>Status</th>
            <th>Waktu Input</th>
            <th>Waktu Selesai</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>

    <div class="row" style="justify-content:center; margin-top:12px;">
      <button class="secondary" id="prevBtnA">Prev</button>
      <div class="small" id="pageInfoA" style="padding:0 6px;"></div>
      <button class="secondary" id="nextBtnA">Next</button>
    </div>

    <div class="summaryBox">
      <div class="summaryGrid">
        <div class="summaryItem">
          <div class="summaryLabel">Total Order</div>
          <div class="summaryValue" id="sumTotalA">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Robux Terjual (Done)</div>
          <div class="summaryValue" id="sumRobuxDoneA">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Heart Diamond Terjual (Done)</div>
          <div class="summaryValue" id="sumHeartDiamondDoneA">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Pending</div>
          <div class="summaryValue" id="sumPendingA">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Proses</div>
          <div class="summaryValue" id="sumProsesA">0</div>
        </div>
        <div class="summaryItem">
          <div class="summaryLabel">Done</div>
          <div class="summaryValue" id="sumDoneA">0</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btnLogout").onclick = adminLogout;

  // Backup + Reset handlers
  const monthPick = document.getElementById("monthPick");
  const btnDownload = document.getElementById("btnDownload");
  const btnReset = document.getElementById("btnReset");

  btnDownload.onclick = async ()=>{
    try{
      btnDownload.disabled = true;
      btnDownload.textContent = "Downloading...";
      await downloadMonthlyCSV(monthPick.value);
    } catch(e){
      alert("Gagal download backup: " + (e?.message || e));
    } finally {
      btnDownload.disabled = false;
      btnDownload.textContent = "Download Backup (CSV)";
    }
  };

  btnReset.onclick = async ()=>{
    try{
      btnReset.disabled = true;
      btnReset.textContent = "Resetting...";
      await resetAllOrders();
    } catch(e){
      alert("Gagal reset: " + (e?.message || e));
    } finally {
      btnReset.disabled = false;
      btnReset.textContent = "Reset Antrian";
    }
  };

  // Add order controls
  const chkCustom = document.getElementById("chkCustom");
  const rowPreset = document.getElementById("rowPreset");
  const rowCustom = document.getElementById("rowCustom");

  const selType = document.getElementById("selType");
  const selAmount = document.getElementById("selAmount");

  const inpCustomCategory = document.getElementById("inpCustomCategory");
  const inpCustomNominal = document.getElementById("inpCustomNominal");

  const selStatus = document.getElementById("selStatus");
  const btnAdd = document.getElementById("btnAdd");

  function toggleCustomUI(){
    const isCustom = !!chkCustom.checked;
    rowPreset.style.display = isCustom ? "none" : "";
    rowCustom.style.display = isCustom ? "" : "none";
  }
  chkCustom.onchange = toggleCustomUI;
  toggleCustomUI();

  function fillAmount(){
    const arr = ROBUX_OPTIONS[selType.value] || [];
    selAmount.innerHTML = arr.map(x=>`<option value="${x}">${x}</option>`).join("");
  }
  fillAmount();
  selType.onchange = fillAmount;

  btnAdd.onclick = async ()=>{
    try {
      btnAdd.disabled = true;
      btnAdd.textContent = "Adding...";

      const isCustom = !!chkCustom.checked;

      const robuxType = isCustom
        ? (inpCustomCategory.value || "").trim()
        : selType.value;

      const amountLabel = isCustom
        ? (inpCustomNominal.value || "").trim()
        : selAmount.value;

      if (!robuxType || !amountLabel){
        alert("Kategori & Nominal wajib diisi.");
        return;
      }

      await addDoc(collection(db,"orders"), {
        createdAt: serverTimestamp(),
        robuxType,
        amountLabel,
        status: selStatus.value,
        completedAt: serverTimestamp()
      });

      if (isCustom){
        inpCustomCategory.value = "";
        inpCustomNominal.value = "";
      }
    } catch (e) {
      alert("Gagal add: " + (e?.message || e));
    } finally {
      btnAdd.textContent = "Add";
      btnAdd.disabled = false;
    }
  };

  const tbody = document.getElementById("tbody");
  const prevBtnA = document.getElementById("prevBtnA");
  const nextBtnA = document.getElementById("nextBtnA");
  const pageInfoA = document.getElementById("pageInfoA");

  const sumTotalA = document.getElementById("sumTotalA");
  const sumPendingA = document.getElementById("sumPendingA");
  const sumProsesA = document.getElementById("sumProsesA");
  const sumDoneA = document.getElementById("sumDoneA");
  const sumRobuxDoneA = document.getElementById("sumRobuxDoneA");
  const sumHeartDiamondDoneA = document.getElementById("sumHeartDiamondDoneA");

  const q = query(collection(db,"orders"), orderBy("createdAt","desc"));

  unsubscribeOrders = onSnapshot(q, (snap)=>{
    const allDocs = [];
    snap.forEach(d => allDocs.push(d));

    const allData = allDocs.map(d => d.data());
    const summary = calcSummaryFromData(allData);
    sumTotalA.textContent = formatID(summary.total);
    sumPendingA.textContent = formatID(summary.pending);
    sumProsesA.textContent = formatID(summary.proses);
    sumDoneA.textContent = formatID(summary.done);
    sumRobuxDoneA.textContent = formatID(summary.robuxDone);
    sumHeartDiamondDoneA.textContent = formatID(summary.heartDiamondDone);

    const total = allDocs.length;
    const pager = makePager(total, adminPage, PAGE_SIZE);
    adminPage = pager.page;

    const pageDocs = allDocs.slice(pager.start, pager.end);

    const rows = [];
    pageDocs.forEach((d, idx)=>{
      const o = d.data();
      const s = STATUS.find(x=>x.v===o.status) || {label:(o.status||"-"), cls:""};
      const nomor = total - pager.start - idx;

      rows.push(`
        <tr>
          <td>${nomor}</td>
          <td>${o.amountLabel || "-"}</td>
          <td>${o.robuxType || "-"}</td>
          <td><span class="badge ${s.cls}">${s.label}</span></td>
          <td>${fmtTime(o.createdAt)}</td>
          <td>${fmtTime(o.completedAt)}</td>
          <td>
            <div class="row">
              <button class="secondary" data-id="${d.id}" data-st="PENDING">Pending</button>
              <button class="secondary" data-id="${d.id}" data-st="PROSES">Proses</button>
              <button data-id="${d.id}" data-st="DONE">Done</button>
            </div>
          </td>
        </tr>
      `);
    });

    tbody.innerHTML = rows.length
      ? rows.join("")
      : `<tr><td colspan="7" class="small">Belum ada order.</td></tr>`;

    tbody.querySelectorAll("button[data-id]").forEach(btn=>{
      btn.onclick = async ()=>{
        try {
          const id = btn.getAttribute("data-id");
          const st = btn.getAttribute("data-st");
          await updateDoc(doc(db,"orders", id), {
            status: st,
            completedAt: serverTimestamp()
          });
        } catch (e) {
          alert("Gagal update status: " + (e?.message || e));
        }
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    pageInfoA.textContent = `Page ${adminPage + 1} / ${totalPages}`;

    prevBtnA.disabled = adminPage === 0;
    nextBtnA.disabled = adminPage >= (totalPages - 1);

    prevBtnA.onclick = () => {
      if (adminPage > 0) {
        adminPage--;
        renderAdmin();
        window.scrollTo(0, 0);
      }
    };

    nextBtnA.onclick = () => {
      if (adminPage < totalPages - 1) {
        adminPage++;
        renderAdmin();
        window.scrollTo(0, 0);
      }
    };
  }, (err)=>alert("Gagal load orders: " + (err?.message || err)));
}

/* =========================
   ROUTER
========================= */
function route(){
  setActiveNav();
  const hash = location.hash || "#/";
  if (hash.startsWith("#/admin")) renderAdmin();
  else renderPublic();
}

onAuthStateChanged(auth, (u)=>{
  currentUser = u;
  route();
});

window.addEventListener("hashchange", async ()=>{
  const hash = location.hash || "#/";
  if (hash.startsWith("#/admin") && currentUser?.email !== ADMIN_EMAIL) {
    await adminLogin(); // auto popup login kalau kamu buka /admin
  } else {
    route();
  }
});

route();
