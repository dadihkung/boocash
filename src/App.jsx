import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

function App() {
  // State untuk greeting
  const [showGreeting, setShowGreeting] = useState(true);

  // Effect untuk menyembunyikan greeting setelah 5 detik
  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // PERSISTENT THEME STATE
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('isDarkMode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('isDarkMode', isDarkMode);
  }, [isDarkMode]);

  const [wallets, setWallets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // Default ke bulan sekarang

  // Form states untuk Transaksi Utama
  const [selectedWallet, setSelectedWallet] = useState(''); 
  const [targetWallet, setTargetWallet] = useState(''); 
  const [selectedGoal, setSelectedGoal] = useState(''); 
  const [amount, setAmount] = useState(''); 
  const [type, setType] = useState('expense'); 
  const [category, setCategory] = useState('Food');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]); 
  const [submitting, setSubmitting] = useState(false);

  // --- STATE UNTUK CRUD WISHLIST ---
  const [showWishlistCrud, setShowWishlistCrud] = useState(false);
  const [goalIdToEdit, setGoalIdToEdit] = useState(null);
  const [wishlistItemName, setWishlistItemName] = useState('');
  const [wishlistTargetAmount, setWishlistTargetAmount] = useState('');
  const [wishlistCurrentSaved, setWishlistCurrentSaved] = useState('');
  const [crudSubmitting, setCrudSubmitting] = useState(false);

  const t = {
    subtitle: 'Mencatat masa depan kita bersama',
    balances: 'Saldo Saat Ini',
    logTitle: 'Catat Transaksi Baru',
    expense: 'Pengeluaran',
    income: 'Gaji / Pemasukan',
    transfer: 'Transfer Antar Rekening',
    account: 'Akun / Dompet',
    fromAccount: 'Dari Rekening',
    toAccount: 'Ke Rekening',
    amount: 'Jumlah Uang',
    category: 'Kategori',
    date: 'Tanggal',
    memo: 'Catatan',
    placeholderMemo: 'Beli apa kita? (Opsional)',
    saveBtn: 'Simpan Catatan',
    saving: 'Menyimpan...',
    invalidAmount: 'Masukkan jumlah uang yang valid!',
    error: 'Gagal menyimpan data: ',
    wishlistTitle: '🎯 Target Wishlist Kita',
    targetSelect: 'Pilih Target Wishlist',
    historyTitle: '📜 Riwayat Catatan Kita', 
    cats: { 
      Food: '🍔 Makanan', 
      Shopping: '🛍️ Belanja', 
      Transport: '🚗 Transport', 
      Bills: '🧾 Tagihan', 
      Salary: '💰 Gaji',
      Transfer: '🔄 Transfer',
      'Wishlist Savings': '🎯 Wishlist'
    }
  };

  // --- CHART LOGIC ---
  const getChartData = () => {
    const currentYear = new Date().getFullYear();
    const filtered = transactions.filter(tx => {
      const txDate = new Date(tx.created_at);
      return tx.amount < 0 && 
            tx.category !== 'Transfer' &&
            (txDate.getMonth() + 1) === parseInt(selectedMonth) &&
            txDate.getFullYear() === currentYear;
    });

    const totals = filtered.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + Math.abs(curr.amount);
      return acc;
    }, {});
    
    return Object.keys(totals).map(key => ({ name: t.cats[key] || key, value: totals[key] }));
  };
  const COLORS = ['#eab308', '#e11d48', '#16a34a', '#3b82f6', '#a855f7'];

  const formatThousand = (val) => {
    if (!val) return '';
    const clean = val.toString().replace(/\D/g, ''); 
    return Number(clean).toLocaleString('id-ID');
  };

  const parseRawNumber = (val) => {
    if (!val) return 0;
    return parseFloat(val.toString().replace(/\./g, '')) || 0;
  };

  async function fetchData() {
    try {
      const { data: walletData, error: wError } = await supabase.from('wallets').select('*').order('id', { ascending: true });
      if (wError) throw wError;
      setWallets(walletData);
      
      if (walletData.length > 0) {
        if (!selectedWallet) setSelectedWallet(walletData[0].id.toString());
        if (!targetWallet && walletData[1]) setTargetWallet(walletData[1].id.toString());
      }

      const { data: goalData, error: gError } = await supabase.from('savings_goals').select('*').order('id', { ascending: true });
      if (gError) throw gError;
      setGoals(goalData);
      if (goalData.length > 0 && !selectedGoal) {
        setSelectedGoal(goalData[0].id.toString());
      }

      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20); // Increased limit for better chart data
      if (txError) throw txError;
      setTransactions(txData || []);

    } catch (error) {
      console.error('Error fetching data:', error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (type === 'income') setCategory('Salary');
    else if (type === 'transfer') setCategory('Transfer');
    else setCategory('Food');
  }, [type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numericAmount = parseRawNumber(amount);
    if (numericAmount <= 0) { alert(t.invalidAmount); return; }
    setSubmitting(true);
    const sourceWalletId = parseInt(selectedWallet);
    const targetWalletId = parseInt(targetWallet);

    try {
      if (type === 'transfer') {
        if (sourceWalletId === targetWalletId) { alert('Rekening sama!'); setSubmitting(false); return; }
        const sourceWallet = wallets.find(w => w.id === sourceWalletId);
        const destWallet = wallets.find(w => w.id === targetWalletId);
        await supabase.from('wallets').update({ balance: parseFloat(sourceWallet.balance) - numericAmount }).eq('id', sourceWalletId);
        await supabase.from('wallets').update({ balance: parseFloat(destWallet.balance) + numericAmount }).eq('id', targetWalletId);
        await supabase.from('transactions').insert([{ wallet_id: sourceWalletId, amount: -numericAmount, category: 'Transfer', created_at: transactionDate, description: description || `Transfer ke ${destWallet.name}` }]);
      } else {
        const finalWalletAmount = type === 'expense' ? -numericAmount : numericAmount;
        const currentWallet = wallets.find(w => w.id === sourceWalletId);
        await supabase.from('transactions').insert([{ wallet_id: sourceWalletId, amount: finalWalletAmount, category, created_at: transactionDate, description: category === 'Wishlist Savings' ? `Nabung: ${description}` : description }]);
        await supabase.from('wallets').update({ balance: parseFloat(currentWallet.balance) + finalWalletAmount }).eq('id', sourceWalletId);
        if (category === 'Wishlist Savings' && selectedGoal) {
          const currentGoal = goals.find(g => g.id === parseInt(selectedGoal));
          await supabase.from('savings_goals').update({ current_saved: parseFloat(currentGoal.current_saved) + (type === 'expense' ? numericAmount : -numericAmount) }).eq('id', parseInt(selectedGoal));
        }
      }
      setAmount(''); setDescription(''); await fetchData(); alert('Berhasil! ✨');
    } catch (error) { alert(t.error + error.message); } finally { setSubmitting(false); }
  };

  const handleSaveWishlist = async (e) => {
    e.preventDefault();
    setCrudSubmitting(true);
    const payload = { item_name: wishlistItemName, target_amount: parseRawNumber(wishlistTargetAmount), current_saved: parseRawNumber(wishlistCurrentSaved || '0') };
    try {
      if (goalIdToEdit) await supabase.from('savings_goals').update(payload).eq('id', goalIdToEdit);
      else await supabase.from('savings_goals').insert([payload]);
      resetCrudForm(); await fetchData();
    } catch (error) { alert('Gagal: ' + error.message); } finally { setCrudSubmitting(false); }
  };

  const resetCrudForm = () => { setGoalIdToEdit(null); setWishlistItemName(''); setWishlistTargetAmount(''); setWishlistCurrentSaved(''); };

  const handleEditClick = (goal) => {
    setGoalIdToEdit(goal.id);
    setWishlistItemName(goal.item_name);
    setWishlistTargetAmount(goal.target_amount.toString());
    setWishlistCurrentSaved(goal.current_saved.toString());
    setShowWishlistCrud(true);
  };

  const handleDeleteWishlist = async (id) => {
    if (!window.confirm('Yakin ingin menghapus target ini?')) return;
    try {
      await supabase.from('savings_goals').delete().eq('id', id);
      await fetchData();
    } catch (error) {
      alert('Gagal menghapus: ' + error.message);
    }
  };

  const theme = isDarkMode ? darkYellowTheme : lightYellowTheme;
  const chartData = getChartData();

  if (loading) {
    return (
      <div style={{ ...styles.centerStage, backgroundColor: theme.bg, flexDirection: 'column' }}>
        <div style={{ ...styles.loadingSpinner, color: theme.accent, fontSize: '2rem' }}>booCash</div>
        <div style={{ color: theme.textSecondary, marginTop: '10px' }}>Muacch 😘😘</div>
      </div>
    );
  }

  const filteredTransactions = transactions.filter(tx => {
  const matchesSearch = tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (t.cats[tx.category] || tx.category).toLowerCase().includes(searchTerm.toLowerCase());
  const matchesCategory = filterCategory === 'All' || tx.category === filterCategory;
  return matchesSearch && matchesCategory;
});

  return (
    <div style={{ ...styles.appContainer, backgroundColor: theme.bg }}>
      {/* Utility Bar */}
      <div style={styles.utilityBar}>
        <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ ...styles.utilBtn, backgroundColor: theme.cardBg, color: theme.textSecondary }}>
          {isDarkMode ? '☀️ Terang' : '🌙 Gelap'}
        </button>
      </div>

      <header style={styles.header}>
        {showGreeting && <div style={{ color: theme.accent, fontWeight: '600', marginBottom: '10px' }}>I love you, Bobooo! 💖</div>}
        <h1 style={{ ...styles.title, color: theme.textMain }}>BooCash</h1>
      </header>

      {/* CHART SECTION */}
      <section style={{ ...styles.card, backgroundColor: theme.cardBg, padding: '15px', borderRadius: '16px', marginBottom: '20px', border: theme.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ ...styles.sectionTitle, color: theme.textMain, margin: 0 }}>Analisis Pengeluaran</h3>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ ...styles.minimalInput, width: 'auto', padding: '5px 10px', fontSize: '0.8rem' }}
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleString('id-ID', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>

        {chartData.length > 0 ? (
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : <p style={{ textAlign: 'center', color: theme.textSecondary }}>Belum ada data pengeluaran</p>}
      </section>

      <section style={styles.balanceSection}>
        {wallets.map((wallet) => (
          <div key={wallet.id} style={{ ...styles.balanceCard, backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <span style={{ ...styles.cardLabel, color: theme.textSecondary }}>
              {wallet.name === 'Boo Bank Account' ? '🏦 Rekening Boo' : wallet.name === 'Bee Bank Account' ? '🏦 Rekening Bee' : wallet.name}
            </span>
            <span style={{ ...styles.cardAmount, color: theme.textMain }}>
              Rp {Number(wallet.balance).toLocaleString('id-ID')}
            </span>
          </div>
        ))}
      </section>

      <button 
        onClick={() => setShowTransactionModal(true)}
        style={{ 
          ...styles.submitBtn, 
          backgroundColor: theme.accent, 
          color: theme.buttonText,
          marginBottom: '20px' 
        }}
      >
        + Tambah Transaksi
      </button>

{/* 1. HISTORY FEED (UTAMA) */}
<section style={styles.historySection}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
    <h3 style={{ ...styles.sectionTitle, color: theme.textMain, margin: 0 }}>{t.historyTitle}</h3>
    {transactions.length > 0 && (
      <button onClick={() => setShowFullHistory(true)} style={{ ...styles.manageBtn, color: theme.accent, backgroundColor: theme.inputBg, border: 'none', cursor: 'pointer' }}>
        Lihat Selengkapnya
      </button>
    )}
  </div>

  <div style={styles.historyList}>
    {/* Tampilkan hanya 2 item terbaru tanpa filter di halaman utama */}
    {transactions.slice(0, 2).map((tx) => {
      const isExpense = tx.amount < 0;
      const catLabel = t.cats[tx.category] || tx.category;
      return (
        <div key={tx.id} style={{ ...styles.historyCard, backgroundColor: theme.cardBg, borderColor: theme.border }}>
          <div style={styles.txMeta}>
            <span style={{ ...styles.txCat, color: theme.textMain }}>{catLabel}</span>
          </div>
          <span style={{ ...styles.txAmount, color: isExpense ? theme.expenseColor : theme.incomeColor }}>
            {isExpense ? '- ' : '+ '}Rp {Number(Math.abs(tx.amount)).toLocaleString('id-ID')}
          </span>
        </div>
      );
    })}
  </div>
</section>

      {/* 2. VISUALISASI WISHLIST GOALS */}
      <section style={styles.wishlistSection}>
        <div style={styles.wishlistHeaderRow}>
          <h3 style={{ ...styles.sectionTitle, color: theme.textMain, margin: 0 }}>{t.wishlistTitle}</h3>
          <button onClick={() => { setShowWishlistCrud(true); resetCrudForm(); }} style={{ ...styles.manageBtn, color: theme.accent, backgroundColor: theme.inputBg }}>
            ⚙️ Kelola
          </button>
        </div>
        <div style={styles.goalsGrid}>
          {goals.map((goal) => {
            const pct = Math.min(Math.round((goal.current_saved / goal.target_amount) * 100), 100) || 0;
            return (
              <div key={goal.id} style={{ ...styles.goalCard, backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div style={styles.goalInfoRow}>
                  <span style={{ ...styles.goalName, color: theme.textMain }}>{goal.item_name}</span>
                  <span style={{ ...styles.goalPct, color: theme.accent }}>{pct}%</span>
                </div>
                <div style={{ ...styles.progressTrack, backgroundColor: theme.inputBg }}>
                  <div style={{ ...styles.progressBar, width: `${pct}%`, backgroundColor: theme.accent }} />
                </div>
                <div style={styles.goalAmountRow}>
                  <span style={{ color: theme.textSecondary }}>Rp {Number(goal.current_saved).toLocaleString('id-ID')}</span>
                  <span style={{ color: theme.textSecondary, opacity: 0.6 }}>target: Rp {Number(goal.target_amount).toLocaleString('id-ID')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FORM UTAMA */}
{showTransactionModal && (
  <div style={styles.modalOverlay}>
    <div style={{ ...styles.modalContent, backgroundColor: theme.bg, borderColor: theme.border }}>
      <div style={styles.modalHeader}>
        <h2 style={{ ...styles.modalTitle, color: theme.textMain }}>{t.logTitle}</h2>
        <button onClick={() => setShowTransactionModal(false)} style={{ ...styles.closeBtn, color: theme.textSecondary }}>✕</button>
      </div>
      
      {/* FORM KAMU MASUK KE SINI */}
      <form onSubmit={handleSubmit} style={styles.flexForm}>
          <div style={{ ...styles.segmentedControl, backgroundColor: theme.inputBg, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <button type="button" onClick={() => setType('expense')} style={{ ...styles.segmentBtn, color: type === 'expense' ? theme.expenseColor : theme.textSecondary, ...(type === 'expense' ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>{t.expense}</button>
            <button type="button" onClick={() => setType('income')} style={{ ...styles.segmentBtn, color: type === 'income' ? theme.incomeColor : theme.textSecondary, ...(type === 'income' ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>{t.income}</button>
            <button type="button" onClick={() => setType('transfer')} style={{ ...styles.segmentBtn, color: type === 'transfer' ? theme.accent : theme.textSecondary, ...(type === 'transfer' ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>🔄 Transfer</button>
          </div>

          {type === 'transfer' ? (
            <>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>{t.fromAccount}</label>
                <select value={selectedWallet} onChange={(e) => setSelectedWallet(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name === 'Boo Bank Account' ? '🏦 Rekening Boo' : w.name === 'Bee Bank Account' ? '🏦 Rekening Bee' : w.name}</option>)}
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.accent }}>{t.toAccount}</label>
                <select value={targetWallet} onChange={(e) => setTargetWallet(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.accent, color: theme.textMain }}>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name === 'Boo Bank Account' ? '🏦 Rekening Boo' : w.name === 'Bee Bank Account' ? '🏦 Rekening Bee' : w.name}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>{t.account}</label>
                <select value={selectedWallet} onChange={(e) => setSelectedWallet(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name === 'Boo Bank Account' ? '🏦 Rekening Boo' : w.name === 'Bee Bank Account' ? '🏦 Rekening Bee' : w.name}</option>)}
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>{t.category}</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                  {type === 'income' ? <option value="Salary">{t.cats.Salary}</option> : (
                    <>
                      <option value="Food">{t.cats.Food}</option>
                      <option value="Shopping">{t.cats.Shopping}</option>
                      <option value="Transport">{t.cats.Transport}</option>
                      <option value="Bills">{t.cats.Bills}</option>
                      <option value="Wishlist Savings">{t.cats['Wishlist Savings']}</option>
                    </>
                  )}
                </select>
              </div>
            </>
          )}
          {category === 'Wishlist Savings' && type === 'expense' && (
            <div style={styles.inputGroup}>
              <label style={{ ...styles.label, color: theme.accent }}>{t.targetSelect}</label>
              <select value={selectedGoal} onChange={(e) => setSelectedGoal(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.accent, color: theme.textMain }}>
                {goals.map(g => <option key={g.id} value={g.id}>🎯 {g.item_name}</option>)}
              </select>
            </div>
          )}
          {/* NEW: Date Picker Input */}
          <div style={styles.inputGroup}>
            <label style={{ ...styles.label, color: theme.textSecondary }}>{t.date}</label>
            <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} />
          </div>
          <div style={styles.inputGroup}>
            <label style={{ ...styles.label, color: theme.textSecondary }}>{t.amount}</label>
            <div style={styles.amountInputWrapper}>
              <span style={{ ...styles.currencyPrefix, color: theme.textMain }}>Rp</span>
              <input type="text" inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(formatThousand(e.target.value))} style={{ ...styles.amountInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} required />
            </div>
          </div>
          <div style={styles.inputGroup}>
            <label style={{ ...styles.label, color: theme.textSecondary }}>{t.memo}</label>
            <input type="text" placeholder={t.placeholderMemo} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} />
          </div>
          <button type="submit" disabled={submitting} style={{ ...styles.submitBtn, backgroundColor: theme.buttonBg, color: theme.buttonText }}>{submitting ? t.saving : t.saveBtn}</button>
        </form>
            </div>
          </div>
        )}

        {/* MODAL RIWAYAT LENGKAP (DENGAN FILTER) */}
        {showFullHistory && (
          <div style={styles.modalOverlay}>
            <div style={{ ...styles.modalContent, backgroundColor: theme.bg, borderColor: theme.border }}>
              <div style={styles.modalHeader}>
                <h2 style={{ ...styles.modalTitle, color: theme.textMain }}>Semua Riwayat</h2>
                <button onClick={() => setShowFullHistory(false)} style={{ ...styles.closeBtn, color: theme.textSecondary }}>✕</button>
              </div>

              {/* FILTER SEARCH & CATEGORY PINDAH KE SINI */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                <input 
                  type="text" 
                  placeholder="Cari transaksi..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ ...styles.minimalInput, flex: 2 }}
                />
                <select 
                  value={filterCategory} 
                  onChange={(e) => setFilterCategory(e.target.value)}
                  style={{ ...styles.minimalInput, flex: 1 }}
                >
                  <option value="All">Semua</option>
                  {Object.keys(t.cats).map(cat => <option key={cat} value={cat}>{t.cats[cat]}</option>)}
                </select>
              </div>

              <div style={{ ...styles.historyList, maxHeight: '50vh', overflowY: 'auto', gap: '10px' }}>
                {/* Gunakan filteredTransactions di sini agar pencarian bekerja di dalam modal */}
                {filteredTransactions.map((tx) => {
                  const isExpense = tx.amount < 0;
                  return (
                    <div key={tx.id} style={{ ...styles.historyCard, backgroundColor: theme.cardBg, borderColor: theme.border }}>
                      <div style={{ color: theme.textMain }}>{t.cats[tx.category] || tx.category}</div>
                      <div style={{ color: isExpense ? theme.expenseColor : theme.incomeColor, fontWeight: '700' }}>
                        {isExpense ? '- ' : '+ '}Rp {Number(Math.abs(tx.amount)).toLocaleString('id-ID')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      {/* MODAL WISHLIST */}
      {showWishlistCrud && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, backgroundColor: theme.bg, borderColor: theme.border }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: theme.textMain }}>{goalIdToEdit ? '✏️ Edit Target' : '✨ Tambah Target Wishlist'}</h2>
              <button onClick={() => { setShowWishlistCrud(false); resetCrudForm(); }} style={{ ...styles.closeBtn, color: theme.textSecondary }}>✕</button>
            </div>
            <form onSubmit={handleSaveWishlist} style={styles.flexForm}>
              <div style={styles.inputGroup}><label style={{ ...styles.label, color: theme.textSecondary }}>Nama Item / Keperluan</label>
              <input type="text" placeholder="Contoh: Liburan Bareng ✈️" value={wishlistItemName} onChange={(e) => setWishlistItemName(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} required /></div>
              <div style={styles.inputGroup}><label style={{ ...styles.label, color: theme.textSecondary }}>Target Angka (Rp)</label>
              <input type="text" inputMode="numeric" placeholder="0" value={wishlistTargetAmount} onChange={(e) => setWishlistTargetAmount(formatThousand(e.target.value))} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} required /></div>
              <div style={styles.inputGroup}><label style={{ ...styles.label, color: theme.textSecondary }}>Sudah Terkumpul Inisial (Rp)</label>
              <input type="text" inputMode="numeric" placeholder="0" value={wishlistCurrentSaved} onChange={(e) => setWishlistCurrentSaved(formatThousand(e.target.value))} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} /></div>
              <div style={styles.crudActionRow}>
                {goalIdToEdit && <button type="button" onClick={resetCrudForm} style={{ ...styles.cancelBtn, color: theme.textMain, backgroundColor: theme.inputBg }}>Batal Edit</button>}
                <button type="submit" disabled={crudSubmitting} style={{ ...styles.submitBtn, margin: 0, backgroundColor: theme.accent, color: theme.buttonText }}>{crudSubmitting ? 'Menyimpan...' : goalIdToEdit ? 'Simpan Perubahan' : 'Buat Target Baru'}</button>
              </div>
            </form>
            <hr style={{ border: 'none', height: '1px', backgroundColor: theme.border, margin: '20px 0 14px 0' }} />
            <h4 style={{ ...styles.label, color: theme.textSecondary, marginBottom: '8px' }}>Daftar Target Aktif Kita</h4>
            <div style={styles.crudList}>
              {goals.map((g) => (
                <div key={g.id} style={{ ...styles.crudRow, backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div style={styles.crudInfo}><span style={{ ...styles.crudName, color: theme.textMain }}>{g.item_name}</span><span style={{ fontSize: '0.75rem', color: theme.textSecondary }}>Target: Rp {Number(g.target_amount).toLocaleString('id-ID')}</span></div>
                  <div style={styles.crudButtons}>
                    <button onClick={() => handleEditClick(g)} style={{ ...styles.iconBtn, color: '#eab308' }}>✏️</button>
                    <button onClick={() => handleDeleteWishlist(g.id)} style={{ ...styles.iconBtn, color: '#e11d48' }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lightYellowTheme = { 
  bg: '#fefdf0', 
  cardBg: '#ffffff', 
  inputBg: '#fbf9e3', 
  activeSegmentBg: '#ffffff', 
  border: '1px solid #e5e5d5', // Tambahkan border ini
  textMain: '#2c2a1e', 
  textSecondary: '#8c876e', 
  expenseColor: '#e11d48', 
  incomeColor: '#16a34a', 
  buttonBg: '#eab308', 
  buttonText: '#ffffff', 
  accent: '#eab308' 
};
const darkYellowTheme = { bg: '#14140f', cardBg: '#1e1e17', inputBg: '#2a291f', activeSegmentBg: '#343327', border: 'rgba(234, 179, 8, 0.08)', textMain: '#fefce8', textSecondary: '#a19e85', expenseColor: '#ff453a', incomeColor: '#30d158', buttonBg: '#facc15', buttonText: '#1c1c16', accent: '#facc15' };

const styles = {

// Baris 458 di file App.jsx Anda
card: { 
  padding: '20px', 
  borderRadius: '24px', 
  border: 'none', // <--- INI PENYEBABNYA
  boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
  marginBottom: '20px' 
},
  
  // Input yang lebih empuk
  minimalInput: { 
    width: '100%', 
    padding: '14px', 
    borderRadius: '16px', // Lebih rounded
    border: '1px solid rgba(234, 179, 8, 0.2)', 
    fontSize: '0.95rem',
    backgroundColor: 'transparent' 
  },

  // Tombol yang lebih friendly
  submitBtn: { 
    width: '100%', 
    padding: '16px', 
    borderRadius: '16px', // Membulat sempurna
    border: 'none', 
    fontSize: '1rem', 
    fontWeight: '700', 
    cursor: 'pointer',
    transition: 'transform 0.2s, opacity 0.2s' // Efek klik yang smooth
  },

  // Modal yang lebih nyaman (dibuat sedikit lebih luas)
  modalContent: { 
    width: '100%', 
    maxWidth: '420px', 
    borderTopLeftRadius: '32px', // Membulat besar di atas
    borderTopRightRadius: '32px', 
    padding: '30px 20px 50px 20px',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.1)'
  },
  
  // List history yang lebih rapi
  historyCard: { 
    padding: '16px', 
    borderRadius: '20px', 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: '8px'
  },
  centerStage: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: '-apple-system, sans-serif' },
  loadingSpinner: { fontSize: '1.2rem', fontWeight: '600' },
  appContainer: { maxWidth: '420px', margin: '0 auto', padding: '12px 16px 32px 16px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', boxSizing: 'border-box' },
  utilityBar: { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' },
  utilBtn: { border: 'none', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' },
  header: { textAlign: 'center', marginBottom: '20px' },
  avatarRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '4px' },
  avatar: { fontSize: '1.3rem' }, heartLine: { fontSize: '0.8rem' },
  title: { fontSize: '1.5rem', fontWeight: '700', margin: '0' },
  subtitle: { fontSize: '0.8rem', marginTop: '2px' },
  balanceSection: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' },
  balanceCard: { padding: '14px 12px', borderRadius: '14px', border: '1px solid', display: 'flex', flexDirection: 'column' },
  cardLabel: { fontSize: '0.75rem', fontWeight: '500' },
  cardAmount: { fontSize: '1.15rem', fontWeight: '700', marginTop: '4px' },
  wishlistSection: { marginBottom: '24px' },
  wishlistHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  manageBtn: { border: 'none', padding: '4px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' },
  sectionTitle: { fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase' },
  goalsGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  goalCard: { padding: '14px', borderRadius: '16px', border: '1px solid', display: 'flex', flexDirection: 'column' },
  goalInfoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  goalName: { fontSize: '0.9rem', fontWeight: '600' },
  goalPct: { fontSize: '0.85rem', fontWeight: '700' },
  progressTrack: { height: '6px', width: '100%', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' },
  progressBar: { height: '100%', borderRadius: '3px' },
  goalAmountRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' },
  formContainer: { padding: '20px', borderRadius: '22px', border: '1px solid' },
  flexForm: { display: 'flex', flexDirection: 'column', gap: '14px' },
  segmentedControl: { display: 'grid', padding: '3px', borderRadius: '10px' },
  segmentBtn: { padding: '8px', borderRadius: '8px', border: 'none', background: 'none', fontSize: '0.85rem', cursor: 'pointer' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase' },
  minimalInput: { width: '100%', padding: '11px', borderRadius: '10px', border: '1px solid', fontSize: '0.92rem', outline: 'none', boxSizing: 'border-box' },
  amountInputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  currencyPrefix: { position: 'absolute', left: '12px', fontSize: '0.9rem', fontWeight: '700' },
  amountInput: { width: '100%', padding: '11px 11px 11px 34px', borderRadius: '10px', border: '1px solid', fontSize: '1rem', fontWeight: '700', boxSizing: 'border-box' },
  submitBtn: { width: '100%', padding: '12px', borderRadius: '10px', border: 'none', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer' },
  historySection: { marginTop: '28px', marginBottom: '16px' },
  historyList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  historyCard: { padding: '12px 14px', borderRadius: '14px', border: '1px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  txMeta: { display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '70%' },
  txCat: { fontSize: '0.88rem', fontWeight: '600' },
  txDesc: { fontSize: '0.78rem', fontStyle: 'italic', wordBreak: 'break-word' },
  txAmount: { fontSize: '0.92rem', fontWeight: '700' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 1000 },
  modalContent: { width: '100%', maxWidth: '420px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', border: '1px solid', padding: '20px 16px 40px 16px', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '700', margin: 0 },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer' },
  crudActionRow: { display: 'flex', gap: '10px' },
  cancelBtn: { flex: 1, padding: '12px', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' },
  crudList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  crudRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', border: '1px solid' },
  crudInfo: { display: 'flex', flexDirection: 'column' },
  crudName: { fontSize: '0.88rem', fontWeight: '600' },
  crudButtons: { display: 'flex', gap: '4px' },
  iconBtn: { background: 'none', border: 'none', padding: '6px', fontSize: '1rem', cursor: 'pointer' }
};

export default App;
