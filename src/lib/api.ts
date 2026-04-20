export async function safeJsonFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type');
  
  if (contentType && contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Erro na API: ${res.status}`);
    }
    return data;
  } else {
    const text = await res.text();
    if (!res.ok) {
      // If we got "Rate exceeded." as plain text, throw it clearly
      throw new Error(text || `Erro do servidor: ${res.status}`);
    }
    return text; // Fallback to text if success but not JSON
  }
}
