import { useState } from 'react'

const KEY = 'household-pay.pwaHintSeen'

export function PwaHint() {
  const [seen, setSeen] = useState(() => localStorage.getItem(KEY) === '1')
  if (seen) return null
  return (
    <div className="hint" style={{ marginBottom: 12 }}>
      用 Safari 打开本页，点底部分享，再选择「添加到主屏幕」，以后就能像 App 一样点图标使用。首版不做通知提醒。
      <button
        type="button"
        style={{ display: 'block', marginTop: 8, color: '#1849b5', background: 'none', border: 0, padding: 0, minHeight: 44 }}
        onClick={() => {
          localStorage.setItem(KEY, '1')
          setSeen(true)
        }}
      >
        知道了
      </button>
    </div>
  )
}
