import { useState, useEffect, useRef } from "react";

// ─── PromptPay QR (EMV) ───────────────────────────────────────────────────────
const PROMPTPAY_ID = "1342549531";

function formatPromptPayId(id) {
  const d = id.replace(/\D/g, "");

  if (d.length === 13) {
    return "0000000000013" + d;
  }

  if (d.length === 10) {
    return "0066" + d.slice(1);
  }

  return d;
}

function crc16(data) {
  let crc = 0xffff;

  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;

    for (let j = 0; j < 8; j++) {
      crc =
        crc & 0x8000
          ? (crc << 1) ^ 0x1021
          : crc << 1;
    }
  }

  return (crc & 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
}

function tlv(tag, value) {
  return (
    tag +
    value.length.toString().padStart(2, "0") +
    value
  );
}

function generatePromptPayQR(id, amount) {
  const fmtId = formatPromptPayId(id);

  const merchantInfo =
    tlv("00", "A000000677010111") +
    tlv("01", fmtId);

  let payload =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("29", merchantInfo) +
    tlv("53", "764") +
    (amount
      ? tlv("54", amount.toFixed(2))
      : "") +
    tlv("58", "TH") +
    tlv("59", "DARIS CAFE") +
    tlv("60", "Bangkok") +
    "6304";

  return payload + crc16(payload);
}

// ─── QR Code renderer ─────────────────────────────────────────────────────────
function QRCanvas({
  text,
  size = 200,
  dark = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!text || !ref.current) return;

    const el = ref.current;
    el.innerHTML = "";

    const load = () => {
      if (
        typeof window === "undefined" ||
        !window.QRCode
      ) {
        return;
      }

      new window.QRCode(el, {
        text,
        width: size,
        height: size,
        colorDark: dark
          ? "#f5e6d3"
          : "#000000",
        colorLight: dark
          ? "#1a0f08"
          : "#ffffff",
        correctLevel:
          window.QRCode?.CorrectLevel?.M || 0,
      });
    };

    if (
      typeof window !== "undefined" &&
      window.QRCode
    ) {
      load();
      return;
    }

    if (
      document.querySelector(
        'script[data-qrlib]'
      )
    ) {
      const wait = setInterval(() => {
        if (window.QRCode) {
          clearInterval(wait);
          load();
        }
      }, 80);

      return () => clearInterval(wait);
    }

    const s = document.createElement("script");

    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

    s.setAttribute("data-qrlib", "1");

    s.onload = load;

    document.head.appendChild(s);
  }, [text, size, dark]);

  return (
    <div
      ref={ref}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        overflow: "hidden",
      }}
    />
  );
}

