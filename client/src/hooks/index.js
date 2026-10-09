import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Rivoshoppa` : "Rivoshoppa — Shop Rwanda's trusted sellers";
  }, [title]);
}

/** Form state with server-side validation errors mapped onto fields. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const set = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const field = (name) => ({
    name,
    value: values[name] ?? '',
    error: errors[name],
    onChange: (e) => set(name, e.target.type === 'checkbox' ? e.target.checked : e.target.value),
  });

  const submit = (fn) => async (e) => {
    e?.preventDefault?.();
    setSubmitting(true);
    setFormError('');
    setErrors({});
    try {
      await fn(values);
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      setFormError(err.message ?? 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return { values, setValues, set, field, errors, setErrors, submitting, formError, setFormError, submit };
}

/** List filters stored in the URL so they survive reloads and can be shared. */
export function useListParams(defaults) {
  const [params, setParams] = useSearchParams();
  const values = useMemo(() => ({ ...defaults, ...Object.fromEntries(params) }), [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = useCallback(
    (patch) => {
      const next = { ...values, ...patch };
      if (!('page' in patch)) delete next.page;
      for (const [k, v] of Object.entries(next)) if (v === '' || v === undefined || v === null || defaults[k] === v) delete next[k];
      setParams(next, { replace: true });
    },
    [values, setParams, defaults],
  );
  return [values, update];
}
