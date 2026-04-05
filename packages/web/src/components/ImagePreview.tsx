export function ImagePreview({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt="Preview" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 rounded-full bg-zinc-800 px-2.5 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          x
        </button>
      </div>
    </div>
  );
}
