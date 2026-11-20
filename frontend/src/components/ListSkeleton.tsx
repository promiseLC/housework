export function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="加载中">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="card"
          style={{ height: 72, background: 'linear-gradient(90deg,#eee,#f7f7f7,#eee)', opacity: 0.8 }}
        />
      ))}
    </div>
  )
}
