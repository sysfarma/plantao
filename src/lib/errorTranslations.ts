export const translateError = (error: any): string => {
  let message = typeof error === 'string' ? error : error?.message || '';
  
  // Handle JSON-encoded errors from handleFirestoreError
  try {
    if (message.startsWith('{') && message.endsWith('}')) {
      const parsed = JSON.parse(message);
      if (parsed.error) message = parsed.error;
    }
  } catch (e) { /* ignore parse error */ }
  
  // Firebase Auth Errors
  if (message.includes('auth/user-not-found')) return 'Usuário não encontrado.';
  if (message.includes('auth/wrong-password')) return 'Senha incorreta.';
  if (message.includes('auth/invalid-email')) return 'E-mail inválido.';
  if (message.includes('auth/email-already-in-use')) return 'Este e-mail já está em uso.';
  if (message.includes('auth/weak-password')) return 'A senha é muito fraca.';
  if (message.includes('auth/popup-closed-by-user')) return 'O login foi cancelado.';
  
  // Firestore / Permission Errors
  if (message.includes('insufficient permissions') || message.includes('permission-denied') || message.includes('PERMISSION_DENIED')) {
    return 'Seu acesso expirou ou você não tem permissão para esta ação.';
  }
  
  if (message.includes('quota-exceeded') || message.includes('Quota exceeded') || message.includes('RESOURCE_EXHAUSTED')) {
    return 'O sistema está temporariamente sobrecarregado. Tente novamente em instantes.';
  }

  if (message.includes('Rate exceeded') || message.includes('Rate limit') || message.includes('429')) {
    return 'Muitas solicitações em pouco tempo. Por favor, aguarde alguns instantes.';
  }

  if (message.includes('SERVER_OVERLOAD') || message.includes('503') || message.includes('Deadline Exceeded')) {
    return 'O servidor está sobrecarregado ou demorou a responder. Tente novamente em instantes.';
  }

  if (message.includes('network-request-failed') || message.includes('Failed to fetch')) {
    return 'Falha na conexão. Verifique sua internet ou tente novamente.';
  }

  // Mercado Pago common technical strings
  if (message.includes('Unauthorized use of live credentials')) {
    return 'Configuração de pagamento incompleta (Credenciais de Produção).';
  }

  // Custom API Errors
  if (message.includes('Pharmacy not active')) return 'Esta farmácia ainda não foi ativada.';
  if (message.includes('Subscription required')) return 'É necessário uma assinatura ativa.';
  
  return 'Ocorreu um erro inesperado. Tente novamente.';
};
