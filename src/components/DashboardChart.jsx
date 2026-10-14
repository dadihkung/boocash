import styles from './DashboardChart.module.css';

export default function DashboardChart({ data, colors, theme, formatAmount }) {
  if (data.length === 0) {
    return <p className={styles.empty} style={{ color: theme.textSecondary }}>Belum ada pengeluaran di filter ini.</p>;
  }

  return (
    <div
      className={styles.chart}
      style={{ '--chart-text': theme.textMain, '--chart-track': theme.inputBg }}
    >
      <div className={styles.categories}>
        {data.map((entry, index) => (
          <div key={entry.category}>
            <div className={styles.categoryLine}>
              <span className={styles.categoryName}>{entry.name}</span>
              <strong className={styles.amount}>Rp {formatAmount(entry.value)}</strong>
            </div>
            <div className={styles.track}>
              <div
                className={styles.bar}
                style={{
                  width: `${Math.max(4, (entry.value / data[0].value) * 100)}%`,
                  backgroundColor: colors[index % colors.length]
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}