function PromptPayQRCanvas({
  amount,
  size = 200,
  dark = false,
}) {
  const payload = generatePromptPayQR(
    PROMPTPAY_ID,
    amount
  );

  return (
    <QRCanvas
      text={payload}
      size={size}
      dark={dark}
    />
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const DEFAULT_MENU = [
  { id: 1, name: "Espresso", price: 65, category: "coffee", emoji: "☕" },
  { id: 2, name: "Latte", price: 85, category: "coffee", emoji: "🥛" },
  { id: 3, name: "Cappuccino", price: 85, category: "coffee", emoji: "☕" },
  { id: 4, name: "Americano", price: 70, category: "coffee", emoji: "☕" },
  { id: 5, name: "Cold Brew", price: 95, category: "coffee", emoji: "🧊" },
  { id: 6, name: "Matcha Latte", price: 95, category: "non-coffee", emoji: "🍵" },
  { id: 7, name: "Strawberry Smoothie", price: 105, category: "non-coffee", emoji: "🍓" },
  { id: 8, name: "Croissant", price: 75, category: "food", emoji: "🥐" },
  { id: 9, name: "Club Sandwich", price: 145, category: "food", emoji: "🥪" },
  { id: 10, name: "Cheesecake", price: 120, category: "food", emoji: "🍰" },
];
const TABLES_DEF = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, seats: i < 4 ? 2 : i < 8 ? 4 : 6 }));
const CAT = { coffee: "Coffee", "non-coffee": "Non-Coffee", food: "Food" };
const PAY_METHODS = [
  { id: "cash", label: "เงินสด", icon: "💵" },
  { id: "qr", label: "QR / พร้อมเพย์", icon: "📲" },
  { id: "card", label: "บัตรเครดิต", icon: "💳" },
];
const BASE_URL = "https://daris-cafe.vercel.app";
const ADMIN_PIN = "1234";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const initTbl = (d) => ({ ...d, status: "available", kitchenStatus: null, orders: [], orderedAt: null, orderSeq: 0 });
const tableColor = (t, dm) => {
  if (t.status === "available") return dm ? "#4a8a1a" : "#639922";
  if (t.kitchenStatus === "waiting") return dm ? "#d4851a" : "#ba7517";
  if (t.kitchenStatus === "cooking") return dm ? "#2a7fd4" : "#185fa5";
  if (t.kitchenStatus === "ready") return dm ? "#1a9070" : "#0f6e56";
  return dm ? "#e85555" : "#e24b4a";
};
const kitchenTag = (t, dm) => {
  const s = dm
    ? { avail: { bg: "#1a3a0a", c: "#6abf30" }, wait: { bg: "#3a1f00", c: "#e8951a" }, cook: { bg: "#001a3a", c: "#4a9de8" }, ready: { bg: "#003a28", c: "#1ac890" }, busy: { bg: "#3a0000", c: "#e85555" } }
    : { avail: { bg: "#eaf3de", c: "#3b6d11" }, wait: { bg: "#faeeda", c: "#854f0b" }, cook: { bg: "#e6f1fb", c: "#185fa5" }, ready: { bg: "#e1f5ee", c: "#0f6e56" }, busy: { bg: "#f7c1c1", c: "#a32d2d" } };
  if (!t || t.status === "available") return { label: "ว่าง", ...s.avail };
  if (t.kitchenStatus === "waiting") return { label: "⏳ รอเตรียม", ...s.wait };
  if (t.kitchenStatus === "cooking") return { label: "🔥 กำลังทำ", ...s.cook };
  if (t.kitchenStatus === "ready") return { label: "✅ พร้อมเสิร์ฟ", ...s.ready };
  return { label: "ไม่ว่าง", ...s.busy };
};
const mergeItems = (orders) => {
  const m = new Map();

  (orders || [])
    .flatMap((o) => o.items || [])
    .forEach((item) => {
      if (m.has(item.id)) {
        m.get(item.id).qty += item.qty;
      } else {
        m.set(item.id, { ...item });
      }
    });

  return Array.from(m.values());
};
// ─── CSS ──────────────────────────────────────────────────────────────────────
const buildCSS = (dm) => `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg: ${dm ? "#0e0905" : "#faf7f2"};
    --surface: ${dm ? "#1a0f08" : "#ffffff"};
    --surface2: ${dm ? "#231510" : "#fdfaf6"};
    --border: ${dm ? "#3a2518" : "#e8d5b7"};
    --text: ${dm ? "#f0dcc8" : "#2c1810"};
    --text2: ${dm ? "#a08060" : "#8b7355"};
    --text3: ${dm ? "#7a6050" : "#c8a97e"};
    --accent: ${dm ? "#c8824a" : "#3d1f0d"};
    --accent2: ${dm ? "#e0a870" : "#5a2e14"};
    --inp-border: ${dm ? "#5a3520" : "#d4b896"};
    --inp-focus: ${dm ? "#c8824a" : "#8b5e3c"};
    --shadow: ${dm ? "rgba(0,0,0,.5)" : "rgba(61,31,13,.09)"};
    --header-grad: ${dm ? "linear-gradient(135deg,#0a0604 0%,#1a0c06 55%,#3a1a08 100%)" : "linear-gradient(135deg,#3d1f0d 0%,#5a2e14 55%,#8b5e3c 100%)"};
  }
  body{background:var(--bg);color:var(--text)}
  .cf{font-family:'Playfair Display',Georgia,serif}
  .s{font-family:'Lato',sans-serif}
  .card{background:var(--surface);border-radius:12px;box-shadow:0 2px 14px var(--shadow);border:1px solid var(--border)}
  .inp{width:100%;border:1.5px solid var(--inp-border);border-radius:6px;padding:9px 12px;font-size:14px;font-family:'Lato',sans-serif;background:var(--surface2);color:var(--text);outline:none;transition:border-color .2s}
  .inp:focus{border-color:var(--inp-focus)}
  .btn{border:none;border-radius:7px;padding:10px 20px;cursor:pointer;font-family:'Lato',sans-serif;font-size:14px;transition:all .18s;font-weight:400}
  .bd{background:var(--accent);color:${dm ? "#0e0905" : "#f5e6d3"}}.bd:hover{filter:brightness(1.2)}
  .bo{background:transparent;color:var(--accent);border:1.5px solid var(--accent)}.bo:hover{background:var(--accent);color:${dm ? "#0e0905" : "#f5e6d3"}}
  .br{background:#a32d2d;color:white}.br:hover{background:#791f1f}
  .bg{background:#3b6d11;color:white}.bg:hover{background:#27500a}
  .bb{background:#185fa5;color:white}.bb:hover{background:#0c447c}
  .ba{background:#854f0b;color:white}.ba:hover{background:#633806}
  .sm{padding:5px 12px;font-size:12px;border-radius:5px}
  .tag{display:inline-block;padding:3px 11px;border-radius:20px;font-size:12px;font-family:'Lato',sans-serif;font-weight:700}
  .tab-btn{background:transparent;border:none;padding:10px 16px;font-family:'Lato',sans-serif;font-size:13px;cursor:pointer;color:var(--text2);border-bottom:3px solid transparent;transition:all .2s}
  .tab-btn.on{color:var(--text);border-bottom-color:var(--accent);font-weight:700}
  .notif{position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:9px;font-family:'Lato',sans-serif;font-size:14px;font-weight:700;z-index:9999;animation:sld .3s ease;max-width:320px;line-height:1.5}
  .ns{background:#3b6d11;color:white}.nd{background:#a32d2d;color:white}.nw{background:#854f0b;color:white}
  @keyframes sld{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
  .ov{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px}
  .mod{background:var(--surface);border-radius:18px;padding:28px;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;border:1px solid var(--border)}
  .npill{background:rgba(255,255,255,.12);color:${dm ? "#f0dcc8" : "#f5e6d3"};border:1.5px solid rgba(255,255,255,.25);border-radius:20px;padding:6px 14px;cursor:pointer;font-family:'Lato',sans-serif;font-size:13px;font-weight:700;transition:background .2s}
  .npill:hover{background:rgba(255,255,255,.25)}.anav{background:rgba(255,255,255,.25);border-color:rgba(255,255,255,.5)}
  .bc{background:#a32d2d;color:white;border-radius:50%;width:18px;height:18px;font-size:11px;display:inline-flex;align-items:center;justify-content:center;font-family:'Lato';font-weight:700;margin-left:4px}
  .po{border:2px solid var(--border);border-radius:10px;padding:14px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:10px;font-family:'Lato',sans-serif;background:var(--surface)}
  .po:hover{border-color:var(--inp-focus)}.po.sel{border-color:var(--accent);background:var(--surface2)}
  hr.div{border:none;border-top:1px solid var(--border);margin:12px 0}
  .qr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px}
  .qr-card{background:var(--surface);border-radius:14px;padding:18px;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 2px 14px var(--shadow);border:1.5px solid var(--border);transition:box-shadow .2s}
  .qr-card:hover{box-shadow:0 4px 22px var(--shadow)}
  .tbl-locked{opacity:.82;cursor:not-allowed!important}
  .cart-drawer{position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:2px solid var(--border);z-index:500;padding:14px 18px 24px;transform:translateY(0);transition:transform .3s ease;box-shadow:0 -4px 24px var(--shadow)}
  .cart-drawer.hidden{transform:translateY(100%)}
  @media(min-width:768px){.cart-drawer{display:none}}
  @media(max-width:767px){
    .desktop-cart{display:none!important}
    .order-grid{grid-template-columns:1fr!important;padding-bottom:180px!important}
    .admin-stats{flex-wrap:wrap;gap:8px}
    .admin-stats .stat-card{min-width:calc(50% - 4px);flex:1}
    .qr-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))!important;gap:12px}
    .mod{padding:20px;border-radius:14px}
    .tab-btn{padding:10px 10px;font-size:12px}
  }
`;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DarisCafe() {
  const [darkMode, setDarkMode] = useState(false);
  const [view, setView] = useState("customer");
  const [menu, setMenu] = useState(DEFAULT_MENU);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [tables, setTables] = useState(TABLES_DEF.map(initTbl));
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [adminTab, setAdminTab] = useState("tables");
  const [editingId, setEditingId] = useState(null);
  const [menuForm, setMenuForm] = useState({ name: "", price: "", category: "coffee", emoji: "☕", image: null });
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [notif, setNotif] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [payMethod, setPayMethod] = useState("cash");
  const [cashInput, setCashInput] = useState("");
  const [dailySales, setDailySales] = useState([]);
  const [allSales, setAllSales] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryDate, setSummaryDate] = useState(new Date().toLocaleDateString("th-TH"));
  const [receipt, setReceipt] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [cartOpen, setCartOpen] = useState(false); // mobile cart drawer
  // myTable = โต๊ะที่ลูกค้าเลือกไว้แล้ว (ล็อคตลอด session)
  const [myTable, setMyTable] = useState(() => {
   const [myTable, setMyTable] = useState(() => {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const v = sessionStorage.getItem("myTable");

    return v ? Number(v) : null;
  } catch {
    return null;
  }
});
  });

  const dm = darkMode;

// ── Load from localStorage ──
useEffect(() => {
  try {
    const sales = localStorage.getItem("sales-history");
    if (sales) setAllSales(JSON.parse(sales));

    const menuData = localStorage.getItem("menu-data");
    if (menuData) setMenu(JSON.parse(menuData));

    const dark = localStorage.getItem("dark-mode");
    if (dark === "1") setDarkMode(true);
  } catch (e) {
    console.log(e);
  }

  setMenuLoaded(true);
}, []);

// ── Save sales ──
useEffect(() => {
  localStorage.setItem("sales-history", JSON.stringify(allSales));
}, [allSales]);

// ── Save menu ──
useEffect(() => {
  if (!menuLoaded) return;
  localStorage.setItem("menu-data", JSON.stringify(menu));
}, [menu, menuLoaded]);

