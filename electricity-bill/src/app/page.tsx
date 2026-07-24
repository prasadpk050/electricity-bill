'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { 
  collection, onSnapshot, doc, setDoc, deleteDoc, query 
} from 'firebase/firestore';
import { 
  Zap, Droplet, User, Share2, BarChart2, Edit3, 
  ShieldAlert, FileText, Download, Upload, PlusCircle, 
  Trash2, Printer, TrendingUp, PieChart, Activity, Check, Key, Save, X
} from 'lucide-react';

interface BillData {
  id: string;
  month: string;
  totalBill: number;
  energyCharge: number;
  fixedPool: {
    fixedCharge: number;
    wheelingCharge: number;
    fac: number;
    duty: number;
    adjustments: number;
  };
  readings: {
    mainPrev: number; mainCurr: number;
    motorPrev: number; motorCurr: number;
    son1Prev: number; son1Curr: number;
    son2Prev: number; son2Curr: number;
    son3Prev: number; son3Curr: number;
  };
}

const initialDefaultBill: BillData = {
  id: '1',
  month: "Jul-2026",
  totalBill: 1400,
  energyCharge: 828,
  fixedPool: { fixedCharge: 130, wheelingCharge: 224, fac: 34, duty: 194.56, adjustments: 10.56 },
  readings: { mainPrev: 10519, mainCurr: 10659, motorPrev: 500, motorCurr: 520, son1Prev: 1200, son1Curr: 1240, son2Prev: 1500, son2Curr: 1540, son3Prev: 0, son3Curr: 0 }
};

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const availableYears = ["2025", "2026", "2027", "2028", "2029", "2030"];

// MSEDCL Slab-Based Energy Charge Helper Function
const calculateTotalEnergyCharge = (totalUnits: number): number => {
  if (totalUnits <= 0) return 0;

  let totalCharge = 0;

  // Slab 1: 0 - 100 units @ ₹3.96/unit
  const slab1 = Math.min(totalUnits, 100);
  totalCharge += slab1 * 3.96;

  // Slab 2: 101 - 300 units @ ₹10.80/unit
  if (totalUnits > 100) {
    const slab2 = Math.min(totalUnits - 100, 200);
    totalCharge += slab2 * 10.80;
  }

  // Slab 3: 301 - 500 units @ ₹15.03/unit
  if (totalUnits > 300) {
    const slab3 = Math.min(totalUnits - 300, 200);
    totalCharge += slab3 * 15.03;
  }

  // Slab 4: > 500 units @ ₹17.53/unit
  if (totalUnits > 500) {
    const slab4 = totalUnits - 500;
    totalCharge += slab4 * 17.53;
  }

  return totalCharge;
};

