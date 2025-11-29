import React, { useState, useEffect, useMemo } from 'react';
import { 
  initializeApp, 
  getApps, 
  getApp 
} from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer
} from 'recharts';
import { 
  LayoutDashboard, 
  MapPin, 
  Plus, 
  AlertTriangle, 
  Coins, 
  TrendingUp, 
  Package, 
  Trash2,
  ArrowUpRight,
  Sparkles,
  Loader2,
  Lightbulb,
  Wifi,
  ChevronLeft
} from 'lucide-react';

// --- Variáveis de Ambiente (Garantidas pelo Canvas) ---

const MOCK_FIREBASE_CONFIG = {
  projectId: "mock-vending-manager-12345",
  apiKey: "AIzaSy_MOCK_KEY_DO_NOT_USE",
  authDomain: "mock-vending-manager.firebaseapp.com",
  messagingSenderId: "1234567890",
  appId: "1:234567890:web:mock1234567890",
  storageBucket: "mock-vending-manager.appspot.com"
};

// Use as configurações reais da sua ENV:
const firebaseConfigString = '{"apiKey":"AIzaSyA8ly0McGkwbo-JiJsF0ZzAXMA30Mysvvo","authDomain":"vending-manager-app-cc60b.firebaseapp.com","projectId":"vending-manager-app-cc60b","storageBucket":"vending-manager-app-cc60b.firebasestorage.app","messagingSenderId":"686687292222","appId":"1:686687292222:web:847db02734c30b9f8f7a6f"}';
const appId = "vending-app-producao"; // Usando o ID da ENV

// Garante que estamos usando o nome de variável global correto (__initial_auth_token)
const initialAuthToken = (typeof __initial_auth_token !== 'undefined' && __initial_auth_token)
    ? __initial_auth_token
    : null; 

const apiKey = "AIzaSyBIDerKk3YtmifDd4PEvWOyX7_m5_855K8"; // Usando a chave da sua ENV

/**
 * Chama a API Gemini com Exponential Backoff para robustez.
 * @param {string} prompt O texto do prompt a ser enviado.
 * @returns {Promise<string>} O texto gerado pela IA ou mensagem de erro.
 */
const callGemini = async (prompt) => {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      }

      throw new Error(`Falha na API Gemini. Status: ${response.status}`);

    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error("Erro Gemini após todas as tentativas:", error);
        return "Não foi possível gerar a análise no momento. Tente novamente mais tarde.";
      }

      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }
};

// --- Componentes UI Reutilizáveis com Estilos JS ---

const Card = ({ children, style = {} }) => (
  <div 
    style={{
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)', // shadow-lg
      border: '1px solid #f3f4f6', // border-gray-100
      padding: '16px',
      transition: 'all 0.3s',
      ...style
    }}
  >
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', style = {}, disabled = false }) => {
  const baseStyle = {
    padding: '8px 16px',
    borderRadius: '12px',
    fontWeight: '500',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: 'none',
    width: '100%',
  };
  
  let variantStyle = {};
  switch (variant) {
    case 'primary':
      variantStyle = {
        backgroundColor: '#2563eb', // blue-600
        color: 'white',
        boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)', // shadow-blue-300
      };
      break;
    case 'secondary':
      variantStyle = {
        backgroundColor: 'white',
        color: '#4b5563', // gray-700
        border: '1px solid #e5e7eb', // border-gray-200
      };
      break;
    case 'danger':
      variantStyle = {
        backgroundColor: '#fef2f2', // red-50
        color: '#dc2626', // red-600
        border: '1px solid #fee2e2', // border-red-100
      };
      break;
    case 'success':
      variantStyle = {
        backgroundColor: '#059669', // emerald-600
        color: 'white',
        boxShadow: '0 4px 6px -1px rgba(52, 211, 153, 0.3)', // shadow-emerald-300
      };
      break;
    case 'ai':
      variantStyle = {
        background: 'linear-gradient(to right, #8b5cf6, #e879f9)', // violet-600 to fuchsia-600
        color: 'white',
        boxShadow: '0 4px 6px -1px rgba(139, 92, 246, 0.3)', // shadow-violet-300
      };
      break;
    default:
      break;
  }
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      style={{...baseStyle, ...variantStyle, ...style}}
    >
      {children}
    </button>
  );
};

