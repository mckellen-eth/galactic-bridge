// Безпечний fetch: якщо сервер повернув не-JSON (напр. таймаут nginx → HTML
// сторінка помилки), даємо зрозуміле повідомлення замість "Unexpected token '<'".
//
// Спільна функція для App.jsx і CustomTokenModal.jsx — раніше модалка робила
// голий fetch().then(r => r.json()) і показувала користувачу помилку розбору JSON
// замість справжньої причини.
export async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (r.status >= 500) {
      throw new Error('Search took too long on the server. Please try again in a moment, or add the OFT contract manually.');
    }
    throw new Error(`Server returned an unexpected response (${r.status}).`);
  }
  return r.json();
}

export default fetchJson;
