import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import DashboardChart from './components/DashboardChart.jsx';
import Header from './components/Header.jsx';
import WalletList from './components/WalletList.jsx';

const TRANSACTION_TYPES = Object.freeze({ EXPENSE: 'expense', INCOME: 'income', TRANSFER: 'transfer' });
const EXPENSE_CATEGORIES = [
  ['Food', '🍔 Makan & Minum'], ['Groceries', '🛒 Belanja Bulanan'], ['Shopping', '🛍️ Belanja & Pribadi'],
  ['Transport', '🚗 Transportasi'], ['Bills', '🧾 Tagihan & Tempat Tinggal'], ['Entertainment', '🎬 Hiburan'],
  ['Health', '💊 Kesehatan'], ['Education', '📚 Pendidikan'], ['Family', '👨‍👩‍👧 Keluarga'],
  ['Travel', '✈️ Perjalanan'], ['Pets', '🐾 Hewan Peliharaan'], ['Giving', '🎁 Hadiah & Donasi'],
  ['Business', '💼 Usaha'], ['Wishlist Savings', '🎯 Tabungan Wishlist'],
  ['Emergency Savings', '🛟 Tabungan Dana Darurat'], ['Other', '📦 Lainnya']
];
const INCOME_CATEGORIES = [
  ['Salary', '💰 Gaji'], ['Freelance Income', '🧑‍💻 Freelance'], ['Business Income', '💼 Pendapatan Usaha'],
  ['Investment Income', '📈 Investasi'], ['Gift Income', '🎁 Hadiah'], ['Refund', '↩️ Pengembalian Dana'],
  ['Other Income', '➕ Pemasukan Lainnya']
];
const CATEGORY_LABELS = Object.fromEntries([
  ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ['Transfer', '🔄 Transfer'], ['Adjustment', '⚖️ Penyesuaian Saldo']
]);
const PERIOD_OPTIONS = [
  ['7days', '7 hari terakhir'], ['30days', '30 hari terakhir'], ['month', 'Bulan ini'],
  ['year', 'Tahun ini'], ['all', 'Semua waktu'], ['custom', 'Pilih tanggal']
];
const BUDGET_SCOPES = [
  ['shared', 'Bersama'], ['me', 'Bee'], ['partner', 'Boo']
];
const dateKey = (value) => String(value || '').slice(0, 10);
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const normalizeBudgetLimits = (storedBudgets) => Object.fromEntries(
  Object.entries(storedBudgets).map(([month, scopes]) => {
    const isLegacyBudget = Object.values(scopes || {}).every((value) => typeof value !== 'object' || value === null);
    return [month, isLegacyBudget ? { shared: scopes } : scopes];
  })
);

