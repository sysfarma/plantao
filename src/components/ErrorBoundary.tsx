import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, WifiOff, Lock } from 'lucide-react';
import type { FirestoreErrorInfo } from '../lib/firebaseError';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  firestoreErrorInfo: FirestoreErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
  }

  public state: State = {
    hasError: false,
    error: null,
    firestoreErrorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    let firestoreErrorInfo: FirestoreErrorInfo | null = null;
    
    try {
      // Try to parse the error message as JSON (from handleFirestoreError)
      firestoreErrorInfo = JSON.parse(error.message);
    } catch (e) {
      // Not a JSON error message
    }

    return { hasError: true, error, firestoreErrorInfo };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const { firestoreErrorInfo, error } = this.state;

      // Check for specific Firestore errors
      const isOffline = firestoreErrorInfo?.error.includes('the client is offline') || error?.message.includes('the client is offline');
      const isPermissionDenied = firestoreErrorInfo?.error.includes('Missing or insufficient permissions') || error?.message.includes('Missing or insufficient permissions');

      if (isOffline) {
        return (
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <WifiOff className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Sem Conexão</h1>
              <p className="text-gray-600 mb-6">
                Não foi possível conectar ao banco de dados. Verifique sua conexão com a internet ou a configuração do Firebase.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 transition-colors"
              >
                Tentar Novamente
              </button>
            </div>
          </div>
        );
      }

      if (isPermissionDenied) {
        return (
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h1>
              <p className="text-gray-600 mb-6">
                Você não tem permissão para acessar ou modificar estes dados.
              </p>
              {firestoreErrorInfo && (
                <div className="text-left bg-gray-100 p-3 rounded text-xs text-gray-500 overflow-auto mb-6">
                  <p><strong>Operação:</strong> {firestoreErrorInfo.operationType}</p>
                  <p><strong>Caminho:</strong> {firestoreErrorInfo.path}</p>
                </div>
              )}
              <button 
                onClick={() => window.location.href = '/'}
                className="w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 transition-colors"
              >
                Voltar ao Início
              </button>
            </div>
          </div>
        );
      }

      // Generic Error Fallback
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Ops! Algo deu errado.</h1>
            <p className="text-gray-600 mb-6">
              Ocorreu um erro inesperado na aplicação.
            </p>
            <details className="text-left bg-gray-100 p-3 rounded text-xs text-gray-500 overflow-auto mb-6 cursor-pointer">
              <summary className="font-bold mb-2">Detalhes do Erro</summary>
              <pre className="whitespace-pre-wrap">{error?.message}</pre>
            </details>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