// ── Save dark mode ──
useEffect(() => {
  localStorage.setItem("dark-mode", dm ? "1" : "0");
}, [dm]);
  const claimTable = (tableId) => {
  setMyTable(tableId);

  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "myTable",
        String(tableId)
      );
    }
  } catch (e) {
    console.error(e);
  }
};
 const releaseMyTable = () => {
  setMyTable(null);

  try {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("myTable");
    }
  } catch (e) {
    console.error(e);
  }
};

  const notify = (msg, type = "success") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  const getT = (id) => tables.find((t) => t.id === id);

  const goToTable = (tableId) => {
    claimTable(tableId);
    setSelectedTable(tableId); setCart([]); setView("order"); setQrModal(null); setCartOpen(false);
  };

  const addToCart = (item) => setCart((p) => {
    const ex = p.find((c) => c.id === item.id);
    return ex ? p.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c) : [...p, { ...item, qty: 1 }];
  });
  const remFromCart = (id) => setCart((p) => {
    const ex = p.find((c) => c.id === id);
    if (ex && ex.qty > 1) return p.map((c) => c.id === id ? { ...c, qty: c.qty - 1 } : c);
    return p.filter((c) => c.id !== id);
  });

  const placeOrder = () => {
    if (!cart.length) return;
    const t = getT(selectedTable);
    const seq = (t.orderSeq || 0) + 1;
    const round = { seq, items: cart, time: new Date().toLocaleTimeString("th-TH"), status: "waiting" };
    setTables((p) => p.map((t) => t.id === selectedTable ? {
      ...t, status: "busy", kitchenStatus: "waiting",
      orders: [...(t.orders || []), round],
      orderedAt: t.orderedAt || new Date().toLocaleTimeString("th-TH"),
      orderSeq: seq,
    } : t));
    setCart([]); setSelectedTable(null); setView("customer"); setCartOpen(false);
    // ไม่ release myTable ตรงนี้ — ยังอยู่โต๊ะเดิม สั่งเพิ่มได้
    notify("สั่งอาหารสำเร็จ! ครัวได้รับออเดอร์แล้ว ✓");
  };

  const setKitchen = (tableId, status) => {
    setTables((p) => p.map((t) => t.id !== tableId ? t : { ...t, kitchenStatus: status }));
    const lbl = { cooking: "กำลังทำอาหาร 🔥", ready: "อาหารพร้อมเสิร์ฟ ✅" };
    notify(`โต๊ะ ${tableId}: ${lbl[status] || status}`);
  };

  const openPay = (tableId) => { setPayModal(tableId); setPayMethod("cash"); setCashInput(""); };

  const confirmPay = () => {
    const tbl = getT(payModal);
    const total = orderTotal(tbl);
    const items = mergeItems(tbl.orders);
    const rec = {
      tableId: payModal, items, total, method: payMethod,
      cash: payMethod === "cash" ? Number(cashInput) : null,
      change: payMethod === "cash" ? Number(cashInput) - total : null,
      time: new Date().toLocaleTimeString("th-TH"),
      date: new Date().toLocaleDateString("th-TH"),
      dateKey: new Date().toISOString().slice(0, 10),
    };
    setDailySales((p) => [...p, rec]);
    setAllSales((p) => [...p, rec]);
    setReceipt(rec);
    setTables((p) => p.map((t) => t.id === payModal ? initTbl(TABLES_DEF.find((d) => d.id === t.id)) : t));
    if (myTable === payModal) releaseMyTable();
    setPayModal(null);
  };

  const saveMenu = () => {
    if (!menuForm.name || !menuForm.price) return;
    if (editingId) {
      setMenu((p) => p.map((m) => m.id === editingId ? { ...m, ...menuForm, price: Number(menuForm.price) } : m));
      notify("แก้ไขเมนูสำเร็จ");
    } else {
      setMenu((p) => [...p, { ...menuForm, id: Date.now(), price: Number(menuForm.price) }]);
      notify("เพิ่มเมนูสำเร็จ");
    }
    setMenuForm({ name: "", price: "", category: "coffee", emoji: "☕", image: null });
    setEditingId(null); setShowMenuForm(false);
  };

  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const busyCount = tables.filter((t) => t.status === "busy").length;
  const categories = [...new Set(menu.map((m) => m.category))];
  const totalRev = dailySales.reduce((s, r) => s + r.total, 0);
  const curTable = tables.find((t) => t.id === selectedTable);
  const isAddOn = curTable && curTable.status === "busy";
  const cashNum = Number(cashInput);
  const change = cashNum - (payModal ? orderTotal(getT(payModal)) : 0);
  const canPay = payMethod !== "cash" || (cashNum >= (payModal ? orderTotal(getT(payModal)) : 0) && cashNum > 0);

  // ── Cart panel (shared between desktop sidebar and mobile drawer) ──
  const CartPanel = ({ mobile = false }) => (
    <div style={mobile ? {} : { padding: 18 }}>
      {!mobile && (
        <h3 className="cf" style={{ fontSize: 19, color: "var(--text)", marginBottom: 14 }}>
          {isAddOn ? "รายการเพิ่ม" : "ตะกร้า"} ({cartCount})
        </h3>
      )}
      {cart.length === 0 ? (
        <div style={{ textAlign: "center", padding: mobile ? "10px 0" : "28px 0", color: "var(--text3)" }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🛒</div>
          <div className="s" style={{ fontSize: 12 }}>ยังไม่มีรายการ</div>
        </div>
      ) : (
        <>
          <div style={{ maxHeight: mobile ? 140 : 280, overflowY: "auto", marginBottom: 12 }}>
            {cart.map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="s" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{item.emoji} {item.name}</div>
                  <div className="s" style={{ fontSize: 11, color: "var(--text2)" }}>×{item.qty} · ฿{item.price * item.qty}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => remFromCart(item.id)} style={{ width: 22, height: 22, border: "1px solid var(--border)", borderRadius: "50%", background: "transparent", cursor: "pointer", fontSize: 14, color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <button onClick={() => addToCart(item)} style={{ width: 22, height: 22, border: "none", borderRadius: "50%", background: "var(--accent)", cursor: "pointer", fontSize: 14, color: dm ? "#0e0905" : "#f5e6d3", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "2px solid var(--border)", paddingTop: 10, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span className="cf" style={{ fontSize: 15, color: "var(--text)" }}>รวม</span>
            <span className="cf" style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>฿{cartTotal}</span>
          </div>
          <button className="btn bd" style={{ width: "100%", padding: "12px", fontSize: 15 }} onClick={placeOrder}>
            {isAddOn ? "✓ สั่งเพิ่ม" : "✓ สั่งอาหาร"}
          </button>
        </>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: "Georgia,serif", minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <style>{buildCSS(dm)}</style>

      {/* Notification */}
      {notif && <div className={`notif n${notif.type[0]}`}>{notif.msg}</div>}

      {/* QR Modal */}
      {qrModal && (
        <div className="ov">
          <div className="mod" style={{ maxWidth: 340, textAlign: "center" }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>📱</div>
            <h2 className="cf" style={{ fontSize: 22, color: "var(--text)", marginBottom: 2 }}>QR โต๊ะ {qrModal}</h2>
            <p className="s" style={{ fontSize: 12, color: "var(--text2)", marginBottom: 20 }}>ติดที่โต๊ะ — ลูกค้าสแกนเพื่อสั่งได้เลย</p>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <div style={{ padding: 14, background: dm ? "#1a0f08" : "#fdfaf6", borderRadius: 14, border: "2px solid var(--border)" }}>
                <QRCanvas text={`${BASE_URL}?table=${qrModal}`} size={190} dark={dm} />
              </div>
            </div>
            <div style={{ background: "var(--accent)", color: dm ? "#0e0905" : "#f5e6d3", borderRadius: 10, padding: "10px 24px", display: "inline-block", marginBottom: 14 }}>
              <div className="cf" style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>โต๊ะ {qrModal}</div>
              <div className="s" style={{ fontSize: 10, opacity: 0.7, letterSpacing: 3 }}>DARIS CAFE · TABLE {qrModal}</div>
            </div>
            <p className="s" style={{ fontSize: 10, color: "var(--text3)", marginBottom: 20 }}>{BASE_URL}?table={qrModal}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <button className="btn bd" style={{ width: "100%", fontSize: 15, padding: "13px" }} onClick={() => goToTable(qrModal)}>📲 จำลองการสแกน QR</button>
              <button className="btn bo" onClick={() => setQrModal(null)}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <div className="ov">
          <div className="mod" style={{ maxWidth: 360 }}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 38 }}>🧾</div>
              <h2 className="cf" style={{ fontSize: 22, color: "var(--text)", marginTop: 6 }}>DARIS CAFE</h2>
              <div className="s" style={{ fontSize: 11, color: "var(--text2)", letterSpacing: 2 }}>ใบเสร็จรับเงิน</div>
            </div>
            <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="s" style={{ fontSize: 12, color: "var(--text2)" }}>โต๊ะ</span>
                <span className="s" style={{ fontSize: 13, fontWeight: 700 }}>{receipt.tableId}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="s" style={{ fontSize: 12, color: "var(--text2)" }}>วัน/เวลา</span>
                <span className="s" style={{ fontSize: 12 }}>{receipt.date} {receipt.time}</span>
              </div>
              <hr className="div" />
              {(receipt.items || []).map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span className="s" style={{ fontSize: 13 }}>{item.emoji} {item.name} ×{item.qty}</span>
                  <span className="s" style={{ fontSize: 13, color: "var(--accent2)" }}>฿{item.price * item.qty}</span>
                </div>
              ))}
              <hr className="div" />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="cf" style={{ fontSize: 16 }}>รวมทั้งหมด</span>
                <span className="cf" style={{ fontSize: 18, fontWeight: 700 }}>฿{receipt.total}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="s" style={{ fontSize: 12, color: "var(--text2)" }}>ชำระด้วย</span>
                <span className="s" style={{ fontSize: 13, fontWeight: 700 }}>{PAY_METHODS.find((p) => p.id === receipt.method)?.label}</span>
              </div>
              {receipt.method === "cash" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span className="s" style={{ fontSize: 12, color: "var(--text2)" }}>รับเงิน</span>
                    <span className="s" style={{ fontSize: 13 }}>฿{receipt.cash}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span className="s" style={{ fontSize: 12, color: "var(--text2)" }}>เงินทอน</span>
                    <span className="s" style={{ fontSize: 15, fontWeight: 700, color: "#3b6d11" }}>฿{receipt.change}</span>
                  </div>
                </>
              )}
            </div>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div className="s" style={{ fontSize: 11, color: "var(--text3)" }}>ขอบคุณที่ใช้บริการ · Thank you</div>
            </div>
            <button className="btn bd" style={{ width: "100%" }} onClick={() => setReceipt(null)}>ปิด</button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && !receipt && (() => {
        const tbl = getT(payModal);
        const total = orderTotal(tbl);
        const items = mergeItems(tbl.orders);
        return (
          <div className="ov">
            <div className="mod">
              <h2 className="cf" style={{ fontSize: 22, color: "var(--text)", marginBottom: 4 }}>ชำระเงิน — โต๊ะ {payModal}</h2>
              <p className="s" style={{ fontSize: 13, color: "var(--text2)", marginBottom: 18 }}>เลือกวิธีชำระเงิน</p>
              <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14, marginBottom: 18 }}>
                {(items || []).map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13, fontFamily: "Lato,sans-serif" }}>
                    <span>{item.emoji} {item.name} ×{item.qty}</span>
                    <span style={{ color: "var(--accent2)" }}>฿{item.price * item.qty}</span>
                  </div>
                ))}
                <hr className="div" />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="cf" style={{ fontSize: 17 }}>ยอดรวม</span>
                  <span className="cf" style={{ fontSize: 21, fontWeight: 700 }}>฿{total}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                {PAY_METHODS.map((pm) => (
                  <div key={pm.id} className={`po ${payMethod === pm.id ? "sel" : ""}`} onClick={() => setPayMethod(pm.id)}>
                    <span style={{ fontSize: 22 }}>{pm.icon}</span>
                    <span className="s" style={{ fontSize: 15, fontWeight: payMethod === pm.id ? 700 : 400 }}>{pm.label}</span>
                    {payMethod === pm.id && <span style={{ marginLeft: "auto", color: "#3b6d11", fontSize: 18 }}>✓</span>}
                  </div>
                ))}
              </div>
              {payMethod === "cash" && (
                <div style={{ marginBottom: 18 }}>
                  <label className="s" style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 6 }}>รับเงิน (บาท)</label>
                  <input className="inp" type="number" placeholder="0" value={cashInput} onChange={(e) => setCashInput(e.target.value)} style={{ fontSize: 20, textAlign: "right" }} />
                  {cashNum > 0 && (
                    <div style={{ marginTop: 10, padding: "10px 14px", background: change >= 0 ? (dm ? "#0a2000" : "#eaf3de") : (dm ? "#2a0000" : "#fcebeb"), borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                      <span className="s" style={{ color: change >= 0 ? "#3b6d11" : "#a32d2d", fontWeight: 700, fontSize: 14 }}>{change >= 0 ? "เงินทอน" : "เงินไม่พอ"}</span>
                      <span className="cf" style={{ color: change >= 0 ? "#3b6d11" : "#a32d2d", fontSize: 20, fontWeight: 700 }}>฿{Math.abs(change)}</span>
                    </div>
                  )}
                </div>
              )}
              {payMethod === "qr" && (
                <div style={{ marginBottom: 18, textAlign: "center" }}>
                  <div style={{ background: dm ? "#001a10" : "#f0faf5", border: `1.5px solid ${dm ? "#0a4028" : "#a8d5bc"}`, borderRadius: 14, padding: "18px 14px", display: "inline-block" }}>
                    <div style={{ background: dm ? "#0a1f18" : "white", borderRadius: 10, padding: 10, display: "inline-block", boxShadow: "0 2px 10px rgba(0,0,0,.15)", marginBottom: 10 }}>
                      <div>QR PAYMENT</div>
                    </div>
                    <div className="cf" style={{ fontSize: 26, fontWeight: 700, color: "#1a9070", marginBottom: 2 }}>฿{total.toLocaleString()}</div>
                    <div className="s" style={{ fontSize: 11, color: dm ? "#5a8a72" : "#5a8a72" }}>ยอดฝังใน QR แล้ว — ลูกค้าไม่ต้องกรอก</div>
                    <div className="s" style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>นาย ธัชนนท์ สีหมุ่น · PromptPay</div>
                  </div>
                  <div style={{ marginTop: 10, background: dm ? "#1a1400" : "#fffbe6", border: `1px solid ${dm ? "#3a3000" : "#f0d060"}`, borderRadius: 8, padding: "9px 14px" }}>
                    <span className="s" style={{ fontSize: 12, color: dm ? "#c8a820" : "#7a5f00" }}>⚠️ กด <strong>ยืนยันชำระเงิน</strong> หลังลูกค้าโอนเสร็จแล้ว</span>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn bd" style={{ flex: 1, opacity: canPay ? 1 : 0.4 }} onClick={() => canPay && confirmPay()}>✓ ยืนยันชำระเงิน</button>
                <button className="btn bo" onClick={() => setPayModal(null)}>ยกเลิก</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Summary Modal */}
      {showSummary && (() => {
        const today = new Date().toLocaleDateString("th-TH");
        const allDates = [...new Set(allSales.map(s => s.date))].filter(d => d !== today);
        const shownSales = summaryDate === today ? dailySales : allSales.filter(s => s.date === summaryDate);
        const shownRev = shownSales.reduce((s, r) => s + r.total, 0);
        const itemCount = {};
        shownSales.flatMap(s => s.items).forEach(item => {
          if (!itemCount[item.name]) itemCount[item.name] = { name: item.name, emoji: item.emoji, qty: 0, rev: 0 };
          itemCount[item.name].qty += item.qty;
          itemCount[item.name].rev += item.price * item.qty;
        });
        const topItems = Object.values(itemCount).sort((a, b) => b.qty - a.qty).slice(0, 3);
        return (
          <div className="ov">
            <div className="mod" style={{ maxWidth: 520 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h2 className="cf" style={{ fontSize: 22, color: "var(--text)" }}>📊 สรุปยอดขาย</h2>
                  <p className="s" style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>ข้อมูลเก็บใน browser ของเครื่องนี้</p>
                </div>
                <button className="btn bo sm" onClick={() => setShowSummary(false)}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {[today, ...allDates].map(d => (
                  <button key={d} onClick={() => setSummaryDate(d)} className="s" style={{
                    padding: "6px 14px", borderRadius: 20, border: "1.5px solid",
                    borderColor: summaryDate === d ? "var(--accent)" : "var(--border)",
                    background: summaryDate === d ? "var(--accent)" : "transparent",
                    color: summaryDate === d ? (dm ? "#0e0905" : "#f5e6d3") : "var(--text2)",
                    fontSize: 12, cursor: "pointer", fontWeight: summaryDate === d ? 700 : 400,
                  }}>{d === today ? "วันนี้" : d}</button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { val: `฿${shownRev.toLocaleString()}`, label: "รายได้รวม", color: "var(--text)" },
                  { val: shownSales.length, label: "บิลทั้งหมด", color: "#185fa5" },
                  { val: shownSales.length ? `฿${Math.round(shownRev / shownSales.length).toLocaleString()}` : "—", label: "เฉลี่ย/บิล", color: "#0f6e56" },
                ].map((s, i) => (
                  <div key={i} className="card" style={{ padding: "12px 8px", textAlign: "center" }}>
                    <div className="cf" style={{ fontSize: 18, color: s.color, fontWeight: 700 }}>{s.val}</div>
                    <div className="s" style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {topItems.length > 0 && (
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                  <div className="s" style={{ fontSize: 11, color: "var(--text2)", fontWeight: 700, marginBottom: 8 }}>🏆 เมนูขายดี</div>
                  {topItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                      <span className="s" style={{ fontSize: 13 }}>{["🥇","🥈","🥉"][i]} {item.emoji} {item.name}</span>
                      <span className="s" style={{ fontSize: 12, color: "var(--text2)" }}>{item.qty} แก้ว · ฿{item.rev.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {shownSales.length === 0
                ? <p className="s" style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>ไม่มีรายการ</p>
                : (
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    <div className="s" style={{ fontSize: 11, color: "var(--text2)", fontWeight: 700, marginBottom: 6 }}>รายการบิลทั้งหมด</div>
                    {[...shownSales].reverse().map((s, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                        <span className="s" style={{ fontSize: 13 }}>โต๊ะ {s.tableId} · {s.time} · {PAY_METHODS.find((p) => p.id === s.method)?.icon}</span>
                        <span className="s" style={{ fontWeight: 700, fontSize: 14 }}>฿{s.total}</span>
                      </div>
                    ))}
                  </div>
                )
              }
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button className="btn bd" style={{ flex: 1 }} onClick={() => setShowSummary(false)}>ปิด</button>
                <button className="btn br sm" style={{ fontSize: 11 }} onClick={async () => {
                  if (!confirm("ลบประวัติยอดขายทั้งหมดใช่ไหม?")) return;
                  setAllSales([]); setDailySales([]);
                  try { await window.storage.delete("sales-history"); } catch(e) {}
                  notify("ล้างข้อมูลยอดขายแล้ว", "danger");
                  setShowSummary(false);
                }}>🗑 ล้างข้อมูล</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PIN Modal */}
      {showPinModal && (
        <div className="ov">
          <div className="mod" style={{ maxWidth: 320, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
            <h2 className="cf" style={{ fontSize: 22, color: "var(--text)", marginBottom: 4 }}>Admin Access</h2>
            <p className="s" style={{ fontSize: 13, color: "var(--text2)", marginBottom: 24 }}>กรอก PIN เพื่อเข้าสู่ระบบจัดการ</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 24 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: pinInput.length > i ? "var(--accent)" : "transparent",
                  border: `2px solid ${pinError ? "#a32d2d" : "var(--accent)"}`,
                  transition: "background .15s"
                }} />
              ))}
            </div>
            {pinError && <div className="s" style={{ color: "#a32d2d", fontSize: 13, marginBottom: 14, fontWeight: 700 }}>❌ PIN ไม่ถูกต้อง</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
                <button key={i} onClick={() => {
                  if (k === "") return;
                  if (k === "⌫") { setPinInput(p => p.slice(0,-1)); setPinError(false); return; }
                  const next = pinInput + k;
                  setPinInput(next); setPinError(false);
                  if (next.length === 4) {
                    if (next === ADMIN_PIN) {
                      setAdminAuthed(true); setShowPinModal(false); setView("admin"); setPinInput("");
                    } else {
                      setPinError(true); setTimeout(() => setPinInput(""), 600);
                    }
                  }
                }} style={{
                  height: 56, borderRadius: 10, border: "1.5px solid var(--border)",
                  background: k === "" ? "transparent" : "var(--surface)",
                  fontSize: k === "⌫" ? 20 : 22, fontFamily: "'Playfair Display', serif",
                  fontWeight: 600, color: "var(--text)", cursor: k === "" ? "default" : "pointer",
                  boxShadow: k === "" ? "none" : "0 1px 4px var(--shadow)",
                  transition: "background .12s",
                }}>{k}</button>
              ))}
            </div>
            <button className="btn bo" style={{ width: "100%" }} onClick={() => { setShowPinModal(false); setPinInput(""); }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{ background: "var(--header-grad)", padding: "0 16px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>☕</span>
          <div>
            <div className="cf" style={{ color: dm ? "#f0dcc8" : "#f5e6d3", fontSize: 18, fontWeight: 700, letterSpacing: 1, lineHeight: 1 }}>DARIS CAFE</div>
            <div className="s" style={{ color: dm ? "#9a7a58" : "#c8a97e", fontSize: 9, letterSpacing: 2 }}>SINCE 2020</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* Dark mode toggle */}
          <button onClick={() => setDarkMode(d => !d)} className="npill" style={{ fontSize: 16, padding: "5px 10px" }} title={dm ? "Light mode" : "Dark mode"}>
            {dm ? "☀️" : "🌙"}
          </button>
          <button className={`npill ${view !== "admin" ? "anav" : ""}`} onClick={() => { setView("customer"); setSelectedTable(null); setCart([]); }}>
            {myTable ? `🪑 โต๊ะ ${myTable}` : "🪑 โต๊ะ"}
          </button>
          <button className={`npill ${view === "admin" ? "anav" : ""}`} onClick={() => {
            if (adminAuthed) setView("admin");
            else { setShowPinModal(true); setPinInput(""); setPinError(false); }
          }}>
            ⚙️ Admin{busyCount > 0 && <span className="bc">{busyCount}</span>}
          </button>
        </div>
      </header>

      {/* ── Customer: Table Select ── */}
      {view === "customer" && (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>

          {/* ── มีโต๊ะแล้ว: แสดง banner + ปุ่มสั่งเพิ่ม ── */}
          {myTable && (
            <div style={{ marginBottom: 28 }}>
              {/* Banner โต๊ะของฉัน */}
              <div style={{
                background: dm ? "linear-gradient(135deg,#0a2a00,#1a4a08)" : "linear-gradient(135deg,#eaf3de,#d4edbc)",
                border: `2px solid ${dm ? "#4a8a1a" : "#639922"}`,
                borderRadius: 16, padding: "20px 24px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                flexWrap: "wrap", gap: 14, marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: dm ? "#2a6010" : "#639922",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
                    flexShrink: 0,
                  }}>🪑</div>
                  <div>
                    <div className="cf" style={{ fontSize: 22, color: dm ? "#6abf30" : "#2a5a00", fontWeight: 700 }}>
                      โต๊ะของคุณ: โต๊ะ {myTable}
                    </div>
                    <div className="s" style={{ fontSize: 13, color: dm ? "#4a8a1a" : "#3b6d11", marginTop: 3 }}>
                      {(() => { const kt = kitchenTag(getT(myTable), dm); return kt.label; })()} ·&nbsp;
                      {orderTotal(getT(myTable)) > 0 ? `ยอดรวม ฿${orderTotal(getT(myTable)).toLocaleString()}` : "ยังไม่มีออเดอร์"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn bg" style={{ fontSize: 14, padding: "10px 22px", fontWeight: 700 }}
                    onClick={() => { setSelectedTable(myTable); setCart([]); setView("order"); }}>
                    ➕ สั่งเพิ่ม
                  </button>
                  <button className="btn bo" style={{ fontSize: 13 }}
                    onClick={() => {
                      if (confirm("ออกจากโต๊ะนี้ใช่ไหม? (ออเดอร์ที่สั่งแล้วยังคงอยู่)")) releaseMyTable();
                    }}>
                    ออกจากโต๊ะ
                  </button>
                </div>
              </div>

              {/* ออเดอร์ล่าสุดของโต๊ะนี้ */}
              {(() => {
                const tbl = getT(myTable);
                if (!tbl || tbl.orders.length === 0) return null;
                const items = mergeItems(tbl.orders);
                return (
                  <div className="card" style={{ padding: 16, borderLeft: `4px solid ${dm ? "#4a9de8" : "#185fa5"}` }}>
                    <div className="s" style={{ fontSize: 12, color: "#185fa5", fontWeight: 700, marginBottom: 10 }}>📋 ออเดอร์ของโต๊ะ {myTable}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {items.map((item, i) => (
                        <span key={i} className="tag" style={{ background: "var(--surface2)", color: "var(--accent2)", fontSize: 12 }}>
                          {item.emoji} {item.name} ×{item.qty}
                        </span>
                      ))}
                    </div>
                    <div className="s" style={{ fontSize: 13, color: "var(--text2)" }}>
                      {tbl.orders.length} รอบ · สั่งตั้งแต่ {tbl.orderedAt}
                    </div>
                  </div>
                );
              })()}

              <div className="s" style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", marginTop: 14 }}>
                ── โต๊ะอื่น (ไม่สามารถเลือกได้ขณะนั่งอยู่โต๊ะ {myTable}) ──
              </div>
            </div>
          )}

          {/* ── ไม่มีโต๊ะ: header ปกติ ── */}
          {!myTable && (
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <h1 className="cf" style={{ fontSize: 28, color: "var(--text)" }}>เลือกโต๊ะของคุณ</h1>
              <p className="s" style={{ color: "var(--text2)", marginTop: 6, fontSize: 13 }}>กดโต๊ะสีเขียวเพื่อเริ่มสั่ง</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                {[
                  { bg: dm ? "#1a3a0a" : "#eaf3de", border: dm ? "#4a8a1a" : "#639922", label: "ว่าง — กดได้" },
                  { bg: dm ? "#3a1f00" : "#faeeda", border: dm ? "#d4851a" : "#ba7517", label: "⏳ รอเตรียม" },
                  { bg: dm ? "#001a3a" : "#e6f1fb", border: dm ? "#2a7fd4" : "#185fa5", label: "🔥 กำลังทำ" },
                  { bg: dm ? "#003a28" : "#e1f5ee", border: dm ? "#1a9070" : "#0f6e56", label: "✅ พร้อมเสิร์ฟ" },
                ].map((s) => (
                  <div key={s.label} className="s" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: s.bg, border: `2px solid ${s.border}`, display: "inline-block" }}></span>
                    <span style={{ color: "var(--text2)" }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ตาราง ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12 }}>
            {tables.map((tbl) => {
              const kt = kitchenTag(tbl, dm);
              const isAvailable = tbl.status === "available";
              const isMyTable = myTable === tbl.id;
              // ถ้ามีโต๊ะแล้ว → กดได้เฉพาะโต๊ะตัวเอง
              const isLocked = myTable && !isMyTable;
              const canClick = !isLocked && isAvailable;
              return (
                <div key={tbl.id}
                  onClick={() => {
                    if (isMyTable) {
                      // กดโต๊ะตัวเองกลับเข้าหน้า order
                      setSelectedTable(tbl.id); setCart([]); setView("order");
                    } else if (isLocked) {
                      notify(`คุณนั่งอยู่โต๊ะ ${myTable} อยู่แล้ว\nกด "สั่งเพิ่ม" เพื่อสั่งเพิ่มที่โต๊ะของคุณ`, "warning");
                    } else if (isAvailable) {
                      claimTable(tbl.id);
                      setSelectedTable(tbl.id); setCart([]); setView("order");
                    } else {
                      notify(`โต๊ะ ${tbl.id} มีคนนั่งอยู่แล้ว`, "warning");
                    }
                  }}
                  style={{
                    borderRadius: 12, padding: 16,
                    border: `2.5px solid ${isMyTable ? (dm ? "#6abf30" : "#3b6d11") : tableColor(tbl, dm)}`,
                    background: isMyTable
                      ? (dm ? "#0a2a00cc" : "#eaf3decc")
                      : isLocked
                        ? (dm ? "#1a0f0855" : "#faf7f288")
                        : isAvailable ? "var(--surface)" : kt.bg + "cc",
                    cursor: (canClick || isMyTable) ? "pointer" : "not-allowed",
                    opacity: isLocked ? 0.45 : 1,
                    transition: "transform .15s, box-shadow .15s",
                    textAlign: "center", position: "relative",
                    filter: isLocked ? "grayscale(0.4)" : "none",
                  }}
                  onMouseEnter={(e) => { if (canClick || isMyTable) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px var(--shadow)"; }}}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = ""; }}
                >
                  {isMyTable && (
                    <div style={{ position: "absolute", top: 7, right: 7, background: dm ? "#4a8a1a" : "#3b6d11", color: "white", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>✓</div>
                  )}
                  {!isMyTable && !isAvailable && !isLocked && (
                    <div style={{ position: "absolute", top: 7, right: 7, background: "var(--accent)", color: dm ? "#0e0905" : "#f5e6d3", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>🔒</div>
                  )}
                  {isLocked && (
                    <div style={{ position: "absolute", top: 7, right: 7, background: "#888", color: "white", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>🚫</div>
                  )}
                  <div style={{ fontSize: 22, marginBottom: 5 }}>{tbl.seats <= 2 ? "🪑" : tbl.seats <= 4 ? "🪑🪑" : "🪑🪑🪑"}</div>
                  <div className="cf" style={{ fontSize: 18, fontWeight: 700, color: isMyTable ? (dm ? "#6abf30" : "#2a5a00") : "var(--text)" }}>โต๊ะ {tbl.id}</div>
                  <div className="s" style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{tbl.seats} ที่นั่ง</div>
                  <div style={{ marginTop: 8 }}>
                    {isMyTable
                      ? <span className="tag" style={{ background: dm ? "#1a4a08" : "#d4edbc", color: dm ? "#6abf30" : "#2a5a00", fontSize: 11 }}>📍 โต๊ะของคุณ</span>
                      : <span className="tag" style={{ background: kt.bg, color: kt.color, fontSize: 11 }}>{kt.label}</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Order View ── */}
      {view === "order" && curTable && (
        <>
          <div className="order-grid" style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px", display: "grid", gridTemplateColumns: "1fr 310px", gap: 20, alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                <button className="btn bo sm" onClick={() => { setView("customer"); setSelectedTable(null); setCart([]); }}>← กลับ</button>
                <div>
                  <h2 className="cf" style={{ fontSize: 21, color: "var(--text)" }}>
                    โต๊ะ {selectedTable}
                    {isAddOn && <span className="tag" style={{ background: dm ? "#001a3a" : "#e6f1fb", color: "#185fa5", fontSize: 12, marginLeft: 10 }}>+ สั่งเพิ่ม</span>}
                  </h2>
                  <div className="s" style={{ fontSize: 12, color: "var(--text2)" }}>{curTable.seats} ที่นั่ง</div>
                </div>
              </div>
              {isAddOn && curTable.orders.length > 0 && (
                <div className="card" style={{ padding: 14, marginBottom: 18, borderLeft: "4px solid #185fa5" }}>
                  <div className="s" style={{ fontSize: 12, color: "#185fa5", fontWeight: 700, marginBottom: 8 }}>📋 ออเดอร์ที่สั่งไปแล้ว</div>
                  {curTable.orders.map((round, ri) => (
                    <div key={ri} style={{ marginBottom: ri < curTable.orders.length - 1 ? 8 : 0, paddingBottom: ri < curTable.orders.length - 1 ? 8 : 0, borderBottom: ri < curTable.orders.length - 1 ? "1px dashed var(--border)" : "none" }}>
                      <div className="s" style={{ fontSize: 11, color: "var(--text2)", marginBottom: 4 }}>รอบที่ {round.seq} · {round.time}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {round.items.map((item, ii) => (
                          <span key={ii} className="tag" style={{ background: "var(--surface2)", color: "var(--accent2)", fontSize: 11 }}>{item.emoji} {item.name} ×{item.qty}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {categories.map((cat) => (
                <div key={cat} style={{ marginBottom: 24 }}>
                  <h3 className="cf" style={{ fontSize: 16, color: "var(--accent2)", marginBottom: 10, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>{CAT[cat] || cat}</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
                    {menu.filter((m) => m.category === cat).map((item) => {
                      const inCart = cart.find((c) => c.id === item.id);
                      return (
                        <div key={item.id} className="card" style={{ padding: 12 }}>
                          {item.image
                            ? <img src={item.image} alt={item.name} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, marginBottom: 6 }} />
                            : <div style={{ fontSize: 24, marginBottom: 4 }}>{item.emoji}</div>
                          }
                          <div className="cf" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{item.name}</div>
                          <div className="s" style={{ fontSize: 12, color: "var(--text2)", marginTop: 2, marginBottom: 8 }}>฿{item.price}</div>
                          {inCart ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <button onClick={() => remFromCart(item.id)} style={{ width: 26, height: 26, border: "1.5px solid var(--accent)", borderRadius: "50%", background: "transparent", cursor: "pointer", fontSize: 16, color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                              <span className="s" style={{ fontWeight: 700, minWidth: 16, textAlign: "center", color: "var(--text)" }}>{inCart.qty}</span>
                              <button onClick={() => addToCart(item)} style={{ width: 26, height: 26, border: "none", borderRadius: "50%", background: "var(--accent)", cursor: "pointer", fontSize: 16, color: dm ? "#0e0905" : "#f5e6d3", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                            </div>
                          ) : (
                            <button className="btn bd sm" onClick={() => addToCart(item)}>เพิ่ม</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop cart */}
            <div className="card desktop-cart" style={{ position: "sticky", top: 70 }}>
              <CartPanel />
            </div>
          </div>

          {/* Mobile cart drawer */}
          <div className={`cart-drawer ${cartOpen ? "" : "hidden"}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="cf" style={{ fontSize: 17, color: "var(--text)" }}>{isAddOn ? "รายการเพิ่ม" : "ตะกร้า"} ({cartCount})</span>
              <button onClick={() => setCartOpen(false)} style={{ background: "none", border: "none", fontSize: 20, color: "var(--text2)", cursor: "pointer" }}>✕</button>
            </div>
            <CartPanel mobile />
          </div>

          {/* Mobile cart FAB */}
          <button
            onClick={() => setCartOpen(o => !o)}
            style={{
              display: "none",
              position: "fixed", bottom: cartOpen ? 270 : 24, right: 20,
              background: "var(--accent)", color: dm ? "#0e0905" : "#f5e6d3",
              border: "none", borderRadius: 28, padding: "13px 20px",
              fontFamily: "Lato,sans-serif", fontWeight: 700, fontSize: 15,
              boxShadow: "0 4px 16px rgba(0,0,0,.3)", cursor: "pointer",
              zIndex: 600, transition: "bottom .3s ease",
            }}
            className="mobile-cart-fab"
          >
            🛒 {cartCount > 0 ? `฿${cartTotal} (${cartCount})` : "ตะกร้า"}
          </button>
          <style>{`@media(max-width:767px){.mobile-cart-fab{display:block!important}}`}</style>
        </>
      )}

      {/* ── Admin View ── */}
      {view === "admin" && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 className="cf" style={{ fontSize: 24, color: "var(--text)" }}>Admin Panel</h2>
              <p className="s" style={{ fontSize: 12, color: "var(--text2)" }}>จัดการโต๊ะ · ครัว · QR Code · เมนู · ยอดขาย</p>
            </div>
            <div className="admin-stats" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {[
                { v: busyCount, l: "ไม่ว่าง", c: "#a32d2d" },
                { v: tables.filter(t => t.kitchenStatus === "waiting").length, l: "รอเตรียม", c: "#ba7517" },
                { v: tables.filter(t => t.kitchenStatus === "cooking").length, l: "กำลังทำ", c: "#185fa5" },
                { v: tables.filter(t => t.kitchenStatus === "ready").length, l: "พร้อมเสิร์ฟ", c: "#0f6e56" },
                { v: `฿${totalRev.toLocaleString()}`, l: "รายได้วันนี้", c: "var(--text)" },
              ].map((s, i) => (
                <div key={i} className="card stat-card" style={{ padding: "8px 12px", textAlign: "center", minWidth: 66 }}>
                  <div className="cf" style={{ fontSize: 16, color: s.c, fontWeight: 700 }}>{s.v}</div>
                  <div className="s" style={{ fontSize: 10, color: "var(--text2)", marginTop: 1 }}>{s.l}</div>
                </div>
              ))}
              <button className="btn bd sm" onClick={() => setShowSummary(true)}>📊 สรุป</button>
              <button className="btn br sm" onClick={() => { setAdminAuthed(false); setView("customer"); }}>🔒 ออก</button>
            </div>
          </div>

          <div style={{ borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
            {["tables","kitchen","qr","menu"].map((tab, i) => (
              <button key={tab} className={`tab-btn ${adminTab === tab ? "on" : ""}`} onClick={() => setAdminTab(tab)}>
                {["🪑 โต๊ะ","🔥 ครัว","📱 QR","📋 เมนู"][i]}
              </button>
            ))}
          </div>

          {/* Tables tab */}
          {adminTab === "tables" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(255px,1fr))", gap: 14 }}>
              {tables.map((tbl) => {
                const kt = kitchenTag(tbl, dm);
                const total = orderTotal(tbl);
                const items = mergeItems(tbl.orders);
                return (
                  <div key={tbl.id} className="card" style={{ padding: 16, borderLeft: `4px solid ${tableColor(tbl, dm)}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
                      <div>
                        <h3 className="cf" style={{ fontSize: 18, color: "var(--text)" }}>โต๊ะ {tbl.id}</h3>
                        <div className="s" style={{ fontSize: 11, color: "var(--text2)" }}>{tbl.seats} ที่นั่ง</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                        <span className="tag" style={{ background: kt.bg, color: kt.color }}>{kt.label}</span>
                        <button className="btn bo sm" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setQrModal(tbl.id)}>📱 QR</button>
                      </div>
                    </div>
                    {tbl.status === "busy" && (
                      <>
                        <div style={{ background: "var(--surface2)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                          <div className="s" style={{ fontSize: 11, color: "var(--text2)", marginBottom: 5 }}>🕐 {tbl.orderedAt} · {tbl.orders.length} รอบ</div>
                          {items.map((item, i) => (
                            <div key={i} className="s" style={{ fontSize: 12, color: "var(--text)", padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                              <span>{item.emoji} {item.name} ×{item.qty}</span>
                              <span style={{ color: "var(--text2)" }}>฿{item.price * item.qty}</span>
                            </div>
                          ))}
                          <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                            <span className="s" style={{ fontWeight: 700, fontSize: 12 }}>รวม</span>
                            <span className="cf" style={{ fontWeight: 700, color: "var(--text)" }}>฿{total}</span>
                          </div>
                        </div>
                        <button className="btn bg" style={{ width: "100%", fontSize: 13 }} onClick={() => openPay(tbl.id)}>💰 ชำระเงิน</button>
                      </>
                    )}
                    {tbl.status === "available" && (
                      <div className="s" style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "8px 0" }}>— ว่าง —</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Kitchen tab */}
          {adminTab === "kitchen" && (
            <div>
              <p className="s" style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>อัปเดตสถานะครัวแบบ real-time</p>
              {tables.filter((t) => t.status === "busy").length === 0 ? (
                <div className="card" style={{ padding: 50, textAlign: "center", color: "var(--text3)" }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                  <div className="s" style={{ fontSize: 14 }}>ไม่มีออเดอร์ที่รอดำเนินการ</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
                  {tables.filter((t) => t.status === "busy").map((tbl) => {
                    const kt = kitchenTag(tbl, dm);
                    return (
                      <div key={tbl.id} className="card" style={{ padding: 16, borderTop: `4px solid ${tableColor(tbl, dm)}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <h3 className="cf" style={{ fontSize: 18, color: "var(--text)" }}>โต๊ะ {tbl.id}</h3>
                          <span className="tag" style={{ background: kt.bg, color: kt.color }}>{kt.label}</span>
                        </div>
                        <div style={{ background: "var(--surface2)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                          {tbl.orders.map((round, ri) => (
                            <div key={ri} style={{ marginBottom: ri < tbl.orders.length - 1 ? 8 : 0, paddingBottom: ri < tbl.orders.length - 1 ? 8 : 0, borderBottom: ri < tbl.orders.length - 1 ? "1px dashed var(--border)" : "none" }}>
                              <div className="s" style={{ fontSize: 11, color: "var(--text2)", marginBottom: 4 }}>รอบที่ {round.seq} · {round.time}</div>
                              {round.items.map((item, ii) => (
                                <div key={ii} className="s" style={{ fontSize: 13, padding: "2px 0", color: "var(--text)" }}>
                                  {item.emoji} {item.name} × {item.qty}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn ba sm" style={{ flex: 1 }} onClick={() => setKitchen(tbl.id, "cooking")}>🔥 กำลังทำ</button>
                          <button className="btn bg sm" style={{ flex: 1, opacity: tbl.kitchenStatus === "cooking" ? 1 : 0.45 }} onClick={() => setKitchen(tbl.id, "ready")}>✅ พร้อมเสิร์ฟ</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* QR tab */}
          {adminTab === "qr" && (
            <div>
              <div style={{ background: dm ? "#001a3a" : "#e6f1fb", border: `1px solid ${dm ? "#0a3060" : "#b8d4f0"}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 10 }}>
                <span style={{ fontSize: 20 }}>💡</span>
                <div className="s" style={{ fontSize: 13, color: "#185fa5", lineHeight: 1.7 }}>
                  <strong>วิธีใช้:</strong> พิมพ์ QR → ติดที่โต๊ะ → ลูกค้าสแกนด้วยมือถือ → เข้าหน้าสั่งอาหารทันที
                </div>
              </div>
              <div className="qr-grid">
                {tables.map((tbl) => {
                  const kt = kitchenTag(tbl, dm);
                  return (
                    <div key={tbl.id} className="qr-card">
                      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="cf" style={{ fontSize: 15, color: "var(--text)", fontWeight: 700 }}>โต๊ะ {tbl.id}</span>
                        <span className="tag" style={{ background: kt.bg, color: kt.color, fontSize: 11 }}>{kt.label}</span>
                      </div>
                      <div style={{ padding: 8, background: dm ? "#0a0604" : "#fdfaf6", borderRadius: 10, border: "1.5px solid var(--border)" }}>
                       {/* <QRCanvas text={`${BASE_URL}?table=${tbl.id}`} size={140} dark={dm} /> */}
                      </div>
                      <div style={{ background: "var(--accent)", color: dm ? "#0e0905" : "#f5e6d3", borderRadius: 8, padding: "7px 0", width: "100%", textAlign: "center" }}>
                        <div className="cf" style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>โต๊ะ {tbl.id}</div>
                        <div className="s" style={{ fontSize: 9, opacity: 0.7, letterSpacing: 2 }}>DARIS CAFE · {tbl.seats} SEATS</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, width: "100%" }}>
                        <button className="btn bd sm" style={{ flex: 1, fontSize: 11 }} onClick={() => setQrModal(tbl.id)}>🔍 ดูใหญ่</button>
                        <button className="btn bo sm" style={{ flex: 1, fontSize: 11 }} onClick={() => goToTable(tbl.id)}>📲 จำลอง</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Menu tab */}
          {adminTab === "menu" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button className="btn bd" onClick={() => { setShowMenuForm(true); setEditingId(null); setMenuForm({ name: "", price: "", category: "coffee", emoji: "☕", image: null }); }}>+ เพิ่มเมนู</button>
              </div>
              {showMenuForm && (
                <div className="card" style={{ padding: 20, marginBottom: 18, borderLeft: "4px solid var(--inp-focus)" }}>
                  <h3 className="cf" style={{ fontSize: 16, color: "var(--text)", marginBottom: 12 }}>{editingId ? "แก้ไขเมนู" : "เพิ่มเมนูใหม่"}</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label className="s" style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>ชื่อเมนู</label>
                      <input className="inp" value={menuForm.name} onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })} placeholder="เช่น Iced Latte" />
                    </div>
                    <div>
                      <label className="s" style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>ราคา (฿)</label>
                      <input className="inp" type="number" value={menuForm.price} onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value })} placeholder="90" />
                    </div>
                    <div>
                      <label className="s" style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>หมวดหมู่</label>
                      <select className="inp" value={menuForm.category} onChange={(e) => setMenuForm({ ...menuForm, category: e.target.value })}>
                        <option value="coffee">Coffee</option>
                        <option value="non-coffee">Non-Coffee</option>
                        <option value="food">Food</option>
                      </select>
                    </div>
                    <div>
                      <label className="s" style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>Emoji</label>
                      <input className="inp" value={menuForm.emoji} onChange={(e) => setMenuForm({ ...menuForm, emoji: e.target.value })} placeholder="☕" maxLength={2} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label className="s" style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 8 }}>รูปภาพ (ไม่บังคับ)</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 72, height: 72, borderRadius: 10, border: "2px dashed var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                        {menuForm.image ? <img src={menuForm.image} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 26 }}>{menuForm.emoji || "🍽️"}</span>}
                      </div>
                      <div>
                        <label style={{ display: "inline-block", padding: "7px 14px", borderRadius: 6, border: "1.5px solid var(--accent)", color: "var(--accent)", cursor: "pointer", fontFamily: "Lato,sans-serif", fontSize: 12, fontWeight: 700, background: "transparent" }}>
                          📷 เลือกรูป
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                            const file = e.target.files[0]; if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => setMenuForm(f => ({ ...f, image: ev.target.result }));
                            reader.readAsDataURL(file);
                          }} />
                        </label>
                        {menuForm.image && <button onClick={() => setMenuForm(f => ({ ...f, image: null }))} className="s" style={{ marginLeft: 8, background: "none", border: "none", color: "#a32d2d", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕ ลบ</button>}
                        <div className="s" style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>JPG, PNG, WEBP · ≤5MB</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn bd" onClick={saveMenu}>บันทึก</button>
                    <button className="btn bo" onClick={() => { setShowMenuForm(false); setEditingId(null); }}>ยกเลิก</button>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {menu.map((item) => (
                  <div key={item.id} className="card" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)" }}>
                      {item.image ? <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22 }}>{item.emoji}</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="cf" style={{ fontSize: 14, color: "var(--text)", fontWeight: 600 }}>{item.name}</div>
                      <span className="tag" style={{ marginTop: 2, background: item.category === "coffee" ? (dm ? "#1a0800" : "#f5e6d3") : item.category === "food" ? (dm ? "#1a0e00" : "#faeeda") : (dm ? "#001a10" : "#e1f5ee"), color: item.category === "coffee" ? (dm ? "#c8824a" : "#5a2e14") : item.category === "food" ? (dm ? "#d4851a" : "#854f0b") : (dm ? "#1ac890" : "#0f6e56") }}>
                        {CAT[item.category] || item.category}
                      </span>
                    </div>
                    <div className="cf" style={{ fontSize: 15, color: "var(--text)", fontWeight: 700, minWidth: 50 }}>฿{item.price}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn bo sm" onClick={() => { setEditingId(item.id); setMenuForm({ name: item.name, price: item.price, category: item.category, emoji: item.emoji, image: item.image || null }); setShowMenuForm(true); }}>แก้ไข</button>
                      <button className="btn br sm" onClick={() => { setMenu((p) => p.filter((m) => m.id !== item.id)); notify("ลบเมนูสำเร็จ", "danger"); }}>ลบ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <footer style={{ textAlign: "center", padding: "24px 20px 36px", color: "var(--text3)", fontFamily: "Lato,sans-serif", fontSize: 11, letterSpacing: 1, marginTop: 36, borderTop: "1px solid var(--border)" }}>
        DARIS CAFE · POS SYSTEM v3.0 · 2024
      </footer>
    </div>
  );
}