const Input = ({ label, style = {}, ...props }) => (
  <div style={{ marginBottom: '12px' }}>
    <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px', marginLeft: '4px' }}>{label}</label>
    <input 
      style={{
        width: '100%',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        outline: 'none',
        transition: 'all 0.2s',
        backgroundColor: 'white',
        color: '#1f2937',
        fontSize: '14px',
        boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        ...style
      }}
      {...props} 
    />
  </div>
);

const AIAnalysisBox = ({ content, onClose, isLoading }) => {
  if (!content && !isLoading) return null;
  
  const aiBoxStyle = {
    marginTop: '16px',
    backgroundColor: '#f5f3ff', // violet-50
    border: '1px solid #ddd6fe', // violet-200
    borderRadius: '12px',
    padding: '16px',
    boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  };

  return (
    <div style={aiBoxStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <h4 style={{ fontWeight: '700', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} style={{ color: '#a78bfa' }}/> Análise Inteligente
        </h4>
        {!isLoading && (
          <button onClick={onClose} style={{ color: '#c4b5fd', fontSize: '12px', border: 'none', background: 'none', cursor: 'pointer' }}>Fechar</button>
        )}
      </div>
      
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#7c3aed', padding: '16px 0' }}>
          <Loader2 style={{ animation: 'spin 1s linear infinite' }} size={18} />
          <span style={{ fontSize: '14px' }}>Consultando IA, aguarde...</span>
        </div>
      ) : (
        <div style={{ color: '#4c1d95', fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
          {content}
        </div>
      )}
      {/* CSS para a animação de spin, se for necessário */}
      <style>
      {`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}
      </style>
    </div>
  );
};

// --- Componente Principal ---

export default function VendingMachineApp() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [machines, setMachines] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState(null); 
  const [auth, setAuth] = useState(null); 
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [firebaseError, setFirebaseError] = useState(null);

  // --- Autenticação e Inicialização do Firebase ---
  
  useEffect(() => {
    const initializeFirebase = async () => {
      let firebaseConfig = {};
      
      try {
        const firebaseConfigString = '{"apiKey":"AIzaSyA8ly0McGkwbo-JiJsF0ZzAXMA30Mysvvo","authDomain":"vending-manager-app-cc60b.firebaseapp.com","projectId":"vending-manager-app-cc60b","storageBucket":"vending-manager-app-cc60b.firebasestorage.app","messagingSenderId":"686687292222","appId":"1:686687292222:web:847db02734c30b9f8f7a6f"}';
        firebaseConfig = JSON.parse(firebaseConfigString);
      } catch (e) {
        setFirebaseError(`Erro CRÍTICO: Falha ao analisar JSON da configuração. Erro: ${e.message}`);
        setLoading(false);
        return;
      }
      
      const isUsingMock = firebaseConfig.projectId === MOCK_FIREBASE_CONFIG.projectId;
      
      if (isUsingMock) {
        setFirebaseError(
          `ATENÇÃO (MODO MOCK): O ambiente de execução não forneceu a configuração correta do Firebase. O aplicativo está usando uma configuração dummy ('${MOCK_FIREBASE_CONFIG.projectId}').\n\n- O banco de dados não funcionará. Você pode navegar, mas não salvará dados.`
        );
      }
      
      try {
        const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
        const authInstance = getAuth(app);
        const firestoreInstance = getFirestore(app);

        setAuth(authInstance);
        setDb(firestoreInstance);
        
        // Autenticação (Custom Token ou Anônima)
        if (initialAuthToken) {
          await signInWithCustomToken(authInstance, initialAuthToken);
        } else {
          // Nota: Esta é a linha que exige o Anonymous Sign-in habilitado no Firebase Console.
          await signInAnonymously(authInstance); 
        }
        
        const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
          setUser(currentUser);
        });
        
        return () => unsubscribe();

      } catch (e) {
        if (e.code !== 'auth/configuration-not-found') { // Ignora o erro se for apenas a falta de config
            console.error("Erro CRÍTICO ao inicializar o Firebase:", e);
            setFirebaseError(`Erro de conexão:\n${e.message}\n\nVerifique as regras ou permissões de autenticação.`);
        }
        setLoading(false); 
      }
    };
    
    initializeFirebase();
  }, []);

  // --- Carregamento de Dados (onSnapshot) ---

  useEffect(() => {
    if (!user || !db || firebaseError) {
      if (!user || !db) setLoading(true);
      if (firebaseError) setLoading(false);
      return; 
    }

    const machinePath = ['artifacts', appId, 'users', user.uid, 'machines'];
    const transactionsPath = ['artifacts', appId, 'users', user.uid, 'transactions'];

    const unsubMachines = onSnapshot(collection(db, ...machinePath), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMachines(data);
    }, (error) => console.error("Erro ao carregar máquinas:", error));

    const unsubTrans = onSnapshot(collection(db, ...transactionsPath), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        date: doc.data().createdAt instanceof Timestamp ? doc.data().createdAt.toDate() : (doc.data().createdAt || new Date())
      }));
      // Ordenar por data decrescente (em memória)
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(data);
      setLoading(false);
    }, (error) => console.error("Erro ao carregar transações:", error));

    return () => {
      unsubMachines();
      unsubTrans();
    };
  }, [user, db, firebaseError]);

  // Limpar estado da IA ao trocar de tela
  useEffect(() => {
    setAiResult(null);
    setAiLoading(false);
  }, [view, selectedMachine]);

  // --- Lógica de Negócios e Cálculos ---

  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const stats = useMemo(() => {
    const totalMachines = machines.length;
    let totalRevenue = 0;
    let totalCost = 0;
    let criticalStock = 0;
    let unprofitable = 0;

    transactions.forEach(t => {
      totalRevenue += (Number(t.amount) || 0);
      totalCost += (Number(t.cost) || 0);
    });

    machines.forEach(m => {
      if ((m.currentStock / m.capacity) < 0.25) criticalStock++;
      
      const machineRevenue = transactions
        .filter(t => t.machineId === m.id)
        .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      
      // Definição de "unprofitable" pode ser ajustada. Aqui: menos de R$50.00 de receita (e com alguma venda)
      if (machineRevenue < 50 && machineRevenue > 0) unprofitable++; 
    });

    return { 
      totalMachines, 
      totalRevenue, 
      netProfit: totalRevenue - totalCost,
      criticalStock,
      unprofitable 
    };
  }, [machines, transactions]);

  // --- Funções IA ---

  const checkDbReady = () => {
    if (!user || !db || firebaseError) {
      const msg = "ERRO: Não é possível salvar/deletar. Firebase/Autenticação não inicializada ou está em modo MOCK.";
      setAiResult(msg);
      console.error(msg);
      return false;
    }
    return true;
  }

  const handleGlobalAnalysis = async () => {
    if (!apiKey) {
      setAiResult("ERRO: A chave da API Gemini não foi configurada. Não é possível gerar análise.");
      return;
    }
    setAiLoading(true);
    setAiResult(null);

    const prompt = `
      Atue como um consultor sênior de operações de Vending Machines.
      Analise os dados do meu negócio hoje:
      - Total de Máquinas: ${stats.totalMachines}
      - Faturamento Total Acumulado: ${formatCurrency(stats.totalRevenue)}
      - Lucro Líquido Estimado: ${formatCurrency(stats.netProfit)}
      - Máquinas com Estoque Crítico (<25%): ${stats.criticalStock}
      - Máquinas com Baixo Desempenho: ${stats.unprofitable}

      Por favor, forneça:
      1. Uma breve avaliação da saúde do negócio (1 frase).
      2. Três ações prioritárias para eu fazer hoje para melhorar o lucro ou a operação.
      Seja direto, motivador e use emojis. Responda em português.
    `;

    const result = await callGemini(prompt);
    setAiResult(result);
    setAiLoading(false);
  };

  const handleMachineAnalysis = async () => {
    if (!selectedMachine) return;
    if (!apiKey) {
      setAiResult("ERRO: A chave da API Gemini não foi configurada. Não é possível gerar análise.");
      return;
    }
    setAiLoading(true);
    setAiResult(null);

    const machineHistory = transactions
      .filter(t => t.machineId === selectedMachine.id)
      .slice(0, 5)
      .map(t => `${new Date(t.date).toLocaleDateString()}: R$${t.amount} (Repos: ${t.restocked})`)
      .join('\n');

    const prompt = `
      Analise esta Vending Machine específica e me dê consultoria:
      - Nome: ${selectedMachine.name}
      - Localização: ${selectedMachine.location}
      - Tipo de Produto: ${selectedMachine.type}
      - Preço da Jogada: ${formatCurrency(selectedMachine.pricePerPlay)}
      - Estoque Atual: ${selectedMachine.currentStock}/${selectedMachine.capacity}
      
      Histórico Recente de Coletas:
      ${machineHistory || "Sem histórico recente."}

      Com base no tipo de local e no histórico, o que devo fazer?
      Sugira se devo manter, mudar o produto, ajustar preço ou mudar de local.
      Dê 3 dicas curtas e práticas (bullet points).
    `;

    const result = await callGemini(prompt);
    setAiResult(result);
    setAiLoading(false);
  };

  // --- Ações (Firestore) ---

  const handleAddMachine = async (e) => {
    e.preventDefault();
    if (!checkDbReady()) return;

    const form = e.target;
    const newMachine = {
      name: form.name.value,
      location: form.location.value,
      type: form.type.value,
      pricePerPlay: parseFloat(form.price.value),
      costPerItem: parseFloat(form.cost.value),
      capacity: parseInt(form.capacity.value),
      currentStock: parseInt(form.capacity.value),
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'machines'), newMachine);
      setView('machines');
    } catch (error) {
      console.error("Erro ao salvar máquina:", error);
      setAiResult("Erro ao salvar máquina. Verifique a conexão com o banco de dados.");
    }
  };

  const handleAddCollection = async (e) => {
    e.preventDefault();
    if (!checkDbReady()) return;
    
    const form = e.target;
    const collectedAmount = parseFloat(form.amount.value);
    const restockedAmount = parseInt(form.restock.value) || 0;
    
    if (!selectedMachine) return;

    const cost = restockedAmount * selectedMachine.costPerItem;

    try {
      // 1. Criar transação
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), {
        machineId: selectedMachine.id,
        machineName: selectedMachine.name,
        amount: collectedAmount,
        cost: cost,
        restocked: restockedAmount,
        type: 'collection',
        createdAt: serverTimestamp()
      });

      // 2. Atualizar estoque da máquina
      const itemsSoldEstimate = Math.floor(collectedAmount / selectedMachine.pricePerPlay);
      
      let newStock = selectedMachine.currentStock - itemsSoldEstimate + restockedAmount;
      if (newStock > selectedMachine.capacity) newStock = selectedMachine.capacity;
      if (newStock < 0) newStock = 0;

      const machineRef = doc(db, 'artifacts', appId, 'users', user.uid, 'machines', selectedMachine.id);
      await updateDoc(machineRef, {
        currentStock: newStock,
        lastCollection: serverTimestamp()
      });

      // Limpar formulário após sucesso
      form.reset();
      
      setView('details');
    } catch (error) {
      console.error("Erro ao adicionar coleta:", error);
      setAiResult("Erro ao registrar a coleta. Verifique o formulário e a conexão.");
    }
  };

  const handleDeleteMachine = async () => {
    if (!checkDbReady() || !selectedMachine) return;
    
    const machineRef = doc(db, 'artifacts', appId, 'users', user.uid, 'machines', selectedMachine.id);
    try {
      await deleteDoc(machineRef);
      setView('machines');
      setSelectedMachine(null);
    } catch (error) {
      console.error("Erro ao deletar máquina:", error);
      setAiResult("Erro ao deletar máquina. Tente novamente.");
    }
  }

  // --- Renderização de Views ---
  
  // Estilos de container fixos para garantir a aparência mobile
  const appContainerStyle = {
    backgroundColor: '#f9fafb', // gray-50
    minHeight: '100vh',
    paddingBottom: '80px', // Espaço para a navbar fixa
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: '#1f2937', // gray-800
  };

  const headerStyle = {
    backgroundColor: '#2563eb', // blue-600
    color: 'white',
    padding: '16px',
    position: 'sticky',
    top: 0,
    zIndex: 20,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  };

  const mainContentStyle = {
    padding: '16px',
    maxWidth: '512px', // max-w-lg
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px' // space-y-6
  };

  const navBarStyle = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTop: '1px solid #e5e7eb', // border-gray-200
    boxShadow: '0 -10px 15px -3px rgba(0, 0, 0, 0.1)', // shadow-2xl
    zIndex: 30,
  };

  // Bloqueio de erro crítico
  if (firebaseError && firebaseError.includes("CRÍTICO")) return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', 
      backgroundColor: '#fef2f2', padding: '32px', color: '#991b1b', textAlign: 'center', 
      fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', borderRadius: '12px', margin: '16px', 
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)', border: '1px solid #fca5a5'
    }}>
      <AlertTriangle size={32} style={{ marginBottom: '16px', color: '#ef4444' }} />
      <h2 style={{ fontWeight: 'bold', fontSize: '20px', marginBottom: '12px' }}>ERRO CRÍTICO DE CONEXÃO DO FIREBASE</h2>
      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fee2e2', borderRadius: '8px', textAlign: 'left', fontSize: '12px', fontFamily: 'monospace', width: '100%', maxWidth: '320px' }}>
        <p style={{ fontWeight: '600', marginBottom: '4px' }}>Detalhes da Falha:</p>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{firebaseError}</pre>
      </div>
      <p style={{ fontSize: '14px', marginTop: '16px', color: '#dc2626' }}>Por favor, corrija o erro de configuração no ambiente para usar o aplicativo.</p>
    </div>
  );

  if (loading) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#2563eb', animation: 'pulse 1.5s infinite' }}>Carregando seus negócios...<style>{`@keyframes pulse {0%, 100% {opacity: 1;} 50% {opacity: .5;}}`}</style></div>;

  return (
    <div style={appContainerStyle}>
      
      <header style={headerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '512px', margin: '0 auto' }}>
          <h1 style={{ fontWeight: '800', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Coins size={24} />
            Vending Manager
          </h1>
          <div style={{ fontSize: '12px', backgroundColor: '#1d4ed8', padding: '4px 12px', borderRadius: '9999px', fontWeight: '600' }}>
            {stats.totalMachines} Máqs.
          </div>
        </div>
      </header>

      <main style={mainContentStyle}>
        
        {/* AVISO MOCK */}
        {firebaseError && firebaseError.includes("MOCK") && (
          <div style={{ backgroundColor: '#fffbe1', borderLeft: '4px solid #f59e0b', padding: '16px', borderRadius: '8px', fontSize: '14px', color: '#92400e', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={18} /> MODO DE TESTE (MOCK)</div>
            <p style={{ marginTop: '4px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{firebaseError}</p>
          </div>
        )}

        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* AI Assistant Card */}
            <Card style={{ 
              background: 'linear-gradient(to right, #7c3aed, #4f46e5)', // violet-600 to indigo-600
              color: 'white',
              border: 'none', 
              padding: '20px', 
              overflow: 'hidden', 
              position: 'relative',
              boxShadow: '0 10px 15px -3px rgba(139, 92, 246, 0.3)',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, padding: '16px', opacity: 0.1 }}>
                <Sparkles size={100} />
              </div>
              <div style={{ position: 'relative', zIndex: 10 }}>
                <h3 style={{ fontWeight: 'bold', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Sparkles size={20} style={{ color: '#fcd34d' }} /> Consultor IA
                </h3>
                <p style={{ color: '#ddd6fe', fontSize: '14px', marginBottom: '16px' }}>
                  Obtenha uma análise estratégica e ações prioritárias para hoje.
                </p>
                <Button 
                  onClick={handleGlobalAnalysis} 
                  disabled={aiLoading}
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', color: 'white', border: 'none', width: '100%', fontSize: '14px', padding: '8px' }}
                >
                  {aiLoading ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} size={16} /> : "Gerar Relatório Estratégico"}
                </Button>
              </div>
            </Card>

            <AIAnalysisBox content={aiResult} isLoading={aiLoading} onClose={() => setAiResult(null)} />

            {/* Resumo Financeiro */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Card style={{ borderTop: '4px solid #2563eb' }}>
                <span style={{ color: '#6b7280', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Faturamento</span>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px', color: '#1f2937' }}>{formatCurrency(stats.totalRevenue)}</div>
              </Card>
              <Card style={{ borderTop: '4px solid #10b981' }}>
                <span style={{ color: '#6b7280', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Lucro Líquido</span>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {formatCurrency(stats.netProfit)}
                </div>
              </Card>
            </div>

            {/* Alertas */}
            {(stats.criticalStock > 0 || stats.unprofitable > 0) && (
              <Card style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                <h3 style={{ fontWeight: 'bold', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <AlertTriangle style={{ color: '#ef4444' }} size={18} /> Alertas de Operação
                </h3>
                {stats.criticalStock > 0 && (
                  <div style={{ fontSize: '14px', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: '1px solid #fde0e3', paddingTop: '8px' }}>
                    <span><b style={{ fontWeight: 'bold' }}>{stats.criticalStock} Máquinas</b> com estoque crítico.</span>
                    <Button variant="secondary" style={{ fontSize: '12px', padding: '4px 8px', height: 'auto', width: 'auto' }} onClick={() => setView('machines')}>Ver</Button>
                  </div>
                )}
                {stats.unprofitable > 0 && (
                  <div style={{ fontSize: '14px', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: '1px solid #fde0e3', paddingTop: '8px', marginTop: '8px' }}>
                    <span><b style={{ fontWeight: 'bold' }}>{stats.unprofitable} Máquinas</b> de baixo rendimento.</span>
                    <Button variant="secondary" style={{ fontSize: '12px', padding: '4px 8px', height: 'auto', width: 'auto' }} onClick={() => setView('machines')}>Ver</Button>
                  </div>
                )}
              </Card>
            )}

            {/* Gráfico */}
            <Card>
              <h3 style={{ fontWeight: 'bold', color: '#4b5563', marginBottom: '16px' }}>Fluxo de Caixa Recente</h3>
              <div style={{ height: '224px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[...transactions].reverse().slice(-10)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                        dataKey="date" 
                        tickFormatter={(date) => new Date(date).getDate() + '/' + (new Date(date).getMonth() + 1)} 
                        tick={{fontSize: 10}} 
                        padding={{ left: 20, right: 20 }}
                        minTickGap={10}
                    />
                    <YAxis 
                        tick={{fontSize: 10}} 
                        tickFormatter={(value) => formatCurrency(value).replace('R$', '')}
                    />
                    <RechartsTooltip 
                      formatter={(value) => [formatCurrency(value), 'Faturamento']} 
                      labelFormatter={(label) => new Date(label).toLocaleDateString('pt-BR')}
                    />
                    <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} dot={{ stroke: '#10b981', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* LISTA DE MÁQUINAS VIEW */}
        {view === 'machines' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 'bold', color: '#4b5563', fontSize: '18px' }}>Suas Máquinas ({machines.length})</h2>
              <Button onClick={() => setView('add-machine')} variant="primary" style={{ fontSize: '14px', padding: '8px 12px', width: 'auto' }}>
                <Plus size={16} /> Nova
              </Button>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              {machines.map(machine => {
                const stockPercent = (machine.currentStock / machine.capacity) * 100;
                const isCritical = stockPercent < 25;
                const statusColor = isCritical ? '#ef4444' : (stockPercent < 50 ? '#f59e0b' : '#10b981'); // red, amber, emerald

                return (
                  <Card key={machine.id} style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
                    <div onClick={() => { setSelectedMachine(machine); setView('details'); }} style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <h3 style={{ fontWeight: 'bold', color: '#1f2937' }}>{machine.name}</h3>
                          <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#6b7280', marginTop: '4px', gap: '4px' }}>
                            <MapPin size={12} style={{ color: '#60a5fa' }} /> {machine.location}
                          </div>
                        </div>
                        <div style={{ padding: '4px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: 'bold', color: 'white', backgroundColor: statusColor }}>
                          {stockPercent.toFixed(0)}%
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {machine.type} • {formatCurrency(machine.pricePerPlay)}/play
                        </div>
                        <div style={{ color: '#2563eb', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Detalhes <ArrowUpRight size={14} />
                        </div>
                      </div>
                    </div>
                    {/* Progress Bar Visual */}
                    <div style={{ height: '4px', width: '100%', backgroundColor: '#f3f4f6' }}>
                      <div 
                        style={{ height: '100%', transition: 'all 0.5s', backgroundColor: statusColor, width: `${stockPercent}%` }}
                      />
                    </div>
                  </Card>
                );
              })}
              {machines.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', border: '2px dashed #d1d5db', borderRadius: '12px' }}>
                  <p style={{ marginBottom: '8px' }}>Nenhuma máquina cadastrada.</p>
                  <Button onClick={() => setView('add-machine')} variant="secondary" style={{ fontSize: '14px', width: 'auto', padding: '8px 16px' }}>
                    <Plus size={16} /> Adicionar Agora
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DETALHES DA MÁQUINA VIEW */}
        {view === 'details' && selectedMachine && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <button 
                onClick={() => setView('machines')} 
                style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', fontWeight: '500', transition: 'color 0.2s', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <ChevronLeft size={16} /> Voltar à Lista
            </button>

            <Card style={{ borderTop: '4px solid #2563eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>{selectedMachine.name}</h2>
                    <p style={{ fontSize: '14px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} style={{ color: '#3b82f6' }}/> {selectedMachine.location}</p>
                </div>
                <div style={{ textAlign: 'right', backgroundColor: '#eff6ff', padding: '12px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: '600', textTransform: 'uppercase' }}>Estoque</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px', color: selectedMachine.currentStock < selectedMachine.capacity * 0.25 ? '#dc2626' : '#059669' }}>
                    {selectedMachine.currentStock}/{selectedMachine.capacity}
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                  <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '12px', textAlign: 'center', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                    <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Preço Venda</span>
                    <strong style={{ color: '#1f2937', fontSize: '18px' }}>{formatCurrency(selectedMachine.pricePerPlay)}</strong>
                  </div>
                  <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '12px', textAlign: 'center', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                    <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Custo Produto</span>
                    <strong style={{ color: '#1f2937', fontSize: '18px' }}>{formatCurrency(selectedMachine.costPerItem)}</strong>
                  </div>
              </div>

              {/* Botão AI Machine Analysis */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
                <Button 
                  onClick={handleMachineAnalysis} 
                  disabled={aiLoading}
                  variant="ai"
                  style={{ width: '100%', fontSize: '14px', padding: '8px' }}
                >
                  <Lightbulb size={16} style={{ color: '#facc15' }} /> 
                  {aiLoading ? "Consultando Ponto..." : "Auditar este Ponto com IA"}
                </Button>
                <AIAnalysisBox content={aiResult} isLoading={aiLoading} onClose={() => setAiResult(null)} />
              </div>
            </Card>

            {/* Formulário de Coleta Rápida */}
            <Card>
              <h3 style={{ fontWeight: 'bold', color: '#4b5563', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp style={{ color: '#2563eb' }} size={18} /> Registrar Coleta / Reposição
              </h3>
              <form onSubmit={handleAddCollection} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input 
                  label="Valor Retirado (R$)" 
                  name="amount" 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  required 
                />
                <Input 
                  label="Produtos Repostos (Qtd)" 
                  name="restock" 
                  type="number" 
                  placeholder="0" 
                  min="0"
                />
                <Button variant="success" style={{ width: '100%', marginTop: '16px', padding: '12px', boxShadow: '0 4px 6px -1px rgba(52, 211, 153, 0.5)' }}>
                  Confirmar Coleta e Atualizar Estoque
                </Button>
              </form>
            </Card>

            {/* Histórico Recente da Máquina */}
            <div>
              <h3 style={{ fontWeight: 'bold', color: '#4b5563', fontSize: '14px', textTransform: 'uppercase', marginBottom: '12px', marginLeft: '4px' }}>Histórico (Últimas 5)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {transactions
                  .filter(t => t.machineId === selectedMachine.id)
                  .slice(0, 5)
                  .map(t => (
                  <div key={t.id} style={{ backgroundColor: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#4b5563' }}>
                        {t.type === 'collection' ? 'Coleta de Vendas' : 'Transação'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                        {new Date(t.date).toLocaleDateString('pt-BR')} | {new Date(t.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '16px' }}>+ {formatCurrency(t.amount)}</div>
                      {t.restocked > 0 && <div style={{ fontSize: '12px', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>+{t.restocked} itens</div>}
                    </div>
                  </div>
                ))}
                {transactions.filter(t => t.machineId === selectedMachine.id).length === 0 && (
                  <p style={{ textAlign: 'center', fontSize: '14px', color: '#9ca3af', padding: '16px', border: '2px dashed #e5e7eb', borderRadius: '8px' }}>Nenhum registro ainda para esta máquina.</p>
                )}
              </div>
            </div>

            <div style={{ paddingTop: '16px', marginTop: '32px', borderTop: '1px solid #e5e7eb' }}>
              <Button variant="danger" onClick={handleDeleteMachine} style={{ width: '100%', fontSize: '14px' }}>
                  <Trash2 size={16} /> Remover Máquina Permanentemente
              </Button>
            </div>
          </div>
        )}

        {/* ADICIONAR MÁQUINA VIEW */}
        {view === 'add-machine' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button 
                onClick={() => setView('machines')} 
                style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', fontWeight: '500', transition: 'color 0.2s', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <ChevronLeft size={16} /> Cancelar Cadastro
            </button>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>Nova Máquina</h2>
            <Card>
              <form onSubmit={handleAddMachine} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input label="Nome / Identificação" name="name" placeholder="Ex: Máquina 01 - Padaria Central" required />
                <Input label="Localização" name="location" placeholder="Ex: Rua das Flores, 123" required />
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Input label="Tipo de Produto" name="type" placeholder="Ex: Bolinha, Pokemon" defaultValue="Bolinha" />
                  <Input label="Capacidade Total (Qtd)" name="capacity" type="number" defaultValue="200" required min="1" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Input label="Preço da Jogada (R$)" name="price" type="number" step="0.01" defaultValue="2.00" required min="0.01" />
                  <Input label="Custo Unitário do Item (R$)" name="cost" type="number" step="0.01" defaultValue="0.50" required min="0.01" />
                </div>
                <Button variant="primary" style={{ width: '100%', marginTop: '16px', padding: '12px', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)' }}>
                  <Plus size={18} /> Cadastrar Máquina
                </Button>
              </form>
            </Card>
          </div>
        )}

        {/* --- Diagnóstico de Conexão --- */}
        <div style={{ paddingTop: '32px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: user ? '#10b981' : '#f59e0b' }}>
            <Wifi size={12} />
            Status: {user ? 'Conectado (Auth OK)' : 'Aguardando autenticação...'}
          </div>
          <p style={{ overflowWrap: 'break-word', padding: '0 16px' }}>UID: {user ? user.uid : 'Aguardando ID...'}</p>
        </div>

      </main>

      {/* Navegação Inferior Fixa */}
      <nav style={navBarStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', maxWidth: '512px', margin: '0 auto' }}>
          {/* Dashboard Button */}
          <button 
            onClick={() => setView('dashboard')}
            style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'color 0.2s', color: view === 'dashboard' ? '#2563eb' : '#9ca3af' }}
          >
            <LayoutDashboard size={22} />
            <span style={{ fontSize: '10px', fontWeight: '500' }}>Início</span>
          </button>
          
          {/* Add Button (Floating) */}
          <div style={{ position: 'relative', top: '-16px' }}>
            <button 
              onClick={() => setView('add-machine')}
              style={{ backgroundColor: '#2563eb', color: 'white', padding: '16px', borderRadius: '9999px', boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.5)', transition: 'transform 0.2s', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={24} />
            </button>
          </div>

          {/* Machines Button */}
          <button 
            onClick={() => setView('machines')}
            style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'color 0.2s', color: view === 'machines' || view === 'details' || view === 'add-machine' ? '#2563eb' : '#9ca3af' }}
          >
            <Package size={22} />
            <span style={{ fontSize: '10px', fontWeight: '500' }}>Máquinas</span>
          </button>
        </div>
      </nav>
    </div>
  );
}