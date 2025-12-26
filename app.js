import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy,
  doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ✅ Firebase config kamu (project: antrianky)
const firebaseConfig = {
  apiKey: "AIzaSyBN2PxHOA9u-I2iPCX_5gT1iogL5zYGHhM",
  authDomain: "antrianky.firebaseapp.com",
  projectId: "antrianky",
  storageBucket: "antrianky.firebasestorage.app",
  messagingSenderId: "194560917480",
  appId: "1:194560917480:web:99c4bc99bfb9fcc747ae5d",
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
const navAdmin = document.getElementById("navAdmin");

let currentUser = null;
let unsubscribeOrders = null;

function fmtTime(ts){
  if(!ts) return "-";
  const d = ts.toDate?.() ? ts.toDate() : new Date(ts);
  return d.toLocaleString("id-ID");
}

function setActiveNav(){
  const hash = location.hash || "#/";
  navPublic.classList.toggle("active", !hash.startsWith("#/admin"));
  navAdmin.classList.toggle("active", hash.startsWith("#/admin"));
}

function renderPublic(){
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
  if (unsubscribeOrders) unsubscribeOrders();

  const q = query(collection(db,"orders"), orderBy("createdAt","desc"));
  unsubscribeOrders = onSnapshot(q, (snap)=>{
    const rows = [];
    snap.forEach((d, idx)=>{
      const o = d.data();
      const s = STATUS.find(x=>x.v===o.status) || {label:o.status, cls:""};
      rows.push(`
        <tr>
          <td>${idx+1}</td>
          <td>${fmtTime(o.createdAt)}</td>
          <td>${o.robuxType || "-"}</td>
          <td>${o.amountLabel || "-"}</td>
          <td><span class="badge ${s.cls}">${s.label}</span></td>
          <td>${fmtTime(o.completedAt)}</td>
        </tr>
      `);
    });
    tbody.innerHTML = rows.length ? rows.join("") : `<tr><td colspan="6" class="small">Belum ada order.</td></tr>`;
  });
}

function renderAdmin(){
  const isAdmin = currentUser?.email === ADMIN_EMAIL;

  view.innerHTML = `
    <div class="row" style="justify-content:space-between; margin: 6px 0 12px;">
      <div class="small">
        ${currentUser ? `Login: <b>${currentUser.email}</b>` : `Belum login`}
        ${currentUser && !isAdmin ? ` • <b>(bukan admin)</b>` : ``}
      </div>
      <div class="row">
        ${!currentUser ? `<button id="btnLogin">Login Google</button>` : ``}
        ${currentUser ? `<button class="secondary" id="btnLogout">Logout</button>` : ``}
      </div>
    </div>

    ${isAdmin ? `
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
    ` : ``}

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
            ${isAdmin ? `<th>Aksi</th>` : ``}
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  `;

  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogin) btnLogin.onclick = async ()=> { await signInWithPopup(auth, provider); };
  if (btnLogout) btnLogout.onclick = async ()=> { await signOut(auth); };

  const tbody = document.getElementById("tbody");
  if (unsubscribeOrders) unsubscribeOrders();

  const q = query(collection(db,"orders"), orderBy("createdAt","desc"));
  unsubscribeOrders = onSnapshot(q, (snap)=>{
    const rows = [];
    snap.forEach((d, idx)=>{
      const o = d.data();
      const s = STATUS.find(x=>x.v===o.status) || {label:o.status, cls:""};
      rows.push(`
        <tr>
          <td>${idx+1}</td>
          <td>${fmtTime(o.createdAt)}</td>
          <td>${o.robuxType || "-"}</td>
          <td>${o.amountLabel || "-"}</td>
          <td><span class="badge ${s.cls}">${s.label}</span></td>
          <td>${fmtTime(o.completedAt)}</td>
          ${isAdmin ? `
            <td>
              <div class="row">
                <button class="secondary" data-id="${d.id}" data-st="PENDING">Pending</button>
                <button class="secondary" data-id="${d.id}" data-st="PROSES">Proses</button>
                <button data-id="${d.id}" data-st="DONE">Done</button>
              </div>
            </td>
          ` : ``}
        </tr>
      `);
    });
    tbody.innerHTML = rows.length ? rows.join("") : `<tr><td colspan="${isAdmin?7:6}" class="small">Belum ada order.</td></tr>`;

    if (isAdmin) {
      tbody.querySelectorAll("button[data-id]").forEach(btn=>{
        btn.onclick = async ()=>{
          const id = btn.getAttribute("data-id");
          const st = btn.getAttribute("data-st");
          await updateDoc(doc(db,"orders", id), {
            status: st,
            completedAt: serverTimestamp()
          });
        };
      });
    }
  });

  if (isAdmin) {
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
      await addDoc(collection(db,"orders"), {
        createdAt: serverTimestamp(),
        robuxType: selType.value,
        amountLabel: selAmount.value,
        status: selStatus.value,
        completedAt: serverTimestamp()
      });
    };
  }
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

window.addEventListener("hashchange", route);
route();
