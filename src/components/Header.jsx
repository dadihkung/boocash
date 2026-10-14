import styles from './Header.module.css';

export default function Header({ showGreeting, isDarkMode, onToggleTheme, theme }) {
  return (
    <>
      <div className={styles.utilityBar}>
        <button
          type="button"
          onClick={onToggleTheme}
          className={styles.themeButton}
          style={{ backgroundColor: theme.cardBg, color: theme.textSecondary }}
        >
          {isDarkMode ? '☀️ Terang' : '🌙 Gelap'}
        </button>
      </div>
      <header className={styles.header}>
        {showGreeting && <div style={{ color: theme.accent, fontWeight: 600, marginBottom: 10 }}>I love you, Bobooo! 💖</div>}
        <h1 className={styles.title} style={{ color: theme.textMain }}>BooCash</h1>
        <p className={styles.subtitle} style={{ color: theme.textSecondary }}>Mencatat masa depan kita bersama</p>
      </header>
    </>
  );
}