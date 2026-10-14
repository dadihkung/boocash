import styles from './WalletList.module.css';

export default function WalletList({ wallets, theme, formatAmount, onEdit }) {
  return (
    <section className={styles.wallets}>
      {wallets.map((wallet) => (
        <div
          key={wallet.id}
          className={styles.wallet}
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <div className={styles.walletHeading}>
            <span className={styles.label} style={{ color: theme.textSecondary }}>
              {wallet.icon || '🏦'} {wallet.display_name || wallet.name}
            </span>
            <button
              type="button"
              onClick={() => onEdit(wallet)}
              className={styles.editButton}
              aria-label={`Edit saldo ${wallet.display_name || wallet.name}`}
              title="Edit saldo"
            >
              ✏️
            </button>
          </div>
          <span className={styles.amount} style={{ color: theme.textMain }}>
            Rp {formatAmount(wallet.balance)}
          </span>
        </div>
      ))}
    </section>
  );
}