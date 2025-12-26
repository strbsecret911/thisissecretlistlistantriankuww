import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy,
  doc, updateDoc, serverTimestamp
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

const ROBUX_OPTIONS = {
  REGULER: ["80 Robux","160 Robux","240 Robux","320 Robux","400 Robux","480 Robux","560 Robux","640 Robux","720 Robux","800 Robux","1.700 Robux","2.100 Robux","3.400 Robux","4.500 Robux","10.000 Robux","22.500 Robux"],
  BASIC: ["500 Robux","580 Robux","660 Robux","740 Robux","820 Robux","1.000 Robux","1.500 Robux","2.000 Robux","2.500 Robux","3.000 Robux","3.500 Robux","4.000 Robux","5.000 Robux","6.000 Robux","15.000 Robux"],
  PREMIUM: ["450 Robux + Premium","1.000 Robux + Premium","1.550 Robux + Premium","2.200 Robux + Premium","2.750 Robux + Premium","3.300 Robux + Premium","4.400 Robux + Premium","5.500 Robux + Premium","11.000 Robux + Premium"],
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

function renderPublic(){
  stopOrdersListener();

  view.innerHTML = `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Waktu Input</th>
            <th>Jenis</th>
            <th>Nominal</th>
            <th>Status</th>
            <th>Waktu Selesai</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById("tbody");
  const q = query(collection(db,"orders"), orderBy("createdAt","desc"));

  unsubscribeOrders = onSnapshot(q, (snap)=>{
    const rows = [];
    let no = 1;

    snap.forEach((d)=>{
      const o = d.data();
      const s = STATUS.find(x=>x.v===o.status) || {label:(o.status||"-"), cls:""};

      rows.push(`
        <tr>
          <td>${no}</td>
          <td>${fmtTime(o.createdAt)}</td>
          <td>${o.robuxType || "-"}</td>
          <td>${o.amountLabel || "-"}</td>
          <td><span class="badge ${s.cls}">${s.label}</span></td>
          <td>${fmtTime(o.completedAt)}</td>
        </tr>
      `);

      no++;
    });

    tbody.innerHTML = rows.length
      ? rows.join("")
      : `<tr><td colspan="6" class="small">Belum ada order.</td></tr>`;
  }, (err)=>alert("Gagal load orders: " + (err?.message || err)));
}

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

function renderAdmin(){
  const isAdmin = currentUser?.email === ADMIN_EMAIL;

  // non-admin yang akses /admin -> balik publik
  if (!isAdmin) { location.hash = "#/"; return; }

  stopOrdersListener();

  view.innerHTML = `
    <div class="row" style="justify-content:flex-end; margin: 6px 0 12px;">
      <button class="secondary" id="btnLogout">Logout</button>
    </div>

    <div class="card" style="margin: 10px 0 14px;">
      <div class="brand" style="margin-bottom:10px;">Tambah Order Manual</div>
      <div class="row">
        <select id="selType">
          <option value="REGULER">REGULER</option>
          <option value="BASIC">BASIC</option>
          <option value="PREMIUM">PREMIUM</option>
        </select>

        <select id="selAmount"></select>

        <select id="selStatus">
          ${STATUS.map(s=>`<option value="${s.v}">${s.label}</option>`).join("")}
        </select>

        <button id="btnAdd">Add</button>
      </div>
      <div class="small" style="margin-top:8px;">
        * createdAt auto. completedAt auto update tiap status di-set/diubah.
      </div>
    </div>

    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Waktu Input</th>
            <th>Jenis</th>
            <th>Nominal</th>
            <th>Status</th>
            <th>Waktu Selesai</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById("btnLogout").onclick = adminLogout;

  const selType = document.getElementById("selType");
  const selAmount = document.getElementById("selAmount");
  const selStatus = document.getElementById("selStatus");
  const btnAdd = document.getElementById("btnAdd");

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

      await addDoc(collection(db,"orders"), {
        createdAt: serverTimestamp(),
        robuxType: selType.value,
        amountLabel: selAmount.value,
        status: selStatus.value,
        completedAt: serverTimestamp()
      });

      btnAdd.textContent = "Add";
      btnAdd.disabled = false;
    } catch (e) {
      btnAdd.textContent = "Add";
      btnAdd.disabled = false;
      alert("Gagal add: " + (e?.message || e));
    }
  };

  const tbody = document.getElementById("tbody");
  const q = query(collection(db,"orders"), orderBy("createdAt","desc"));

  unsubscribeOrders = onSnapshot(q, (snap)=>{
    const rows = [];
    let no = 1;

    snap.forEach((d)=>{
      const o = d.data();
      const s = STATUS.find(x=>x.v===o.status) || {label:(o.status||"-"), cls:""};

      rows.push(`
        <tr>
          <td>${no}</td>
          <td>${fmtTime(o.createdAt)}</td>
          <td>${o.robuxType || "-"}</td>
          <td>${o.amountLabel || "-"}</td>
          <td><span class="badge ${s.cls}">${s.label}</span></td>
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

      no++;
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
  }, (err)=>alert("Gagal load orders: " + (err?.message || err)));
}

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