export default function BillDashboard() {
  const [isMounted, setIsMounted] = useState(false);
  const [history, setHistory] = useState<BillData[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string>('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddMonthModalOpen, setIsAddMonthModalOpen] = useState(false);

  // Month addition dropdown selection
  const [selectedMonth, setSelectedMonth] = useState('Sept');
  const [selectedYear, setSelectedYear] = useState('2026');
  
  // Local state to hold edits until the "Save" button is clicked
  const [localBill, setLocalBill] = useState<BillData | null>(null);

  // Custom Names
  const [son1Name, setSon1Name] = useState('SUDHIR');
  const [son2Name, setSon2Name] = useState('PRAVIN');
  const [son3Name, setSon3Name] = useState('ANNA');

  // Password Protection State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [appPassword, setAppPassword] = useState('1234');

  // Change Password Modal State
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passChangeError, setPassChangeError] = useState('');
  const [passChangeSuccess, setPassChangeSuccess] = useState(false);

  // Check saved password and authentication status on load
  useEffect(() => {
    const savedPassword = localStorage.getItem('bill_app_password');
    if (savedPassword) {
      setAppPassword(savedPassword);
    }

    const savedAuth = localStorage.getItem('bill_app_authenticated');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPassword === appPassword) {
      setIsAuthenticated(true);
      localStorage.setItem('bill_app_authenticated', 'true');
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPassChangeError('');
    setPassChangeSuccess(false);

    if (!newPass || newPass.trim().length === 0) {
      setPassChangeError('कृपया नवीन पासवर्ड टाका.');
      return;
    }

    if (newPass !== confirmPass) {
      setPassChangeError('पासवर्ड जुळत नाही (Passwords do not match).');
      return;
    }

    localStorage.setItem('bill_app_password', newPass);
    setAppPassword(newPass);
    setPassChangeSuccess(true);
    setNewPass('');
    setConfirmPass('');

    setTimeout(() => {
      setIsChangePassModalOpen(false);
      setPassChangeSuccess(false);
    }, 1500);
  };

  // Real-time Cloud Sync with Firestore
  useEffect(() => {
    setIsMounted(true);
    const q = query(collection(db, 'msedcl_bills'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bills: BillData[] = snapshot.docs.map(doc => doc.data() as BillData);
      
      if (bills.length === 0) {
        setDoc(doc(db, 'msedcl_bills', initialDefaultBill.id), initialDefaultBill);
      } else {
        // Sort strictly by numeric IDs (timestamps) so newest months remain on top
        bills.sort((a, b) => {
          const idA = Number(a.id) || 0;
          const idB = Number(b.id) || 0;
          return idB - idA;
        });

        setHistory(bills);
        
        // Preserve active month selection across updates
        setSelectedBillId(prev => {
          if (prev && bills.some(b => b.id === prev)) {
            return prev;
          }
          return bills[0].id;
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Update local bill buffer whenever a new month is selected from the dropdown
  useEffect(() => {
    const found = history.find(b => b.id === selectedBillId) || history[0];
    if (found) {
      setLocalBill(JSON.parse(JSON.stringify(found)));
    }
  }, [selectedBillId, history]);

  // Loading Screen
  if (!isMounted || history.length === 0 || !localBill) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <Zap className="w-10 h-10 text-amber-400 animate-bounce mx-auto" />
          <p className="text-amber-400 text-xl font-bold tracking-wide">क्लाउड डाटा कनेक्ट होत आहे...</p>
        </div>
      </div>
    );
  }

  // Password Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-amber-500 selection:text-slate-950">
        <form onSubmit={handleLogin} className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-amber-400">
              <Zap className="w-6 h-6 fill-amber-400" />
            </div>
            <h2 className="text-xl font-extrabold text-white">पासवर्ड टाका (Login)</h2>
            <p className="text-xs text-slate-400">वीज बिल डॅशबोर्ड उघडण्यासाठी पासवर्ड आवश्यक आहे.</p>
          </div>

          <div className="space-y-2">
            <input 
              type="password" 
              placeholder="Enter Password" 
              value={inputPassword}
              onChange={(e) => { setInputPassword(e.target.value); setPasswordError(false); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-center text-amber-400 font-bold text-lg outline-none focus:border-amber-500 transition-colors"
              autoFocus
            />
            {passwordError && (
              <p className="text-xs text-rose-400 text-center font-semibold">चुकीचा पासवर्ड! पुन्हा प्रयत्न करा.</p>
            )}
          </div>

          <button 
            type="submit" 
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/10"
          >
            Unlock Dashboard
          </button>
        </form>
      </div>
    );
  }

  // Explicit Save Action to Cloud
  const handleManualSave = async () => {
    if (!localBill) return;
    try {
      await setDoc(doc(db, 'msedcl_bills', localBill.id), localBill);
      alert("माहिती क्लाउडवर यशस्वीरित्या सेव्ह झाली आहे! (Saved to Firestore)");
      setIsEditModalOpen(false);
    } catch (error) {
      alert("सेव्ह करताना अडचण आली. Error: " + error);
    }
  };

  // Cancel edits and revert local bill state to saved database state
  const handleCancelEdit = () => {
    const original = history.find(b => b.id === localBill.id);
    if (original) {
      setLocalBill(JSON.parse(JSON.stringify(original)));
    }
    setIsEditModalOpen(false);
  };

  // Local state update
  const updateActiveField = (path: string[], value: number | string) => {
    setLocalBill(prev => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev));
      if (path.length === 1) copy[path[0]] = value;
      if (path.length === 2) copy[path[0]][path[1]] = value;
      return copy;
    });
  };

  // Unit Calculations
  const mainUnits = Math.max(0, localBill.readings.mainCurr - localBill.readings.mainPrev);
  const motorUnits = Math.max(0, localBill.readings.motorCurr - localBill.readings.motorPrev);
  const son1Units = Math.max(0, localBill.readings.son1Curr - localBill.readings.son1Prev);
  const son2Units = Math.max(0, localBill.readings.son2Curr - localBill.readings.son2Prev);
  const son3Units = Math.max(0, localBill.readings.son3Curr - localBill.readings.son3Prev);

  const parentsUnits = Math.max(0, mainUnits - (motorUnits + son1Units + son2Units + son3Units));

  // 1. Calculate Total Energy Charge dynamically from total main units (MSEDCL Slabs)
  const calculatedEnergyCharge = calculateTotalEnergyCharge(mainUnits);

  // 2. Derive Effective Rate per Unit
  const energyRate = mainUnits > 0 ? calculatedEnergyCharge / mainUnits : 0;

  // Fixed Charges Calculation
  const totalBundledFixed = Object.values(localBill.fixedPool).reduce((a, b) => a + b, 0);
  const fixedSharePerSon = totalBundledFixed / 3;

  // Shared Costs Calculations using Effective Energy Rate
  const totalWaterCost = motorUnits * energyRate;
  const waterSharePerSon = totalWaterCost / 3;

  const totalParentsCost = parentsUnits * energyRate;
  const parentsSharePerSon = totalParentsCost / 3;

  const son1Direct = son1Units * energyRate;
  const son2Direct = son2Units * energyRate;
  const son3Direct = son3Units * energyRate;

  const son1Total = fixedSharePerSon + waterSharePerSon + parentsSharePerSon + son1Direct;
  const son2Total = fixedSharePerSon + waterSharePerSon + parentsSharePerSon + son2Direct;
  const son3Total = fixedSharePerSon + waterSharePerSon + parentsSharePerSon + son3Direct;

  const maxCost = Math.max(son1Total, son2Total, son3Total, 1);
  const maxUnits = Math.max(son1Units, son2Units, son3Units, motorUnits, parentsUnits, 1);
  const maxHistoricalUnits = Math.max(...history.map(b => Math.max(0, b.readings.mainCurr - b.readings.mainPrev)), 1);

  // Add New Month Entry via Dropdown Selection
  const handleConfirmAddMonth = async () => {
    if (!localBill) return;

    // 1. First save current active month edits to cloud so current readings carry over accurately
    try {
      await setDoc(doc(db, 'msedcl_bills', localBill.id), localBill);
    } catch (err) {
      console.error("Auto-save error before adding month:", err);
    }

    const monthName = `${selectedMonth}-${selectedYear}`;
    const newId = Date.now().toString();

    const newBill: BillData = {
      id: newId,
      month: monthName,
      totalBill: localBill.totalBill,
      energyCharge: localBill.energyCharge,
      fixedPool: { ...localBill.fixedPool },
      readings: {
        mainPrev: localBill.readings.mainCurr, mainCurr: localBill.readings.mainCurr,
        motorPrev: localBill.readings.motorCurr, motorCurr: localBill.readings.motorCurr,
        son1Prev: localBill.readings.son1Curr, son1Curr: localBill.readings.son1Curr,
        son2Prev: localBill.readings.son2Curr, son2Curr: localBill.readings.son2Curr,
        son3Prev: localBill.readings.son3Curr, son3Curr: localBill.readings.son3Curr,
      }
    };

    try {
      await setDoc(doc(db, 'msedcl_bills', newId), newBill);
      setSelectedBillId(newId);
      setIsAddMonthModalOpen(false);
      alert(`${monthName} जोडला गेला आहे! मागील रीडींग्स कॅरी फॉरवर्ड झाल्या आहेत.`);
    } catch (error) {
      alert("महिना जोडताना अडचण आली: " + error);
    }
  };

  const handleDeleteMonth = async (id: string) => {
    if (history.length <= 1) {
      alert("At least one bill record must remain.");
      return;
    }
    if (confirm("Are you sure you want to delete this bill entry?")) {
      await deleteDoc(doc(db, 'msedcl_bills', id));
      const remaining = history.filter(b => b.id !== id);
      setSelectedBillId(remaining[0].id);
    }
  };

  // CSV Export & Import Handlers
  const handleExportCSV = () => {
    let csv = "ID,Month,TotalBill,EnergyCharge,FixedCharge,WheelingCharge,FAC,Duty,Adjustments,MainPrev,MainCurr,MotorPrev,MotorCurr,Son1Prev,Son1Curr,Son2Prev,Son2Curr,Son3Prev,Son3Curr\n";
    history.forEach(b => {
      csv += `${b.id},${b.month},${b.totalBill},${b.energyCharge},${b.fixedPool.fixedCharge},${b.fixedPool.wheelingCharge},${b.fixedPool.fac},${b.fixedPool.duty},${b.fixedPool.adjustments},${b.readings.mainPrev},${b.readings.mainCurr},${b.readings.motorPrev},${b.readings.motorCurr},${b.readings.son1Prev},${b.readings.son1Curr},${b.readings.son2Prev},${b.readings.son2Curr},${b.readings.son3Prev},${b.readings.son3Curr}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MSEDCL_Bill_Data_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.trim().split('\n').slice(1);
        for (const line of lines) {
          const v = line.split(',');
          if (!v[0]) continue;
          const importedBill: BillData = {
            id: v[0] || Date.now().toString(),
            month: v[1],
            totalBill: parseFloat(v[2]) || 0,
            energyCharge: parseFloat(v[3]) || 0,
            fixedPool: {
              fixedCharge: parseFloat(v[4]) || 0,
              wheelingCharge: parseFloat(v[5]) || 0,
              fac: parseFloat(v[6]) || 0,
              duty: parseFloat(v[7]) || 0,
              adjustments: parseFloat(v[8]) || 0,
            },
            readings: {
              mainPrev: parseFloat(v[9]) || 0, mainCurr: parseFloat(v[10]) || 0,
              motorPrev: parseFloat(v[11]) || 0, motorCurr: parseFloat(v[12]) || 0,
              son1Prev: parseFloat(v[13]) || 0, son1Curr: parseFloat(v[14]) || 0,
              son2Prev: parseFloat(v[15]) || 0, son2Curr: parseFloat(v[16]) || 0,
              son3Prev: parseFloat(v[17]) || 0, son3Curr: parseFloat(v[18]) || 0,
            }
          };
          await setDoc(doc(db, 'msedcl_bills', importedBill.id), importedBill);
        }
        alert("CSV data synced to cloud successfully!");
      } catch (err) {
        alert("Failed to parse CSV file. Please check format.");
      }
    };
    reader.readAsText(file);
  };

  // PDF Auto-Fetch Handler
  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => item.str);
        fullText += strings.join(' ') + ' ';
      }

      const totalMatch = fullText.match(/Net Payable|Total Amount|रक्कम\s*[:\=]?\s*([0-9\.]+)/i);
      const unitsMatch = fullText.match(/Units Consumed|Total Units|वापरलेले युनिट्स\s*[:\=]?\s*([0-9\.]+)/i);

      if (totalMatch && totalMatch[1]) {
        updateActiveField(['totalBill'], parseFloat(totalMatch[1]));
      }
      if (unitsMatch && unitsMatch[1]) {
        const extractedUnits = parseFloat(unitsMatch[1]);
        updateActiveField(['readings', 'mainCurr'], localBill.readings.mainPrev + extractedUnits);
      }

      alert("PDF parse completed! Click 'Save' to apply changes.");
    } catch (err) {
      alert("Could not extract auto-data from PDF. You can enter values manually.");
    }
  };

  const shareWhatsApp = (name: string, amount: number, units: number) => {
    const text = `*⚡ महावितरण वीज बिल तपशील (${localBill.month}) - ${name}*\n\n` +
      `• स्थिर आकार भाग (Fixed Share): ₹${fixedSharePerSon.toFixed(2)}\n` +
      `• पाण्याच्या मोटार भाग (Water Share): ₹${waterSharePerSon.toFixed(2)}\n` +
      `• पालक वापर भाग (Parents Share): ₹${parentsSharePerSon.toFixed(2)}\n` +
      `• स्वतःचा वापर (Direct Usage ${units} Units): ₹${(units * energyRate).toFixed(2)}\n\n` +
      `*💰 एकूण भरणा रक्कम (Total Payable): ₹${amount.toFixed(2)}*`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          body {
            background-color: #f8fafc !important;
            color: #0f172a !important;
            font-size: 13px !important;
          }
          .print-hide {
            display: none !important;
          }
          .print-page-break {
            page-break-before: always !important;
            break-before: page !important;
          }
          .print-card {
            background-color: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
          }
          .print-header-text {
            color: #0f172a !important;
            font-weight: 800 !important;
          }
          .print-sub-text {
            color: #334155 !important;
            font-weight: 600 !important;
          }
        }
      `}</style>

      <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-amber-500 selection:text-slate-950">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Top Controls */}
          <div className="print-hide flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedBillId}
                onChange={(e) => setSelectedBillId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-amber-400 font-bold focus:outline-none"
              >
                {history.map(b => (
                  <option key={b.id} value={b.id}>{b.month}</option>
                ))}
              </select>

              <button onClick={handleManualSave} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-sm transition-all shadow-lg shadow-emerald-600/20">
                <Save className="w-4 h-4" /> सेव्ह करा (Save)
              </button>

              <button onClick={() => setIsAddMonthModalOpen(true)} className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/10">
                <PlusCircle className="w-4 h-4" /> महिना जोडा
              </button>

              <button onClick={() => setIsEditModalOpen(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 py-2 rounded-xl text-sm shadow-lg shadow-blue-600/20">
                <Edit3 className="w-4 h-4" /> दुरुस्ती (Edit Entry)
              </button>

              <button onClick={() => handleDeleteMonth(localBill.id)} className="p-2 bg-rose-950/40 text-rose-400 border border-rose-900/50 rounded-xl hover:bg-rose-900/40">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-indigo-600/20">
              <Printer className="w-4 h-4" /> Print PDF Report
            </button>
          </div>

          {/* Header */}
          <div className="relative overflow-hidden bg-slate-900 print-card p-6 rounded-2xl border border-slate-800">
            <div className="flex flex-row justify-between items-center gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold mb-1.5">
                  <Zap className="w-3.5 h-3.5 fill-amber-400" /> Live Real-Time Collaborative
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white print-header-text tracking-tight">
                  महावितरण वीज बिल वाटप डॅशबोर्ड
                </h1>
                <p className="text-slate-400 print-sub-text text-sm mt-0.5">पारदर्शक, अचूक आणि स्वयंचलित कुटुंब वीज बिल व्यवस्थापन</p>
              </div>
              <div className="bg-slate-950 print-card px-6 py-3 rounded-xl border border-slate-800 text-center">
                <span className="text-xs text-slate-400 print-sub-text uppercase tracking-wider block font-semibold">बिलाचा महिना</span>
                <span className="text-2xl font-black text-amber-400 print:text-indigo-700">{localBill.month}</span>
              </div>
            </div>
          </div>

          {/* Name Customization, Password Change & Data Tools */}
          <div className="print-hide grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 flex items-center gap-2 font-semibold">
                  <Edit3 className="w-4 h-4 text-amber-400" /> नावे बदला (Customize Display Names):
                </p>
                <button 
                  onClick={() => setIsChangePassModalOpen(true)} 
                  className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg text-xs text-amber-400 font-semibold transition-colors"
                >
                  <Key className="w-3.5 h-3.5" /> पासवर्ड बदला
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input type="text" value={son1Name} onChange={(e) => setSon1Name(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none" />
                <input type="text" value={son2Name} onChange={(e) => setSon2Name(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none" />
                <input type="text" value={son3Name} onChange={(e) => setSon3Name(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none" />
              </div>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400 font-semibold mb-1">डाटा बॅकअप & PDF अपलोड</p>
                <div className="flex items-center gap-2">
                  <button onClick={handleExportCSV} className="flex items-center gap-1 bg-slate-950 border border-slate-800 hover:bg-slate-800 px-3 py-1.5 rounded-xl text-xs text-emerald-400 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                  <label className="flex items-center gap-1 bg-slate-950 border border-slate-800 hover:bg-slate-800 px-3 py-1.5 rounded-xl text-xs text-blue-400 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Import CSV
                    <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                  </label>
                </div>
              </div>

              <label className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 px-4 py-2 rounded-xl text-xs text-amber-400 font-semibold cursor-pointer transition-colors">
                <FileText className="w-4 h-4" /> PDF ऑटो-फेच
                <input type="file" accept="application/pdf" onChange={handlePDFUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-900 print-card p-4 rounded-2xl border border-slate-800">
              <p className="text-slate-400 print-sub-text text-xs font-bold">एकूण बिल (Total Bill)</p>
              <p className="text-2xl font-black text-emerald-400 print:text-emerald-700 mt-1">₹{localBill.totalBill}</p>
            </div>

            <div className="bg-slate-900 print-card p-4 rounded-2xl border border-slate-800">
              <p className="text-slate-400 print-sub-text text-xs font-bold">ऊर्जा आकार (Calculated Energy Charge)</p>
              <p className="text-2xl font-black text-blue-400 print:text-blue-700 mt-1">₹{calculatedEnergyCharge.toFixed(2)}</p>
            </div>

            <div className="bg-slate-900 print-card p-4 rounded-2xl border border-slate-800">
              <p className="text-slate-400 print-sub-text text-xs font-bold">मुख्य वापर (Main Units)</p>
              <p className="text-2xl font-black text-purple-400 print:text-purple-700 mt-1">{mainUnits} <span className="text-xs font-bold text-slate-400">U</span></p>
            </div>

            <div className="bg-slate-900 print-card p-4 rounded-2xl border border-slate-800">
              <p className="text-slate-400 print-sub-text text-xs font-bold">प्रभावी दर (Avg Rate/Unit)</p>
              <p className="text-2xl font-black text-amber-400 print:text-amber-700 mt-1">₹{energyRate.toFixed(2)}</p>
            </div>
          </div>

          {/* SECTION 1: Fixed Charges Breakup */}
          <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-extrabold text-amber-400 print-header-text flex items-center gap-2">
              <ShieldAlert className="text-purple-400 w-4 h-4 print-hide" /> स्थिर आकारांचा तपशील (Fixed Charges Breakup)
            </h3>
            <div className="grid grid-cols-5 gap-3 text-xs text-slate-300">
              <div className="bg-slate-950 print-card p-2.5 rounded-xl border border-slate-800">
                <p className="text-slate-400 print-sub-text font-semibold">स्थिर आकार</p>
                <input type="number" value={localBill.fixedPool.fixedCharge} onChange={(e) => updateActiveField(['fixedPool', 'fixedCharge'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-1.5 py-0.5 text-white print-header-text font-bold mt-1 outline-none" />
              </div>
              <div className="bg-slate-950 print-card p-2.5 rounded-xl border border-slate-800">
                <p className="text-slate-400 print-sub-text font-semibold">वहन आकार</p>
                <input type="number" value={localBill.fixedPool.wheelingCharge} onChange={(e) => updateActiveField(['fixedPool', 'wheelingCharge'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-1.5 py-0.5 text-white print-header-text font-bold mt-1 outline-none" />
              </div>
              <div className="bg-slate-950 print-card p-2.5 rounded-xl border border-slate-800">
                <p className="text-slate-400 print-sub-text font-semibold">इंधन आकार</p>
                <input type="number" value={localBill.fixedPool.fac} onChange={(e) => updateActiveField(['fixedPool', 'fac'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-1.5 py-0.5 text-white print-header-text font-bold mt-1 outline-none" />
              </div>
              <div className="bg-slate-950 print-card p-2.5 rounded-xl border border-slate-800">
                <p className="text-slate-400 print-sub-text font-semibold">वीज शुल्क</p>
                <input type="number" value={localBill.fixedPool.duty} onChange={(e) => updateActiveField(['fixedPool', 'duty'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-1.5 py-0.5 text-white print-header-text font-bold mt-1 outline-none" />
              </div>
              <div className="bg-slate-950 print-card p-2.5 rounded-xl border border-slate-800">
                <p className="text-slate-400 print-sub-text font-semibold">समायोजन</p>
                <input type="number" value={localBill.fixedPool.adjustments} onChange={(e) => updateActiveField(['fixedPool', 'adjustments'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-1.5 py-0.5 text-white print-header-text font-bold mt-1 outline-none" />
              </div>
            </div>
            <p className="text-xs text-slate-400 print-sub-text pt-1">
              एकूण स्थिर पूल: <strong className="text-amber-400 print:text-amber-700">₹{totalBundledFixed.toFixed(2)}</strong> (प्रत्येक मुलाचा १/३ हिस्सा: <strong className="text-emerald-400 print:text-emerald-700">₹{fixedSharePerSon.toFixed(2)}</strong>)
            </p>
          </div>

          {/* SECTION 2: Meter Readings */}
          <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-extrabold text-amber-400 print-header-text flex items-center gap-2">
              <Activity className="w-4 h-4 print-hide" /> मीटर रीडिंग नोंदवा ({localBill.month})
            </h3>
            <div className="grid grid-cols-5 gap-3 text-xs">

              <div className="bg-slate-950 print-card p-3 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-amber-400 print:text-amber-700 text-xs">मुख्य मीटर (Main)</p>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">मागणी (Prev)</label>
                  <input type="number" value={localBill.readings.mainPrev} onChange={(e) => updateActiveField(['readings', 'mainPrev'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">चालू (Curr)</label>
                  <input type="number" value={localBill.readings.mainCurr} onChange={(e) => updateActiveField(['readings', 'mainCurr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
              </div>

              <div className="bg-slate-950 print-card p-3 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-blue-400 print:text-blue-700 text-xs">मोटार (Motor)</p>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">मागणी (Prev)</label>
                  <input type="number" value={localBill.readings.motorPrev} onChange={(e) => updateActiveField(['readings', 'motorPrev'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">चालू (Curr)</label>
                  <input type="number" value={localBill.readings.motorCurr} onChange={(e) => updateActiveField(['readings', 'motorCurr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
              </div>

              <div className="bg-slate-950 print-card p-3 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-slate-200 print-header-text text-xs">{son1Name}</p>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">मागणी (Prev)</label>
                  <input type="number" value={localBill.readings.son1Prev} onChange={(e) => updateActiveField(['readings', 'son1Prev'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">चालू (Curr)</label>
                  <input type="number" value={localBill.readings.son1Curr} onChange={(e) => updateActiveField(['readings', 'son1Curr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
              </div>

              <div className="bg-slate-950 print-card p-3 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-slate-200 print-header-text text-xs">{son2Name}</p>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">मागणी (Prev)</label>
                  <input type="number" value={localBill.readings.son2Prev} onChange={(e) => updateActiveField(['readings', 'son2Prev'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">चालू (Curr)</label>
                  <input type="number" value={localBill.readings.son2Curr} onChange={(e) => updateActiveField(['readings', 'son2Curr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
              </div>

              <div className="bg-slate-950 print-card p-3 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-slate-200 print-header-text text-xs">{son3Name}</p>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">मागणी (Prev)</label>
                  <input type="number" value={localBill.readings.son3Prev} onChange={(e) => updateActiveField(['readings', 'son3Prev'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
                <div>
                  <label className="text-slate-400 print-sub-text block text-[11px]">चालू (Curr)</label>
                  <input type="number" value={localBill.readings.son3Curr} onChange={(e) => updateActiveField(['readings', 'son3Curr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-900 print:bg-white border border-slate-800 print:border-slate-300 rounded px-2 py-1 text-slate-200 print-header-text font-bold outline-none" />
                </div>
              </div>

            </div>
          </div>

          {/* SECTION 3: Member Payables */}
          <div className="space-y-3">
            <div className="inline-block bg-amber-500/10 print:bg-amber-100 border border-amber-500/30 print:border-amber-300 px-3 py-1 rounded-lg">
              <h2 className="text-lg font-extrabold text-amber-400 print:text-amber-800 flex items-center gap-2">
                <User className="text-amber-400 print:text-amber-800 w-5 h-5 print-hide" /> प्रत्येक सदस्याची देय रक्कम (Individual Payable)
              </h2>
            </div>

            <div className="grid grid-cols-4 gap-4">

              {/* Parents */}
              <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <p className="font-extrabold text-base text-slate-200 print-header-text">आई - बाबा (Parents)</p>
                  <p className="text-xs text-emerald-400 print:text-emerald-700 font-bold mt-0.5">१००% सवलत</p>
                  <div className="mt-3 text-xs text-slate-400 print-sub-text space-y-1">
                    <p>वापर: <strong className="text-slate-200 print-header-text">{parentsUnits} Units</strong></p>
                    <p>खर्च: <strong className="text-slate-200 print-header-text">₹{totalParentsCost.toFixed(2)}</strong></p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 print:border-slate-300">
                  <p className="text-xs text-slate-400 print-sub-text font-bold">Net Payable</p>
                  <p className="text-2xl font-black text-emerald-400 print:text-emerald-700">₹0.00</p>
                </div>
              </div>

              {/* Son 1 */}
              <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-base text-slate-100 print-header-text">{son1Name}</span>
                    <button onClick={() => shareWhatsApp(son1Name, son1Total, son1Units)} className="print-hide text-emerald-400 p-1.5 rounded-lg bg-emerald-500/10">
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs space-y-1 text-slate-400 print-sub-text">
                    <p className="flex justify-between"><span>• स्थिर आकार:</span> <strong className="text-slate-200 print-header-text">₹{fixedSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• मोटार भाग:</span> <strong className="text-slate-200 print-header-text">₹{waterSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• पालक भाग:</span> <strong className="text-slate-200 print-header-text">₹{parentsSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• स्वतः ({son1Units} U):</span> <strong className="text-slate-200 print-header-text">₹{son1Direct.toFixed(2)}</strong></p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 print:border-slate-300">
                  <p className="text-xs text-slate-400 print-sub-text font-bold">Net Payable</p>
                  <p className="text-2xl font-black text-amber-400 print:text-amber-700">₹{son1Total.toFixed(2)}</p>
                </div>
              </div>

              {/* Son 2 */}
              <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-base text-slate-100 print-header-text">{son2Name}</span>
                    <button onClick={() => shareWhatsApp(son2Name, son2Total, son2Units)} className="print-hide text-emerald-400 p-1.5 rounded-lg bg-emerald-500/10">
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs space-y-1 text-slate-400 print-sub-text">
                    <p className="flex justify-between"><span>• स्थिर आकार:</span> <strong className="text-slate-200 print-header-text">₹{fixedSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• मोटार भाग:</span> <strong className="text-slate-200 print-header-text">₹{waterSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• पालक भाग:</span> <strong className="text-slate-200 print-header-text">₹{parentsSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• स्वतः ({son2Units} U):</span> <strong className="text-slate-200 print-header-text">₹{son2Direct.toFixed(2)}</strong></p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 print:border-slate-300">
                  <p className="text-xs text-slate-400 print-sub-text font-bold">Net Payable</p>
                  <p className="text-2xl font-black text-amber-400 print:text-amber-700">₹{son2Total.toFixed(2)}</p>
                </div>
              </div>

              {/* Son 3 */}
              <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-base text-slate-100 print-header-text">{son3Name}</span>
                    <button onClick={() => shareWhatsApp(son3Name, son3Total, son3Units)} className="print-hide text-emerald-400 p-1.5 rounded-lg bg-emerald-500/10">
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs space-y-1 text-slate-400 print-sub-text">
                    <p className="flex justify-between"><span>• स्थिर आकार:</span> <strong className="text-slate-200 print-header-text">₹{fixedSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• मोटार भाग:</span> <strong className="text-slate-200 print-header-text">₹{waterSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• पालक भाग:</span> <strong className="text-slate-200 print-header-text">₹{parentsSharePerSon.toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>• स्वतः ({son3Units} U):</span> <strong className="text-slate-200 print-header-text">₹{son3Direct.toFixed(2)}</strong></p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 print:border-slate-300">
                  <p className="text-xs text-slate-400 print-sub-text font-bold">Net Payable</p>
                  <p className="text-2xl font-black text-amber-400 print:text-amber-700">₹{son3Total.toFixed(2)}</p>
                </div>
              </div>

            </div>
          </div>

          {/* ================= PAGE 2 ================= */}

          <div className="print-page-break grid grid-cols-2 gap-4">

            {/* Chart 1: Financial Split */}
            <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-100 print-header-text flex items-center gap-2">
                <PieChart className="text-amber-400 w-4 h-4 print-hide" /> १. बिल आकार आलेख (Bill Split)
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-300 print-header-text mb-1 font-bold">
                    <span>{son1Name}</span>
                    <span className="font-black text-amber-400 print:text-amber-700">₹{son1Total.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-slate-950 print:bg-slate-200 rounded-full h-3 overflow-hidden border border-slate-800 print:border-slate-300">
                    <div className="bg-amber-400 print:bg-amber-500 h-3 rounded-full" style={{ width: `${Math.max(8, (son1Total / maxCost) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 print-header-text mb-1 font-bold">
                    <span>{son2Name}</span>
                    <span className="font-black text-amber-400 print:text-amber-700">₹{son2Total.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-slate-950 print:bg-slate-200 rounded-full h-3 overflow-hidden border border-slate-800 print:border-slate-300">
                    <div className="bg-amber-400 print:bg-amber-500 h-3 rounded-full" style={{ width: `${Math.max(8, (son2Total / maxCost) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 print-header-text mb-1 font-bold">
                    <span>{son3Name}</span>
                    <span className="font-black text-amber-400 print:text-amber-700">₹{son3Total.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-slate-950 print:bg-slate-200 rounded-full h-3 overflow-hidden border border-slate-800 print:border-slate-300">
                    <div className="bg-amber-400 print:bg-amber-500 h-3 rounded-full" style={{ width: `${Math.max(8, (son3Total / maxCost) * 100)}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart 2: Unit Usage */}
            <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-100 print-header-text flex items-center gap-2">
                <BarChart2 className="text-blue-400 w-4 h-4 print-hide" /> २. युनिट्स वापर आलेख (Units)
              </h3>
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between text-xs text-slate-300 print-header-text mb-1 font-bold">
                    <span>{son1Name}</span>
                    <span className="font-black text-blue-400 print:text-blue-700">{son1Units} U</span>
                  </div>
                  <div className="w-full bg-slate-950 print:bg-slate-200 rounded-full h-2.5 overflow-hidden border border-slate-800 print:border-slate-300">
                    <div className="bg-blue-500 print:bg-blue-600 h-2.5 rounded-full" style={{ width: `${Math.max(8, (son1Units / maxUnits) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 print-header-text mb-1 font-bold">
                    <span>{son2Name}</span>
                    <span className="font-black text-blue-400 print:text-blue-700">{son2Units} U</span>
                  </div>
                  <div className="w-full bg-slate-950 print:bg-slate-200 rounded-full h-2.5 overflow-hidden border border-slate-800 print:border-slate-300">
                    <div className="bg-blue-500 print:bg-blue-600 h-2.5 rounded-full" style={{ width: `${Math.max(8, (son2Units / maxUnits) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 print-header-text mb-1 font-bold">
                    <span>{son3Name}</span>
                    <span className="font-black text-blue-400 print:text-blue-700">{son3Units} U</span>
                  </div>
                  <div className="w-full bg-slate-950 print:bg-slate-200 rounded-full h-2.5 overflow-hidden border border-slate-800 print:border-slate-300">
                    <div className="bg-blue-500 print:bg-blue-600 h-2.5 rounded-full" style={{ width: `${Math.max(8, (son3Units / maxUnits) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 print-header-text mb-1 font-bold">
                    <span>पालक वापर</span>
                    <span className="font-black text-emerald-400 print:text-emerald-700">{parentsUnits} U</span>
                  </div>
                  <div className="w-full bg-slate-950 print:bg-slate-200 rounded-full h-2.5 overflow-hidden border border-slate-800 print:border-slate-300">
                    <div className="bg-emerald-500 print:bg-emerald-600 h-2.5 rounded-full" style={{ width: `${Math.max(8, (parentsUnits / maxUnits) * 100)}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Vertical Trend Bar Graph */}
          <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-100 print-header-text flex items-center gap-2">
              <TrendingUp className="text-purple-400 w-4 h-4 print-hide" /> ३. मासिक वापर ट्रेंड (Month-over-Month Trend)
            </h3>
            <div className="flex items-end justify-around gap-4 h-44 pt-6 pb-2 border-b border-slate-800 print:border-slate-300">
              {history.slice().reverse().map((b) => {
                const u = Math.max(0, b.readings.mainCurr - b.readings.mainPrev);
                const heightPct = Math.max(20, (u / maxHistoricalUnits) * 100);
                const isSelected = b.id === localBill.id;

                return (
                  <div key={b.id} className="flex-1 max-w-[80px] flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-xs font-black text-purple-300 print:text-purple-700">{u}U</span>
                    <div className="w-full bg-slate-950 print:bg-slate-200 rounded-t-lg h-full flex items-end p-1 border border-slate-800 print:border-slate-300">
                      <div 
                        className={`w-full rounded-t-md ${isSelected ? 'bg-indigo-500 print:bg-indigo-600' : 'bg-slate-700 print:bg-slate-400'}`} 
                        style={{ height: `${heightPct}%` }}
                      ></div>
                    </div>
                    <span className={`text-xs font-bold ${isSelected ? 'text-amber-400 print:text-amber-700' : 'text-slate-400 print-sub-text'}`}>{b.month}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shared Pools Breakdown */}
          <div className="bg-slate-900 print-card p-5 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-100 print-header-text flex items-center gap-2">
              <Droplet className="text-blue-400 w-4 h-4 print-hide" /> सामायिक वापर (Shared Pools Breakdown)
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="bg-slate-950 print-card p-4 rounded-xl border border-slate-800">
                <p className="font-bold text-blue-400 print:text-blue-700 text-sm">🚰 पाण्याच्या मोटार सबमीटर</p>
                <p className="mt-1 text-xs print-header-text">एकूण वापर: <strong>{motorUnits} Units</strong> (₹{totalWaterCost.toFixed(2)})</p>
                <p className="text-xs text-slate-400 print-sub-text mt-1.5">१/३ भाग: <strong className="text-emerald-400 print:text-emerald-700">₹{waterSharePerSon.toFixed(2)} / व्यक्ती</strong></p>
              </div>
              <div className="bg-slate-950 print-card p-4 rounded-xl border border-slate-800">
                <p className="font-bold text-amber-400 print:text-amber-700 text-sm">👴 पालकांचा वैयक्तिक वापर</p>
                <p className="mt-1 text-xs print-header-text">एकूण वापर: <strong>{parentsUnits} Units</strong> (₹{totalParentsCost.toFixed(2)})</p>
                <p className="text-xs text-slate-400 print-sub-text mt-1.5">१/३ भाग: <strong className="text-emerald-400 print:text-emerald-700">₹{parentsSharePerSon.toFixed(2)} / व्यक्ती</strong></p>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* ADD NEW MONTH MODAL (DROPDOWN SELECTION) */}
      {isAddMonthModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                <PlusCircle className="w-5 h-5" /> नवीन महिना जोडा
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAddMonthModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">महिना निवडा (Select Month)</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 font-bold outline-none"
                >
                  {monthNames.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">वर्ष निवडा (Select Year)</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 font-bold outline-none"
                >
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                नवा महिना: <span className="text-amber-400 font-bold">{selectedMonth}-{selectedYear}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setIsAddMonthModalOpen(false)} 
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs"
              >
                रद्द करा
              </button>
              <button 
                type="button" 
                onClick={handleConfirmAddMonth}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> महिना जोडा
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {isChangePassModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form onSubmit={handleChangePassword} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                <Key className="w-5 h-5" /> पासवर्ड बदला
              </h3>
              <button 
                type="button" 
                onClick={() => setIsChangePassModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">नवीन पासवर्ड (New Password)</label>
                <input 
                  type="password" 
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="नवीन पासवर्ड लिहा"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">पासवर्ड पुन्हा टाका (Confirm Password)</label>
                <input 
                  type="password" 
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="पुन्हा तोच पासवर्ड टाका"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                />
              </div>

              {passChangeError && (
                <p className="text-rose-400 text-center font-semibold text-[11px]">{passChangeError}</p>
              )}

              {passChangeSuccess && (
                <p className="text-emerald-400 text-center font-semibold text-[11px]">पासवर्ड यशस्वीरित्या बदलला! (Success)</p>
              )}
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setIsChangePassModalOpen(false)} 
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs"
              >
                रद्द करा
              </button>
              <button 
                type="submit" 
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> सेव्ह करा
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT/CORRECTION MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                <Edit3 className="w-5 h-5" /> बिलात दुरुस्ती करा ({localBill.month})
              </h3>
              <button 
                type="button" 
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">एकूण बिल (Total ₹)</label>
                <input type="number" value={localBill.totalBill} onChange={(e) => updateActiveField(['totalBill'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">ऊर्जा आकार (Energy Charge ₹)</label>
                <input type="number" value={localBill.energyCharge} onChange={(e) => updateActiveField(['energyCharge'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none" />
              </div>
            </div>

            <p className="text-xs font-bold text-slate-300 pt-2">स्थिर आकार दुरुस्ती (Fixed Charges):</p>
            <div className="grid grid-cols-5 gap-2 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 text-[10px]">स्थिर आकार</label>
                <input type="number" value={localBill.fixedPool.fixedCharge} onChange={(e) => updateActiveField(['fixedPool', 'fixedCharge'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 text-[10px]">वहन आकार</label>
                <input type="number" value={localBill.fixedPool.wheelingCharge} onChange={(e) => updateActiveField(['fixedPool', 'wheelingCharge'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 text-[10px]">इंधन आकार</label>
                <input type="number" value={localBill.fixedPool.fac} onChange={(e) => updateActiveField(['fixedPool', 'fac'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 text-[10px]">वीज शुल्क</label>
                <input type="number" value={localBill.fixedPool.duty} onChange={(e) => updateActiveField(['fixedPool', 'duty'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 text-[10px]">समायोजन</label>
                <input type="number" value={localBill.fixedPool.adjustments} onChange={(e) => updateActiveField(['fixedPool', 'adjustments'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-slate-200 outline-none" />
              </div>
            </div>

            <p className="text-xs font-bold text-slate-300 pt-2">मीटर रीडिंग दुरुस्ती (Meter Readings):</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">मुख्य चालू (Main Curr)</label>
                <input type="number" value={localBill.readings.mainCurr} onChange={(e) => updateActiveField(['readings', 'mainCurr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">मोटार चालू (Motor Curr)</label>
                <input type="number" value={localBill.readings.motorCurr} onChange={(e) => updateActiveField(['readings', 'motorCurr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{son1Name} चालू</label>
                <input type="number" value={localBill.readings.son1Curr} onChange={(e) => updateActiveField(['readings', 'son1Curr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{son2Name} चालू</label>
                <input type="number" value={localBill.readings.son2Curr} onChange={(e) => updateActiveField(['readings', 'son2Curr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{son3Name} चालू</label>
                <input type="number" value={localBill.readings.son3Curr} onChange={(e) => updateActiveField(['readings', 'son3Curr'], parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none" />
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-800">
              <button 
                type="button" 
                onClick={handleCancelEdit} 
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl text-sm"
              >
                रद्द करा (Cancel)
              </button>
              <button 
                type="button" 
                onClick={handleManualSave} 
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2 rounded-xl text-sm flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> सेव्ह करा (Save)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}