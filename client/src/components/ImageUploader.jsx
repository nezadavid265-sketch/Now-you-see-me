import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';
import { uploadImages } from '../lib/api.js';
import { cx, Spinner } from './ui/index.jsx';

/**
 * Multi-image uploader with reordering. Images are uploaded immediately
 * (validated and re-encoded by the server); the form submits their URLs.
 */
export function ImageUploader({ value = [], onChange, purpose = 'product', max = 8, error }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const pick = async (files) => {
    const list = [...files].slice(0, max - value.length);
    if (!list.length) return;
    const tooBig = list.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) return setUploadError(`${tooBig.name} is larger than 5 MB.`);
    setBusy(true);
    setUploadError('');
    try {
      const urls = await uploadImages(list, purpose);
      onChange([...value, ...urls.map((url) => ({ url, alt: '' }))]);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const move = (i, dir) => {
    const next = [...value];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {value.map((img, i) => (
          <div key={img.url} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            <img src={img.url} alt={img.alt || `Photo ${i + 1}`} className="size-full object-cover" />
            {i === 0 && (
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold text-white">
                <Star className="size-3 fill-white" /> Main
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-slate-900/70 to-transparent p-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <div className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded bg-white/90 p-1 text-slate-700 disabled:opacity-40" aria-label="Move left">
                  <ArrowLeft className="size-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="rounded bg-white/90 p-1 text-slate-700 disabled:opacity-40" aria-label="Move right">
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded bg-white/90 p-1 text-red-600" aria-label="Remove photo">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files);
            }}
            disabled={busy}
            className={cx(
              'flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm font-medium transition-colors',
              error ? 'border-red-300 text-red-600' : 'border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-700',
            )}
          >
            {busy ? <Spinner /> : <ImagePlus className="size-6" />}
            <span>{busy ? 'Uploading…' : 'Add photos'}</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple={max > 1} hidden onChange={(e) => pick(e.target.files)} />
      <p className="mt-2 text-xs text-slate-500">JPEG, PNG or WebP up to 5 MB. The first photo is shown in search results. {value.length}/{max}</p>
      {(uploadError || error) && <p className="mt-1 text-sm text-red-600">{uploadError || error}</p>}
    </div>
  );
}

/** Single-image variant (logos, banners). */
export function SingleImageUpload({ value, onChange, purpose, label, aspect = 'aspect-square', className }) {
  return (
    <div className={className}>
      {label && <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>}
      {value ? (
        <div className={cx('relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100', aspect)}>
          <img src={value} alt="" className="size-full object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 text-red-600 shadow" aria-label="Remove image">
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : (
        <ImageUploader value={[]} max={1} purpose={purpose} onChange={(imgs) => onChange(imgs[0]?.url ?? null)} />
      )}
    </div>
  );
}
