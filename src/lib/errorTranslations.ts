export const translateError = (error: any): string => {
  const message = typeof error === 'string' ? error : error?.message || '';
  
  // Firebase Auth Errors
  if (message.includes('auth/user-not-found')) return 'Usuário não encontrado.';
  if (message.includes('auth/wrong-password')) return 'Senha incorreta.';
  if (message.includes('auth/invalid-email')) return 'E-mail inválido.';
  if (message.includes('auth/email-already-in-use')) return 'Este e-mail já está em uso.';
  if (message.includes('auth/weak-password')) return 'A senha é muito fraca.';
  if (message.includes('auth/popup-closed-by-user')) return 'O login foi cancelado.';
  
  // Firestore / Permission Errors
  if (message.includes('insufficient permissions') || message.includes('permission-denied')) {
    return 'Você não tem permissão para realizar esta ação.';
  }
  
  if (message.includes('quota-exceeded')) {
    return 'Limite de uso excedido. Tente novamente amanhã.';
  }

  if (message.includes('network-request-failed')) {
    return 'Falha na conexão. Verifique sua internet.';
  }

  // Custom API Errors
  if (message.includes('Pharmacy not active')) return 'Esta farmácia ainda não foi ativada.';
  if (message.includes('Subscription required')) return 'É necessário uma assinatura ativa.';
  
  return 'Ocorreu um erro inesperado. Tente novamente.';
};