function App() {
  const [showGreeting, setShowGreeting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 5000);
    return () => clearTimeout(timer);
  }, []);

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
  const [syncHistoryWithDashboard, setSyncHistoryWithDashboard] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [toast, setToast] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  // --- STATE UNTUK EDIT SALDO (NEW) ---
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [editingWallet, setEditingWallet] = useState(null);
  const [newBalanceInput, setNewBalanceInput] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [dashboardWalletId, setDashboardWalletId] = useState('All');
  const [periodFilter, setPeriodFilter] = useState('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [budgetCategory, setBudgetCategory] = useState('Food');
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetScope, setBudgetScope] = useState('shared');
  const [editingBudgetCategory, setEditingBudgetCategory] = useState(null);
  const [budgetLimits, setBudgetLimits] = useState(() => {
    try {
      return normalizeBudgetLimits(JSON.parse(localStorage.getItem('booCashBudgets') || '{}'));
    } catch {
      return {};
    }
  });

  const [selectedWallet, setSelectedWallet] = useState(''); 
  const [targetWallet, setTargetWallet] = useState(''); 
  const [savingsWalletId, setSavingsWalletId] = useState('');
  const [selectedGoal, setSelectedGoal] = useState(''); 
  const [amount, setAmount] = useState(''); 
  const [type, setType] = useState('expense'); 
  const [category, setCategory] = useState('Food');
  const [transactionOwnerScope, setTransactionOwnerScope] = useState('shared');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]); 
  const [submitting, setSubmitting] = useState(false);

  const [showWishlistCrud, setShowWishlistCrud] = useState(false);
  const [goalIdToEdit, setGoalIdToEdit] = useState(null);
  const [wishlistItemName, setWishlistItemName] = useState('');
  const [wishlistTargetAmount, setWishlistTargetAmount] = useState('');
  const [wishlistCurrentSaved, setWishlistCurrentSaved] = useState('');
  const [crudSubmitting, setCrudSubmitting] = useState(false);

  const t = { cats: CATEGORY_LABELS };

  const formatThousand = (val) => {
    if (val === '' || val === null || val === undefined) return '';
    const clean = val.toString().replace(/\D/g, ''); 
    if (!clean) return '';
    return Number(clean).toLocaleString('id-ID');
  };

  const parseRawNumber = (val) => {
    if (!val) return 0;
    return Number(val.toString().replace(/\D/g, '')) || 0;
  };

  const formatDateStr = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getWalletBadge = (id) => {
    const wallet = wallets.find((item) => item.id === id);
    if (!wallet) return '';
    return `${wallet.icon || '🏦'} ${wallet.display_name || wallet.name}`;
  };

  async function fetchData() {
    try {
      const { data: walletData, error: wError } = await supabase.from('wallets').select('*').order('id', { ascending: true });
      if (wError) throw wError;
      setWallets(walletData);

      if (walletData.length > 0) {
        if (!selectedWallet) setSelectedWallet(walletData[0].id.toString());
        if (!targetWallet && walletData[1]) setTargetWallet(walletData[1].id.toString());
        if (!savingsWalletId) {
          const sourceId = Number(selectedWallet || walletData[0].id);
          const savingsWallet = walletData.find((wallet) =>
            wallet.id !== sourceId && /blu|blue\s*bca/i.test(`${wallet.display_name || ''} ${wallet.name || ''}`)
          ) || walletData.find((wallet) => wallet.id !== sourceId);
          if (savingsWallet) setSavingsWalletId(savingsWallet.id.toString());
        }
      }

      const { data: goalData, error: gError } = await supabase.from('savings_goals').select('*').order('id', { ascending: true });
      if (gError) throw gError;
      setGoals(goalData);
      if (goalData.length > 0 && !selectedGoal) {
        setSelectedGoal(goalData[0].id.toString());
      }

      const allTransactions = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: txPage, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + 999);
        if (txError) throw txError;
        allTransactions.push(...(txPage || []));
        if (!txPage || txPage.length < 1000) break;
      }
      setTransactions(allTransactions);

    } catch (error) {
      console.error('Error fetching data:', error.message);
    } finally {
      setLoading(false);
    }
  }

  const loadInitialData = useEffectEvent(fetchData);

  useEffect(() => {
    const timer = window.setTimeout(loadInitialData, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('booCashBudgets', JSON.stringify(budgetLimits));
  }, [budgetLimits]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // --- SUBMIT TRANSACTION ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    const numericAmount = parseRawNumber(amount);
    if (numericAmount <= 0) { setToast('Masukkan jumlah uang yang valid.'); return; }
    setSubmitting(true);
    const sourceWalletId = parseInt(selectedWallet);
    const targetWalletId = parseInt(targetWallet);

    try {
      if (type === TRANSACTION_TYPES.TRANSFER && sourceWalletId === targetWalletId) {
        setToast('Rekening asal dan tujuan tidak boleh sama.');
        return;
      }
      const isEmergencyAllocation = type === TRANSACTION_TYPES.EXPENSE && category === 'Emergency Savings';
      const isWishlistDeposit = type === TRANSACTION_TYPES.EXPENSE && category === 'Wishlist Savings';
      const savingsTargetId = Number(savingsWalletId);
      if ((isEmergencyAllocation || isWishlistDeposit) && !selectedGoal) {
        setToast('Pilih target tabungan terlebih dahulu.');
        return;
      }
      if (isWishlistDeposit && !savingsWalletId) {
        setToast('Pilih rekening tujuan tabungan terlebih dahulu.');
        return;
      }
      if (isWishlistDeposit && sourceWalletId === savingsTargetId) {
        setToast('Rekening sumber dan rekening tabungan harus berbeda.');
        return;
      }
      const destinationWallet = wallets.find((wallet) => wallet.id === targetWalletId);
      const transactionDescription = description;
      const { error } = await supabase.rpc('record_financial_transaction', {
        p_wallet_id: sourceWalletId,
        p_amount: numericAmount,
        p_transaction_type: type,
        p_category: type === TRANSACTION_TYPES.TRANSFER ? 'Transfer' : category,
        p_created_at: transactionDate,
        p_description: type === TRANSACTION_TYPES.TRANSFER && !description
          ? `Ke ${destinationWallet?.display_name || destinationWallet?.name || 'rekening tujuan'}`
          : transactionDescription,
        p_target_wallet_id: type === TRANSACTION_TYPES.TRANSFER
          ? targetWalletId
          : isWishlistDeposit ? savingsTargetId : null,
        p_goal_id: (isWishlistDeposit || isEmergencyAllocation) && selectedGoal
          ? Number(selectedGoal)
          : null,
        p_owner_scope: transactionOwnerScope
      });
      if (error) throw error;

      setAmount(''); setDescription(''); setShowTransactionModal(false); 
      await fetchData(); 
      setToast('Catatan berhasil ditambahkan.');
    } catch (error) { setToast('Gagal menyimpan: ' + error.message); } finally { setSubmitting(false); }
  };

  // --- DELETE TRANSACTION ---
  const handleDeleteTransaction = async (tx) => {
    try {
      const { error } = await supabase.rpc('delete_financial_transaction', { p_transaction_id: tx.id });
      if (error) throw error;

      await fetchData();
      setToast('Transaksi berhasil dihapus.');
    } catch (error) {
      setToast('Gagal menghapus: ' + (error.message || JSON.stringify(error)));
    }
  };

  // --- EDIT BALANCE HANDLER (NEW) ---
  const handleEditBalanceSubmit = async (e) => {
    e.preventDefault();
    if (!editingWallet) return;

    const numericNewBalance = parseRawNumber(newBalanceInput);
    const currentBalance = parseFloat(editingWallet.balance);
    const difference = numericNewBalance - currentBalance;

    if (difference === 0) {
      setShowBalanceModal(false);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('set_wallet_balance', {
        p_wallet_id: editingWallet.id,
        p_target_balance: numericNewBalance,
        p_created_at: localDateKey(new Date())
      });
      if (error) throw error;

      setShowBalanceModal(false);
      setEditingWallet(null);
      setNewBalanceInput('');
      await fetchData();
      setToast('Saldo berhasil disesuaikan.');
    } catch (error) {
      setToast('Gagal menyesuaikan saldo: ' + error.message);
    } finally {
      setSubmitting(false);
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
    } catch (error) { setToast('Gagal: ' + error.message); } finally { setCrudSubmitting(false); }
  };

  const resetCrudForm = () => { setGoalIdToEdit(null); setWishlistItemName(''); setWishlistTargetAmount(''); setWishlistCurrentSaved(''); };
  const handleEditClick = (goal) => {
    setGoalIdToEdit(goal.id); setWishlistItemName(goal.item_name); setWishlistTargetAmount(goal.target_amount.toString()); setWishlistCurrentSaved(goal.current_saved.toString()); setShowWishlistCrud(true);
  };
  const handleDeleteWishlist = async (id) => {
    try {
      const { error } = await supabase.from('savings_goals').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
      setToast('Target berhasil dihapus.');
    } catch (error) { setToast('Gagal menghapus: ' + error.message); }
  };

  const confirmDelete = async () => {
    const deletion = pendingDelete;
    setPendingDelete(null);
    if (deletion?.kind === 'transaction') await handleDeleteTransaction(deletion.payload);
    if (deletion?.kind === 'wishlist') await handleDeleteWishlist(deletion.payload);
    if (deletion?.kind === 'budget') {
      const { month, scope, categoryKey } = deletion.payload;
      setBudgetLimits((current) => {
        const nextMonth = { ...current[month] };
        const nextScope = { ...nextMonth[scope] };
        delete nextScope[categoryKey];
        if (Object.keys(nextScope).length > 0) nextMonth[scope] = nextScope;
        else delete nextMonth[scope];
        if (Object.keys(nextMonth).length > 0) return { ...current, [month]: nextMonth };
        const next = { ...current };
        delete next[month];
        return next;
      });
      if (editingBudgetCategory === categoryKey) {
        setEditingBudgetCategory(null);
        setBudgetInput('');
      }
      setToast('Anggaran berhasil dihapus.');
    }
  };

  // --- DATA CALCULATIONS ---
  const dashboardTransactions = useMemo(() => {
    const today = new Date();
    const todayKey = localDateKey(today);
    const start = new Date(today);
    if (periodFilter === '7days') start.setDate(start.getDate() - 6);
    if (periodFilter === '30days') start.setDate(start.getDate() - 29);
    const startKey = localDateKey(start);
    const currentMonth = monthKey(today);
    const currentYear = String(today.getFullYear());

    return transactions.filter((tx) => {
      const txDate = dateKey(tx.created_at);
      const matchesWallet = dashboardWalletId === 'All' || tx.wallet_id === Number(dashboardWalletId);
      let matchesPeriod = true;
      if (periodFilter === '7days' || periodFilter === '30days') matchesPeriod = txDate >= startKey && txDate <= todayKey;
      if (periodFilter === 'month') matchesPeriod = txDate.startsWith(currentMonth);
      if (periodFilter === 'year') matchesPeriod = txDate.startsWith(currentYear);
      if (periodFilter === 'custom') {
        matchesPeriod = (!customStartDate || txDate >= customStartDate) && (!customEndDate || txDate <= customEndDate);
      }
      return matchesWallet && matchesPeriod;
    });
  }, [transactions, dashboardWalletId, periodFilter, customStartDate, customEndDate]);

  const chartData = useMemo(() => {
    const totals = dashboardTransactions.reduce((acc, tx) => {
      if (tx.amount < 0 && !['Transfer', 'Adjustment', 'Wishlist Savings', 'Emergency Savings'].includes(tx.category)) {
        acc[tx.category] = (acc[tx.category] || 0) + Math.abs(Number(tx.amount));
      }
      return acc;
    }, {});
    return Object.entries(totals)
      .map(([categoryKey, value]) => ({ category: categoryKey, name: t.cats[categoryKey] || categoryKey, value }))
      .sort((a, b) => b.value - a.value);
  }, [dashboardTransactions, t.cats]);

  const monthlySummary = useMemo(() => {
    const summary = dashboardTransactions.reduce((result, tx) => {
      if (!['Transfer', 'Adjustment', 'Wishlist Savings', 'Emergency Savings'].includes(tx.category)) {
        if (tx.amount > 0) result.totalIncome += Number(tx.amount);
        if (tx.amount < 0) result.totalExpense += Math.abs(Number(tx.amount));
      }
      return result;
    }, { totalIncome: 0, totalExpense: 0 });
    return { ...summary, net: summary.totalIncome - summary.totalExpense };
  }, [dashboardTransactions]);

  const currentMonthTransactions = useMemo(() => transactions.filter((tx) =>
    dateKey(tx.created_at).startsWith(monthKey()) && tx.amount < 0 && !['Transfer', 'Adjustment', 'Wishlist Savings', 'Emergency Savings'].includes(tx.category)
  ), [transactions]);
  const budgetRows = Object.entries(budgetLimits[monthKey()]?.[budgetScope] || {}).map(([categoryKey, limit]) => {
    const spent = currentMonthTransactions
      .filter((tx) => tx.category === categoryKey && (tx.owner_scope || 'shared') === budgetScope)
      .reduce((total, tx) => total + Math.abs(Number(tx.amount)), 0);
    return { category: categoryKey, limit: Number(limit), spent, percent: Math.min(Math.round((spent / Number(limit)) * 100), 100) };
  }).filter((row) => row.limit > 0);

  const saveBudget = (event) => {
    event.preventDefault();
    const limit = parseRawNumber(budgetInput);
    if (limit <= 0) return;
    const categoryToSave = editingBudgetCategory || budgetCategory;
    setBudgetLimits((current) => ({
      ...current,
      [monthKey()]: {
        ...current[monthKey()],
        [budgetScope]: { ...current[monthKey()]?.[budgetScope], [categoryToSave]: limit }
      }
    }));
    setBudgetInput('');
    setEditingBudgetCategory(null);
    setToast(editingBudgetCategory ? 'Anggaran berhasil diperbarui.' : 'Anggaran berhasil disimpan.');
  };

  const editBudget = (categoryKey, limit) => {
    setBudgetCategory(categoryKey);
    setBudgetInput(formatThousand(limit));
    setEditingBudgetCategory(categoryKey);
  };

  const cancelBudgetEdit = () => {
    setEditingBudgetCategory(null);
    setBudgetInput('');
  };
  const COLORS = ['#eab308', '#e11d48', '#16a34a', '#3b82f6', '#a855f7', '#fb923c', '#2dd4bf'];
  const theme = isDarkMode ? darkYellowTheme : lightYellowTheme;

  const filteredTransactions = useMemo(() => {
    const historySource = syncHistoryWithDashboard ? dashboardTransactions : transactions;
    return historySource.filter(tx => {
    const matchesSearch = tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (t.cats[tx.category] || tx.category).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'All' || tx.category === filterCategory;
    return matchesSearch && matchesCategory;
    });
  }, [transactions, dashboardTransactions, syncHistoryWithDashboard, searchTerm, filterCategory, t.cats]);

  if (loading) {
    return (
      <div style={{ ...styles.centerStage, backgroundColor: theme.bg, flexDirection: 'column' }}>
        <div style={{ ...styles.loadingSpinner, color: theme.accent, fontSize: '2rem' }}>booCash</div>
        <div style={{ color: theme.textSecondary, marginTop: '10px' }}>Tunggu sebentar sayang... 😘</div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.appContainer, backgroundColor: theme.bg }}>
      {toast && <div role="status" style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 1200, width: 'max-content', maxWidth: 'calc(100vw - 32px)', padding: '12px 16px', borderRadius: '12px', backgroundColor: theme.textMain, color: theme.bg, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', fontSize: '0.85rem' }}>{toast}</div>}
      <Header showGreeting={showGreeting} isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} theme={theme} />

      {/* BALANCE SECTION */}
      <WalletList
        wallets={wallets}
        theme={theme}
        formatAmount={formatThousand}
        onEdit={(wallet) => { setEditingWallet(wallet); setNewBalanceInput(formatThousand(wallet.balance)); setShowBalanceModal(true); }}
      />

      {/* MODAL EDIT SALDO (NEW) */}
      {showBalanceModal && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, backgroundColor: theme.bg, borderColor: theme.border }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: theme.textMain }}>Penyesuaian Saldo</h2>
              <button onClick={() => setShowBalanceModal(false)} style={{ ...styles.closeBtn, color: theme.textSecondary }}>✕</button>
            </div>
            <p style={{ fontSize: '0.8rem', color: theme.textSecondary, marginBottom: '20px', lineHeight: '1.4' }}>
              Masukkan jumlah saldo <strong>asli</strong> saat ini. Sistem akan otomatis menghitung selisihnya dan mencatatnya sebagai transaksi penyesuaian agar pembukuan tetap seimbang.
            </p>
            <form onSubmit={handleEditBalanceSubmit} style={styles.flexForm}>
              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>
                  Saldo Baru untuk {editingWallet?.display_name || editingWallet?.name}
                </label>
                <div style={styles.amountInputWrapper}>
                  <span style={{ ...styles.currencyPrefix, color: theme.textMain }}>Rp</span>
                  <input 
                    type="text" inputMode="numeric" 
                    value={newBalanceInput} 
                    onChange={(e) => setNewBalanceInput(formatThousand(e.target.value))} 
                    style={{ ...styles.amountInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} 
                    required 
                  />
                </div>
              </div>
              <button type="submit" disabled={submitting} style={{ ...styles.submitBtn, backgroundColor: theme.accent, color: theme.buttonText, marginTop: '10px' }}>
                {submitting ? 'Menyimpan...' : 'Sesuaikan Saldo'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DASHBOARD: SUMMARY & CHART */}
      <section style={{ ...styles.card, backgroundColor: theme.cardBg, border: theme.border }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
          <h3 style={{ ...styles.sectionTitle, color: theme.textMain, margin: 0 }}>Ringkasan Keuangan</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select 
              value={dashboardWalletId} 
              onChange={(e) => setDashboardWalletId(e.target.value)}
              style={{ ...styles.minimalInput, flex: 1, padding: '6px 10px', fontSize: '0.8rem', backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }}
            >
              <option value="All">Semua Rekening</option>
              {wallets.map(w => (
                <option key={w.id} value={w.id}>
                  {w.display_name || w.name}
                </option>
              ))}
            </select>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              style={{ ...styles.minimalInput, width: 'auto', padding: '6px 10px', fontSize: '0.8rem', backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }}
            >
              {PERIOD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {periodFilter === 'custom' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input aria-label="Tanggal mulai" type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} style={{ ...styles.minimalInput, flex: 1, padding: '8px', fontSize: '0.8rem', backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }} />
              <input aria-label="Tanggal akhir" type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={{ ...styles.minimalInput, flex: 1, padding: '8px', fontSize: '0.8rem', backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }} />
            </div>
          )}
        </div>

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
            <div style={{ fontSize: '0.75rem', color: theme.textSecondary, fontWeight: '700' }}>SELISIH PERIODE</div>
            <div style={{ color: theme.textMain, fontWeight: '700', fontSize: '1.2rem' }}>Rp {formatThousand(monthlySummary.net)}</div>
        </div>

        <DashboardChart data={chartData} colors={COLORS} theme={theme} formatAmount={formatThousand} />
      </section>

      <section style={{ ...styles.card, backgroundColor: theme.cardBg, border: theme.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
          <h3 style={{ ...styles.sectionTitle, color: theme.textMain, margin: 0 }}>Anggaran Bulan Ini</h3>
          <span style={{ color: theme.textSecondary, fontSize: '0.7rem' }}>{new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</span>
        </div>
        <div style={{ ...styles.inputGroup, marginBottom: '10px' }}>
          <label style={{ ...styles.label, color: theme.textSecondary }}>Anggaran untuk</label>
          <select aria-label="Scope anggaran" value={budgetScope} onChange={(e) => setBudgetScope(e.target.value)} disabled={Boolean(editingBudgetCategory)} style={{ ...styles.minimalInput, padding: '9px', fontSize: '0.8rem', backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }}>
            {BUDGET_SCOPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <form onSubmit={saveBudget} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', marginBottom: '14px' }}>
          <select aria-label="Kategori anggaran" value={budgetCategory} onChange={(e) => setBudgetCategory(e.target.value)} disabled={Boolean(editingBudgetCategory)} style={{ ...styles.minimalInput, padding: '9px', fontSize: '0.75rem', backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }}>
            {EXPENSE_CATEGORIES.filter(([key]) => !['Wishlist Savings', 'Emergency Savings'].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <input aria-label="Batas anggaran rupiah" inputMode="numeric" placeholder="Batas Rp" value={budgetInput} onChange={(e) => setBudgetInput(formatThousand(e.target.value))} style={{ ...styles.minimalInput, padding: '9px', fontSize: '0.75rem', backgroundColor: theme.inputBg, color: theme.textMain, borderColor: theme.border }} />
          <button type="submit" style={{ ...styles.manageBtn, backgroundColor: theme.accent, color: theme.buttonText, padding: '8px 11px' }}>{editingBudgetCategory ? 'Perbarui' : 'Simpan'}</button>
        </form>
        {editingBudgetCategory && (
          <button type="button" onClick={cancelBudgetEdit} style={{ ...styles.manageBtn, marginBottom: '14px', color: theme.textSecondary, backgroundColor: theme.inputBg }}>Batal edit</button>
        )}
        {budgetRows.length > 0 ? (
          <div style={{ display: 'grid', gap: '12px' }}>
            {budgetRows.map((row) => (
              <div key={row.category}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.73rem', marginBottom: '5px' }}>
                  <span style={{ color: theme.textMain }}>{t.cats[row.category] || row.category}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ color: row.spent > row.limit ? theme.expenseColor : theme.textSecondary, whiteSpace: 'nowrap' }}>Rp {formatThousand(row.spent)} / {formatThousand(row.limit)}</span>
                    <button type="button" aria-label={`Edit anggaran ${t.cats[row.category] || row.category}`} title="Edit anggaran" onClick={() => editBudget(row.category, row.limit)} style={{ ...styles.iconBtn, padding: '1px 3px', fontSize: '0.85rem', color: theme.accent }}>✏️</button>
                    <button type="button" aria-label={`Hapus anggaran ${t.cats[row.category] || row.category}`} title="Hapus anggaran" onClick={() => setPendingDelete({ kind: 'budget', payload: { month: monthKey(), scope: budgetScope, categoryKey: row.category } })} style={{ ...styles.iconBtn, padding: '1px 3px', fontSize: '0.85rem', color: theme.expenseColor }}>🗑️</button>
                  </div>
                </div>
                <div style={{ height: '7px', borderRadius: '8px', overflow: 'hidden', backgroundColor: theme.inputBg }}>
                  <div style={{ height: '100%', width: `${row.percent}%`, backgroundColor: row.spent > row.limit ? theme.expenseColor : theme.incomeColor, borderRadius: '8px' }} />
                </div>
              </div>
            ))}
          </div>
        ) : <p style={{ color: theme.textSecondary, fontSize: '0.8rem' }}>Belum ada batas anggaran untuk {BUDGET_SCOPES.find(([value]) => value === budgetScope)?.[1].toLowerCase()}. Pilih kategori dan tentukan batas bulan ini.</p>}
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
            const isEmergencyAllocation = tx.category === 'Emergency Savings' && Number(tx.goal_contribution) > 0;
            const isExpense = tx.amount < 0 && !isEmergencyAllocation;
            const catLabel = t.cats[tx.category] || tx.category;
            return (
              <div key={tx.id} style={{ ...styles.historyCard, backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div style={styles.txMeta}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ ...styles.txCat, color: theme.textMain }}>{catLabel}</span>
                    <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: theme.inputBg, color: theme.textSecondary, fontWeight: '700' }}>
                      {getWalletBadge(tx.wallet_id)}
                    </span>
                  </div>
                  {tx.description && <span style={{ ...styles.txDesc, color: theme.textSecondary }}>{tx.description}</span>}
                  <span style={{ fontSize: '0.7rem', color: theme.textSecondary, marginTop: '2px' }}>{formatDateStr(tx.created_at)}</span>
                </div>
                <span style={{ ...styles.txAmount, color: isExpense ? theme.expenseColor : theme.incomeColor }}>
                  {isEmergencyAllocation
                    ? `Alokasi Rp ${Number(tx.goal_contribution).toLocaleString('id-ID')}`
                    : `${isExpense ? '- ' : '+ '}Rp ${Number(Math.abs(tx.amount)).toLocaleString('id-ID')}`}
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
          <div style={{ ...styles.modalContent, maxHeight: 'min(90dvh, 760px)', boxSizing: 'border-box', overscrollBehavior: 'contain', backgroundColor: theme.bg, borderColor: theme.border }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: theme.textMain }}>Catat Transaksi</h2>
              <button onClick={() => setShowTransactionModal(false)} style={{ ...styles.closeBtn, color: theme.textSecondary }}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={styles.flexForm}>
              <div style={{ ...styles.segmentedControl, backgroundColor: theme.inputBg, gridTemplateColumns: '1fr 1fr 1fr' }}>
                <button type="button" onClick={() => { setType(TRANSACTION_TYPES.EXPENSE); setCategory('Food'); }} style={{ ...styles.segmentBtn, color: type === TRANSACTION_TYPES.EXPENSE ? theme.expenseColor : theme.textSecondary, ...(type === TRANSACTION_TYPES.EXPENSE ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>Pengeluaran</button>
                <button type="button" onClick={() => { setType(TRANSACTION_TYPES.INCOME); setCategory('Salary'); }} style={{ ...styles.segmentBtn, color: type === TRANSACTION_TYPES.INCOME ? theme.incomeColor : theme.textSecondary, ...(type === TRANSACTION_TYPES.INCOME ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>Pemasukan</button>
                <button type="button" onClick={() => { setType(TRANSACTION_TYPES.TRANSFER); setCategory('Transfer'); }} style={{ ...styles.segmentBtn, color: type === TRANSACTION_TYPES.TRANSFER ? theme.accent : theme.textSecondary, ...(type === TRANSACTION_TYPES.TRANSFER ? { backgroundColor: theme.activeSegmentBg, fontWeight: '600' } : {}) }}>🔄 Transfer</button>
              </div>

              {type === TRANSACTION_TYPES.TRANSFER ? (
                <>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.textSecondary }}>Dari Rekening</label>
                    <select value={selectedWallet} onChange={(e) => setSelectedWallet(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.display_name || w.name}</option>)}
                    </select>
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.accent }}>Ke Rekening</label>
                    <select value={targetWallet} onChange={(e) => setTargetWallet(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.accent, color: theme.textMain }}>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.display_name || w.name}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.textSecondary }}>{category === 'Emergency Savings' ? 'Rekening tempat dana tetap disimpan' : 'Akun / Dompet'}</label>
                    <select value={selectedWallet} onChange={(e) => {
                      const nextWalletId = e.target.value;
                      setSelectedWallet(nextWalletId);
                      if (Number(savingsWalletId) === Number(nextWalletId)) {
                        setSavingsWalletId(wallets.find((wallet) => wallet.id !== Number(nextWalletId))?.id.toString() || '');
                      }
                    }} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.display_name || w.name}</option>)}
                    </select>
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.textSecondary }}>Kategori</label>
                    <select value={category} onChange={(e) => {
                      const nextCategory = e.target.value;
                      setCategory(nextCategory);
                      if (nextCategory === 'Emergency Savings') {
                        const emergencyGoal = goals.find((goal) => /darurat|emergency/i.test(goal.item_name));
                        setSelectedGoal(emergencyGoal ? emergencyGoal.id.toString() : '');
                      }
                    }} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                      {type === TRANSACTION_TYPES.INCOME
                        ? INCOME_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)
                        : EXPENSE_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </div>
                  {type === TRANSACTION_TYPES.EXPENSE && !['Wishlist Savings', 'Emergency Savings'].includes(category) && (
                    <div style={styles.inputGroup}>
                      <label style={{ ...styles.label, color: theme.textSecondary }}>Pengeluaran ini untuk</label>
                      <select value={transactionOwnerScope} onChange={(e) => setTransactionOwnerScope(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }}>
                        {BUDGET_SCOPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}

              {['Wishlist Savings', 'Emergency Savings'].includes(category) && type === TRANSACTION_TYPES.EXPENSE && (
                <>
                  <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.accent }}>Pilih Target Tabungan</label>
                    <select value={selectedGoal} onChange={(e) => setSelectedGoal(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.accent, color: theme.textMain }} required>
                      <option value="" disabled>
                        {category === 'Emergency Savings' ? 'Buat target Dana Darurat dulu' : 'Pilih target'}
                      </option>
                      {goals
                        .filter((goal) => category !== 'Emergency Savings' || /darurat|emergency/i.test(goal.item_name))
                        .map((goal) => <option key={goal.id} value={goal.id}>🎯 {goal.item_name}</option>)}
                    </select>
                  </div>
                  {category === 'Emergency Savings' && !goals.some((goal) => /darurat|emergency/i.test(goal.item_name)) && (
                    <p style={{ color: theme.textSecondary, fontSize: '0.78rem', marginTop: '-8px' }}>
                      Tutup form, lalu buat target bernama “Dana Darurat” dari tombol Kelola Wishlist.
                    </p>
                  )}
                  {category === 'Wishlist Savings' && <div style={styles.inputGroup}>
                    <label style={{ ...styles.label, color: theme.accent }}>Pindahkan ke rekening tabungan</label>
                    <select value={savingsWalletId} onChange={(e) => setSavingsWalletId(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.accent, color: theme.textMain }} required>
                      <option value="" disabled>Pilih rekening tujuan</option>
                      {wallets.filter((wallet) => wallet.id !== Number(selectedWallet)).map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>{wallet.display_name || wallet.name}</option>
                      ))}
                    </select>
                  </div>}
                  {category === 'Emergency Savings' && (
                    <p style={{ color: theme.textSecondary, fontSize: '0.78rem', marginTop: '-8px' }}>
                      Dana tetap berada di rekening ini. Jumlah yang dicatat hanya menambah alokasi dan progres target, tanpa mengubah saldo rekening.
                    </p>
                  )}
                </>
              )}

              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, color: theme.textSecondary }}>Tanggal</label>
                <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} style={{ ...styles.minimalInput, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textMain }} />
              </div>
              <div style={styles.inputGroup}>
                  <label style={{ ...styles.label, color: theme.textSecondary }}>{category === 'Emergency Savings' ? 'Jumlah alokasi dana darurat' : 'Jumlah Uang'}</label>
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

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: '14px', color: theme.textSecondary, fontSize: '0.8rem', lineHeight: 1.4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={syncHistoryWithDashboard}
                onChange={(event) => setSyncHistoryWithDashboard(event.target.checked)}
                style={{ marginTop: '2px', accentColor: theme.accent }}
              />
              <span>Ikuti filter dashboard (dompet dan periode)</span>
            </label>

            <div style={{ ...styles.historyList, maxHeight: '60vh', overflowY: 'auto', gap: '10px' }}>
              {filteredTransactions.map((tx) => {
                const isEmergencyAllocation = tx.category === 'Emergency Savings' && Number(tx.goal_contribution) > 0;
                const isExpense = tx.amount < 0 && !isEmergencyAllocation;
                return (
                  <div key={tx.id} style={{ ...styles.historyCard, backgroundColor: theme.cardBg, borderColor: theme.border }}>
                    <div style={styles.txMeta}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ ...styles.txCat, color: theme.textMain }}>{t.cats[tx.category] || tx.category}</span>
                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: theme.inputBg, color: theme.textSecondary, fontWeight: '700' }}>
                          {getWalletBadge(tx.wallet_id)}
                        </span>
                      </div>
                      {tx.description && <span style={{ ...styles.txDesc, color: theme.textSecondary }}>{tx.description}</span>}
                      <span style={{ fontSize: '0.7rem', color: theme.textSecondary, marginTop: '2px' }}>{formatDateStr(tx.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{ ...styles.txAmount, color: isExpense ? theme.expenseColor : theme.incomeColor }}>
                        {isEmergencyAllocation
                          ? `Alokasi Rp ${Number(tx.goal_contribution).toLocaleString('id-ID')}`
                          : `${isExpense ? '- ' : '+ '}Rp ${Number(Math.abs(tx.amount)).toLocaleString('id-ID')}`}
                      </span>
                      <button onClick={() => setPendingDelete({ kind: 'transaction', payload: tx })} style={{ background: 'none', border: 'none', color: theme.expenseColor, fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
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
                    <button onClick={() => setPendingDelete({ kind: 'wishlist', payload: g.id })} style={{ ...styles.iconBtn, color: '#e11d48' }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {pendingDelete && (
        <div style={{ ...styles.modalOverlay, zIndex: 1100 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" style={{ ...styles.modalContent, maxWidth: '360px', borderRadius: '20px', padding: '22px', backgroundColor: theme.bg, border: theme.border }}>
            <h2 id="delete-dialog-title" style={{ ...styles.modalTitle, color: theme.textMain, marginBottom: '10px' }}>Konfirmasi hapus</h2>
            <p style={{ color: theme.textSecondary, fontSize: '0.85rem', marginBottom: '18px' }}>
              {pendingDelete.kind === 'transaction'
                ? 'Transaksi akan dihapus dan saldo dompet disesuaikan.'
                : pendingDelete.kind === 'budget'
                  ? 'Batas anggaran untuk kategori dan scope ini akan dihapus. Transaksi tetap aman.'
                  : 'Target wishlist ini akan dihapus.'}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setPendingDelete(null)} style={{ ...styles.cancelBtn, color: theme.textMain, backgroundColor: theme.inputBg }}>Batal</button>
              <button onClick={confirmDelete} style={{ ...styles.cancelBtn, color: '#fff', backgroundColor: theme.expenseColor }}>Hapus</button>
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
  modalContent: { width: '100%', maxWidth: '420px', maxHeight: 'calc(100dvh - 32px)', boxSizing: 'border-box', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '30px 20px max(24px, env(safe-area-inset-bottom))', boxShadow: '0 -10px 30px rgba(0,0,0,0.1)', overflowY: 'auto', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', flexShrink: 1 },
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
  segmentBtn: { padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: 'transparent', fontSize: '0.85rem', cursor: 'pointer' },
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
  modalOverlay: { position: 'fixed', inset: 0, padding: '16px 0', boxSizing: 'border-box', overflowY: 'auto', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 1000, backdropFilter: 'blur(2px)' },
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
