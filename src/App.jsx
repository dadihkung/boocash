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
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

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
    cats: { 
      Food: '🍔 Makan & Minum', 
      Groceries: '🛒 Belanja Bulanan',
      Shopping: '🛍️ Jajan / Shopping', 
      Transport: '🚗 Transportasi', 
      Bills: '🧾 Tagihan & Kost', 
      Entertainment: '🎬 Hiburan / Kencan',
      Health: '💊 Kesehatan',
      Salary: '💰 Gaji / Masukan',
      Transfer: '🔄 Transfer',
      'Wishlist Savings': '🎯 Tabungan Wishlist'
    }
  };

  // --- HELPER FUNCTIONS ---
  const formatThousand = (val) => {
    if (!val) return '';
    const clean = val.toString().replace(/\D/g, ''); 
    return Number(clean).toLocaleString('id-ID');
  };

  const parseRawNumber = (val) => {
    if (!val) return 0;
    return parseFloat(val.toString().replace(/\./g, '')) || 0;
  };

  const formatDateStr = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // --- DATA FETCHING ---
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
        .limit(100); 
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

  // --- SUBMIT TRANSACTION ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    const numericAmount = parseRawNumber(amount);
    if (numericAmount <= 0) { alert('Masukkan jumlah uang yang valid!'); return; }
    setSubmitting(true);
    const sourceWalletId = parseInt(selectedWallet);
    const targetWalletId = parseInt(targetWallet);

    try {
      if (type === 'transfer') {
        if (sourceWalletId === targetWalletId) { alert('Rekening asal dan tujuan tidak boleh sama!'); setSubmitting(false); return; }
        const sourceWallet = wallets.find(w => w.id === sourceWalletId);
        const destWallet = wallets.find(w => w.id === targetWalletId);
        
        // Update Balances
        await supabase.from('wallets').update({ balance: parseFloat(sourceWallet.balance) - numericAmount }).eq('id', sourceWalletId);
        await supabase.from('wallets').update({ balance: parseFloat(destWallet.balance) + numericAmount }).eq('id', targetWalletId);
        
        // IDEAL FIX: Insert 2 transactions for accurate history on both sides
        await supabase.from('transactions').insert([
          { wallet_id: sourceWalletId, amount: -numericAmount, category: 'Transfer', created_at: transactionDate, description: description || `Ke ${destWallet.name}` },
          { wallet_id: targetWalletId, amount: numericAmount, category: 'Transfer', created_at: transactionDate, description: description || `Dari ${sourceWallet.name}` }
        ]);

      } else {
        const finalWalletAmount = type === 'expense' ? -numericAmount : numericAmount;
        const currentWallet = wallets.find(w => w.id === sourceWalletId);
        
        await supabase.from('transactions').insert([{ 
          wallet_id: sourceWalletId, 
          amount: finalWalletAmount, 
          category, 
          created_at: transactionDate, 
          description: category === 'Wishlist Savings' ? `Nabung: ${description}` : description 
        }]);
        
        await supabase.from('wallets').update({ balance: parseFloat(currentWallet.balance) + finalWalletAmount }).eq('id', sourceWalletId);
        
        if (category === 'Wishlist Savings' && selectedGoal) {
          const currentGoal = goals.find(g => g.id === parseInt(selectedGoal));
          await supabase.from('savings_goals').update({ current_saved: parseFloat(currentGoal.current_saved) + (type === 'expense' ? numericAmount : -numericAmount) }).eq('id', parseInt(selectedGoal));
        }
      }
      
      setAmount(''); setDescription(''); setShowTransactionModal(false); 
      await fetchData(); 
      alert('Catatan berhasil ditambahkan! ✨');
    } catch (error) { alert('Gagal menyimpan: ' + error.message); } finally { setSubmitting(false); }
  };

  // --- DELETE TRANSACTION (NEW IDEAL FEATURE) ---
  const handleDeleteTransaction = async (tx) => {
    if (!window.confirm('Yakin ingin menghapus transaksi ini? Saldo dompet akan disesuaikan kembali secara otomatis.')) return;
    
    try {
      // Revert wallet balance
      const wallet = wallets.find(w => w.id === tx.wallet_id);
      if (wallet) {
        // tx.amount is negative for expense, positive for income. Subtracting it reverts the effect.
        const revertedBalance = parseFloat(wallet.balance) - parseFloat(tx.amount);
        await supabase.from('wallets').update({ balance: revertedBalance }).eq('id', tx.wallet_id);
      }
      // Delete record
      await supabase.from('transactions').delete().eq('id', tx.id);
      await fetchData();
    } catch (error) {
      alert('Gagal menghapus: ' + error.message);
    }
  };

  // --- WISHLIST CRUD ---
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
    setGoalIdToEdit(goal.id); setWishlistItemName(goal.item_name); setWishlistTargetAmount(goal.target_amount.toString()); setWishlistCurrentSaved(goal.current_saved.toString()); setShowWishlistCrud(true);
  };
  const handleDeleteWishlist = async (id) => {
    if (!window.confirm('Yakin ingin menghapus target ini?')) return;
    try { await supabase.from('savings_goals').delete().eq('id', id); await fetchData(); } catch (error) { alert('Gagal menghapus: ' + error.message); }
  };

  // --- DATA CALCULATIONS (CHART & SUMMARY) ---
  const currentYear = new Date().getFullYear();
  const monthlyTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.created_at);
    return (txDate.getMonth() + 1) === parseInt(selectedMonth) && txDate.getFullYear() === currentYear;
  });

  const getChartData = () => {
    const filtered = monthlyTransactions.filter(tx => tx.amount < 0 && tx.category !== 'Transfer');
    const totals = filtered.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + Math.abs(curr.amount);
      return acc;
    }, {});
    return Object.keys(totals).map(key => ({ name: t.cats[key] || key, value: totals[key] }));
  };

  const calculateMonthlySummary = () => {
    let totalIncome = 0;
    let totalExpense = 0;
    monthlyTransactions.forEach(tx => {
      if (tx.category === 'Transfer') return;
      if (tx.amount > 0) totalIncome += tx.amount;
      if (tx.amount < 0) totalExpense += Math.abs(tx.amount);
    });
    return { totalIncome, totalExpense, net: totalIncome - totalExpense };
  };

  const chartData = getChartData();
  const monthlySummary = calculateMonthlySummary();
  const COLORS = ['#eab308', '#e11d48', '#16a34a', '#3b82f6', '#a855f7', '#fb923c', '#2dd4bf'];
  const theme = isDarkMode ? darkYellowTheme : lightYellowTheme;

  if (loading) {
    return (
      <div style={{ ...styles.centerStage, backgroundColor: theme.bg, flexDirection: 'column' }}>
        <div style={{ ...styles.loadingSpinner, color: theme.accent, fontSize: '2rem' }}>booCash</div>
        <div style={{ color: theme.textSecondary, marginTop: '10px' }}>Tunggu sebentar sayang... 😘</div>
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
        <p style={{ ...styles.subtitle, color: theme.textSecondary }}>Mencatat masa depan kita bersama</p>
      </header>

      {/* BALANCE SECTION */}
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

      {/* DASHBOARD: SUMMARY & CHART */}
      <section style={{ ...styles.card, backgroundColor: theme.cardBg, border: theme.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ ...styles.sectionTitle, color: theme.textMain, margin: 0 }}>Dashboard Bulanan</h3>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ ...styles.minimalInput, width: 'auto', padding: '5px 10px', fontSize: '0.8rem', backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }}
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleString('id-ID', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>

        {/* SUMMARY CARDS (NEW) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <div style={{ padding: '10px', borderRadius: '12px', backgroundColor: 'rgba(22, 163, 74, 0.1)' }}>
            <div style={{ fontSize: '0.7rem', color: theme.incomeColor, fontWeight: '700' }}>PEMASUKAN</div>
            <div style={{ color: theme.incomeColor, fontWeight: '700', fontSize: '0.95rem' }}>+ Rp {formatThousand(monthlySummary.totalIncome)}</div>
          </div>
          <div style={{ padding: '10px', borderRadius: '12px', backgroundColor: 'rgba(225, 29, 72, 0.1)' }}>
            <div style={{ fontSize: '0.7rem', color: theme.expenseColor, fontWeight: '700' }}>PENGELUARAN</div>
            <div style={{ color: theme.expenseColor, fontWeight: '700', fontSize: '0.95rem' }}>- Rp {formatThousand(monthlySummary.totalExpense)}</div>
          </div>
        </div>
        <div style={{ padding: '10px', borderRadius: '12px', backgroundColor: theme.inputBg, textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', color: theme.textSecondary, fontWeight: '700' }}>SISA DANA BULAN INI</div>
            <div style={{ color: theme.textMain, fontWeight: '700', fontSize: '1.2rem' }}>Rp {formatThousand(monthlySummary.net)}</div>
        </div>

        {/* CHART */}
        {chartData.length > 0 ? (
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => `Rp ${formatThousand(value)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : <p style={{ textAlign: 'center', color: theme.textSecondary, fontSize: '0.9rem' }}>Belum ada pengeluaran bulan ini ✨</p>}
      </section>

      <button 
        onClick={() => setShowTransactionModal(true)}
        style={{ ...styles.submitBtn, backgroundColor: theme.accent, color: theme.buttonText, marginBottom: '24px', boxShadow: `0 4px 14px ${theme.accent}40` }}
      >
        + Tambah Transaksi
      </button>

      {/* WISHLIST SECTION */}
      <section style={styles.wishlistSection}>
        <div style={styles.wishlistHeaderRow}>
          <h3 style={{ ...styles.sectionTitle, color: theme.textMain, margin: 0 }}>🎯 Target Wishlist Kita</h3>
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
          {goals.length === 0 && <p style={{ color: theme.textSecondary, fontSize: '0.85rem', textAlign: 'center' }}>Belum ada target impian nih, yuk buat!</p>}
        </div>
      </section>

      {/* HISTORY FEED (UTAMA) */}
      <section style={styles.historySection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ ...styles.sectionTitle, color: theme.textMain, margin: 0 }}>📜 Riwayat Terakhir</h3>
          {transactions.length > 0 && (
            <button onClick={() => setShowFullHistory(true)} style={{ ...styles.manageBtn, color: theme.accent, backgroundColor: theme.inputBg, border: 'none', cursor: 'pointer' }}>
              Lihat Semua
            </button>
          )}
        </div>

        <div style={styles.historyList}>
          {transactions.slice(0, 3).map((tx) => {
            const isExpense = tx.amount < 0;
            const catLabel = t.cats[tx.category] || tx.category;
            return (
              <div key={tx.id} style={{ ...styles.historyCard, backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div style={styles.txMeta}>
                  <span style={{ ...styles.txCat, color: theme.textMain }}>{catLabel}</span>
                  {tx.description && <span style={{ ...styles.txDesc, color: theme.textSecondary }}>{tx.description}</span>}
                  <span style={{ fontSize: '0.7rem', color: theme.textSecondary, marginTop: '2px' }}>{formatDateStr(tx.created_at)}</span>
                </div>
                <span style={{ ...styles.txAmount, color: isExpense ? theme.expenseColor : theme.incomeColor }}>
                  {isExpense ? '- ' : '+ '}Rp {Number(Math.abs(tx.amount)).toLocaleString('id-ID')}
                </span>
              </div>
            );
          })}
          {transactions.length === 0 && <p style={{ color: theme.textSecondary, fontSize: '0.85rem', textAlign: 'center' }}>Belum ada transaksi sama sekali.</p>}
        </div>
      </section>

      {/* MODAL TRANSAKSI UTAMA */}
      {showTransactionModal && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, backgroundColor: theme.bg, borderColor: theme.border }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: theme.textMain }}>Catat Transaksi</h2>
              <button onClick={() => setShowTransactionModal(false)} style={{ ...styles.closeBtn, color: theme.textSecondary }}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={styles.flexForm}>
              <div style={{ ...styles.segmentedControl, backgroundColor: theme.inputBg, gridTemplateColumns: '1fr 1fr 1fr' }}>
                <button type="button" onClick={() => setType('expense')} style={{ ...styles.segmentBtn, color: type === 'expense' ? theme.expenseColor : theme.textSecondary, ...(type === 'expense' ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>Pengeluaran</button>
                <button type="button" onClick={() => setType('income')} style={{ ...styles.segmentBtn, color: type === 'income' ? theme.incomeColor : theme.textSecondary, ...(type === 'income' ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>Pemasukan</button>
                <button type="button" onClick={() => setType('transfer')} style={{ ...styles.segmentBtn, color: type === 'transfer' ? theme.accent : theme.textSecondary, ...(type === 'transfer' ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>🔄 Transfer</button>
              </div>

              {type === 'transfer' ? (
                <>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.textSecondary }}>Dari Rekening</label>
                    <select value={selectedWallet} onChange={(e) => setSelectedWallet(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.accent }}>Ke Rekening</label>
                    <select value={targetWallet} onChange={(e) => setTargetWallet(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.accent, color: theme.textMain }}>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.textSecondary }}>Akun / Dompet</label>
                    <select value={selectedWallet} onChange={(e) => setSelectedWallet(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.textSecondary }}>Kategori</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                      {type === 'income' ? <option value="Salary">{t.cats.Salary}</option> : (
                        <>
                          <option value="Food">{t.cats.Food}</option>
                          <option value="Groceries">{t.cats.Groceries}</option>
                          <option value="Shopping">{t.cats.Shopping}</option>
                          <option value="Transport">{t.cats.Transport}</option>
                          <option value="Bills">{t.cats.Bills}</option>
                          <option value="Entertainment">{t.cats.Entertainment}</option>
                          <option value="Health">{t.cats.Health}</option>
                          <option value="Wishlist Savings">{t.cats['Wishlist Savings']}</option>
                        </>
                      )}
                    </select>
                  </div>
                </>
              )}
              
              {category === 'Wishlist Savings' && type === 'expense' && (
                <div style={styles.inputGroup}>
                  <label style={{ ...styles.label, color: theme.accent }}>Pilih Target Wishlist</label>
                  <select value={selectedGoal} onChange={(e) => setSelectedGoal(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.accent, color: theme.textMain }}>
                    {goals.map(g => <option key={g.id} value={g.id}>🎯 {g.item_name}</option>)}
                  </select>
                </div>
              )}

              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>Tanggal</label>
                <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} />
              </div>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>Jumlah Uang</label>
                <div style={styles.amountInputWrapper}>
                  <span style={{ ...styles.currencyPrefix, color: theme.textMain }}>Rp</span>
                  <input type="text" inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(formatThousand(e.target.value))} style={{ ...styles.amountInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} required />
                </div>
              </div>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>Catatan</label>
                <input type="text" placeholder="Beli apa kita? (Opsional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} />
              </div>
              <button type="submit" disabled={submitting} style={{ ...styles.submitBtn, backgroundColor: theme.buttonBg, color: theme.buttonText, marginTop: '10px' }}>
                {submitting ? 'Menyimpan...' : 'Simpan Catatan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RIWAYAT LENGKAP + DELETE FEATURE */}
      {showFullHistory && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, backgroundColor: theme.bg, borderColor: theme.border }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: theme.textMain }}>Semua Riwayat</h2>
              <button onClick={() => setShowFullHistory(false)} style={{ ...styles.closeBtn, color: theme.textSecondary }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
              <input 
                type="text" placeholder="Cari..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                style={{ ...styles.minimalInput, flex: 2, backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }}
              />
              <select 
                value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                style={{ ...styles.minimalInput, flex: 1, backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }}
              >
                <option value="All">Semua</option>
                {Object.keys(t.cats).map(cat => <option key={cat} value={cat}>{t.cats[cat]}</option>)}
              </select>
            </div>

            <div style={{ ...styles.historyList, maxHeight: '60vh', overflowY: 'auto', gap: '10px' }}>
              {filteredTransactions.map((tx) => {
                const isExpense = tx.amount < 0;
                return (
                  <div key={tx.id} style={{ ...styles.historyCard, backgroundColor: theme.cardBg, borderColor: theme.border }}>
                    <div style={styles.txMeta}>
                      <span style={{ ...styles.txCat, color: theme.textMain }}>{t.cats[tx.category] || tx.category}</span>
                      {tx.description && <span style={{ ...styles.txDesc, color: theme.textSecondary }}>{tx.description}</span>}
                      <span style={{ fontSize: '0.7rem', color: theme.textSecondary, marginTop: '2px' }}>{formatDateStr(tx.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{ ...styles.txAmount, color: isExpense ? theme.expenseColor : theme.incomeColor }}>
                        {isExpense ? '- ' : '+ '}Rp {Number(Math.abs(tx.amount)).toLocaleString('id-ID')}
                      </span>
                      {/* NEW: Tombol hapus transaksi */}
                      <button onClick={() => handleDeleteTransaction(tx)} style={{ background: 'none', border: 'none', color: theme.expenseColor, fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
                        🗑️ Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL WISHLIST CRUD */}
      {showWishlistCrud && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, backgroundColor: theme.bg, borderColor: theme.border }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: theme.textMain }}>{goalIdToEdit ? '✏️ Edit Target' : '✨ Tambah Target Wishlist'}</h2>
              <button onClick={() => { setShowWishlistCrud(false); resetCrudForm(); }} style={{ ...styles.closeBtn, color: theme.textSecondary }}>✕</button>
            </div>
            <form onSubmit={handleSaveWishlist} style={styles.flexForm}>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>Nama Item / Keperluan</label>
                <input type="text" placeholder="Contoh: Liburan Bareng ✈️" value={wishlistItemName} onChange={(e) => setWishlistItemName(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} required />
              </div>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>Target Angka (Rp)</label>
                <input type="text" inputMode="numeric" placeholder="0" value={wishlistTargetAmount} onChange={(e) => setWishlistTargetAmount(formatThousand(e.target.value))} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} required />
              </div>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>Sudah Terkumpul Inisial (Rp)</label>
                <input type="text" inputMode="numeric" placeholder="0" value={wishlistCurrentSaved} onChange={(e) => setWishlistCurrentSaved(formatThousand(e.target.value))} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} />
              </div>
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
                  <div style={styles.crudInfo}>
                    <span style={{ ...styles.crudName, color: theme.textMain }}>{g.item_name}</span>
                    <span style={{ fontSize: '0.75rem', color: theme.textSecondary }}>Target: Rp {Number(g.target_amount).toLocaleString('id-ID')}</span>
                  </div>
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
  border: '1px solid #e5e5d5',
  textMain: '#2c2a1e', 
  textSecondary: '#8c876e', 
  expenseColor: '#e11d48', 
  incomeColor: '#16a34a', 
  buttonBg: '#eab308', 
  buttonText: '#ffffff', 
  accent: '#eab308' 
};
const darkYellowTheme = { 
  bg: '#14140f', 
  cardBg: '#1e1e17', 
  inputBg: '#2a291f', 
  activeSegmentBg: '#343327', 
  border: '1px solid rgba(234, 179, 8, 0.08)', 
  textMain: '#fefce8', 
  textSecondary: '#a19e85', 
  expenseColor: '#ff453a', 
  incomeColor: '#30d158', 
  buttonBg: '#facc15', 
  buttonText: '#1c1c16', 
  accent: '#facc15' 
};

const styles = {
  card: { padding: '20px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: '20px' },
  minimalInput: { width: '100%', padding: '14px', borderRadius: '16px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' },
  submitBtn: { width: '100%', padding: '16px', borderRadius: '16px', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', transition: 'transform 0.2s, opacity 0.2s' },
  modalContent: { width: '100%', maxWidth: '420px', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '30px 20px 50px 20px', boxShadow: '0 -10px 30px rgba(0,0,0,0.1)', overflowY: 'auto' },
  historyCard: { padding: '16px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', border: '1px solid' },
  centerStage: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: '-apple-system, sans-serif' },
  loadingSpinner: { fontSize: '1.2rem', fontWeight: '600' },
  appContainer: { maxWidth: '420px', margin: '0 auto', padding: '12px 16px 32px 16px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', boxSizing: 'border-box', position: 'relative' },
  utilityBar: { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' },
  utilBtn: { border: 'none', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' },
  header: { textAlign: 'center', marginBottom: '24px' },
  title: { fontSize: '1.6rem', fontWeight: '800', margin: '0' },
  subtitle: { fontSize: '0.85rem', marginTop: '4px' },
  balanceSection: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' },
  balanceCard: { padding: '16px 14px', borderRadius: '18px', border: '1px solid', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' },
  cardLabel: { fontSize: '0.75rem', fontWeight: '600', marginBottom: '4px' },
  cardAmount: { fontSize: '1.2rem', fontWeight: '800' },
  wishlistSection: { marginBottom: '28px' },
  wishlistHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  manageBtn: { border: 'none', padding: '6px 12px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' },
  sectionTitle: { fontSize: '1rem', fontWeight: '700' },
  goalsGrid: { display: 'flex', flexDirection: 'column', gap: '12px' },
  goalCard: { padding: '16px', borderRadius: '18px', border: '1px solid', display: 'flex', flexDirection: 'column' },
  goalInfoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  goalName: { fontSize: '0.95rem', fontWeight: '700' },
  goalPct: { fontSize: '0.85rem', fontWeight: '800' },
  progressTrack: { height: '8px', width: '100%', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' },
  progressBar: { height: '100%', borderRadius: '4px', transition: 'width 0.4s ease' },
  goalAmountRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '500' },
  flexForm: { display: 'flex', flexDirection: 'column', gap: '16px' },
  segmentedControl: { display: 'grid', padding: '4px', borderRadius: '12px' },
  segmentBtn: { padding: '10px', borderRadius: '10px', border: 'none', background: 'none', fontSize: '0.85rem', cursor: 'pointer' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' },
  amountInputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  currencyPrefix: { position: 'absolute', left: '14px', fontSize: '1rem', fontWeight: '700' },
  amountInput: { width: '100%', padding: '14px 14px 14px 40px', borderRadius: '16px', border: '1px solid', fontSize: '1.1rem', fontWeight: '800', boxSizing: 'border-box' },
  historySection: { marginTop: '28px', marginBottom: '16px' },
  historyList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  txMeta: { display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '65%' },
  txCat: { fontSize: '0.9rem', fontWeight: '700' },
  txDesc: { fontSize: '0.8rem', fontStyle: 'italic', wordBreak: 'break-word', opacity: 0.9 },
  txAmount: { fontSize: '0.95rem', fontWeight: '800' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 1000, backdropFilter: 'blur(2px)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  modalTitle: { fontSize: '1.2rem', fontWeight: '800', margin: 0 },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' },
  crudActionRow: { display: 'flex', gap: '10px', marginTop: '10px' },
  cancelBtn: { flex: 1, padding: '14px', border: 'none', borderRadius: '14px', fontWeight: '700', cursor: 'pointer' },
  crudList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  crudRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: '14px', border: '1px solid' },
  crudInfo: { display: 'flex', flexDirection: 'column', gap: '2px' },
  crudName: { fontSize: '0.9rem', fontWeight: '700' },
  crudButtons: { display: 'flex', gap: '6px' },
  iconBtn: { background: 'none', border: 'none', padding: '6px', fontSize: '1.1rem', cursor: 'pointer' }
};

export default App;
