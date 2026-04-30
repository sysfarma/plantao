export async function safeJsonFetch<T = any>(url: string, options: any = {}, retries = 2): Promise<T> {
  let finalUrl = url;
  if (options.query) {
    const params = new URLSearchParams();
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    const queryString = params.toString();
    if (queryString) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryString;
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(finalUrl, options);
      
      if (res.status === 429 || res.status === 503) {
        throw new Error(`SERVER_OVERLOAD:${res.status}`);
      }

      const contentType = res.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Erro na API: ${res.status}`);
        }
        return data as T;
      } else {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || `Erro do servidor: ${res.status}`);
        }
        return text as any; // Fallback to text
      }
    } catch (err: any) {
      const isOverload = err.message.includes('SERVER_OVERLOAD') || 
                        err.message.includes('Rate exceeded') || 
                        err.message.includes('Quota exceeded');

      if (attempt === retries || !isOverload) throw err;
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`API attempt ${attempt + 1} failed due to rate limits, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Falha após múltiplas tentativas devido a limites de taxa do servidor.');
}
