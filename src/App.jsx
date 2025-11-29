import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
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
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { 
  LayoutDashboard, 
  MapPin, 
  Plus, 
  AlertTriangle, 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  Trash2,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Loader2,
  Lightbulb
} from 'lucide-react';

// --- Configuração do Firebase e Globais (Corrigido para evitar ReferenceError) ---

// Função de segurança para obter variáveis de ambiente/globais
const getEnvVar = (globalVar, envKey, defaultValue) => {
  if (typeof globalVar !== 'undefined') {
    return globalVar;
  }
  // Só acessa 'process.env' se 'process' estiver definido
  if (typeof process !== 'undefined' && process.env && process.env[envKey]) {
    return process.env[envKey];
  }
  return defaultValue;
};

// 1. Configuração do Firebase
const firebaseConfigString = getEnvVar(
  typeof __firebase_config !== 'undefined' ? __firebase_config : undefined,
  'REACT_APP_FIREBASE_CONFIG',
  '{}'
);
const firebaseConfig = JSON.parse(firebaseConfigString);

let app;
let auth;
let db;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  // Se a inicialização falhar (provavelmente devido a uma chave de API inválida)
  console.error("Erro CRÍTICO ao inicializar Firebase. Verifique sua chave de API.", e);
  // Crio objetos mock para evitar que o resto do código quebre
  app = null;
  auth = { currentUser: null }; 
  db = null;
}


// 2. ID do Aplicativo
const appId = getEnvVar(
  typeof __app_id !== 'undefined' ? __app_id : undefined,
  'REACT_APP_APP_ID',
  'default-app-id'
);

// 3. Chave da API Gemini (vazia aqui, será fornecida pelo backend no Canvas ou por REACT_APP_GEMINI_API_KEY no deploy)
const apiKey = getEnvVar(
  undefined,
  'REACT_APP_GEMINI_API_KEY',
  "" 
);

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
      // Nota: A variável apiKey será vazia aqui no Canvas, mas o ambiente a injeta.
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

      // Calcula o atraso com base na estratégia Exponential Backoff (1s, 2s, 4s + jitter)
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }
};

// --- Componentes UI Reutilizáveis ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', className = "", disabled = false }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all active:scale-95 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
    danger: "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200",
    ai: "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 shadow-md shadow-violet-200"
  };
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }) => (
  <div className="mb-3">
    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 ml-1">{label}</label>
    <input 
      className="w-full px-3 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all bg-gray-50 focus:bg-white"
      {...props} 
    />
  </div>
);

const AIAnalysisBox = ({ content, onClose, isLoading }) => {
  if (!content && !isLoading) return null;
  
  return (
    <div className="mt-4 bg-violet-50 border border-violet-100 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-violet-800 flex items-center gap-2">
          <Sparkles size={16} /> Análise Inteligente
        </h4>
        {!isLoading && (
          <button onClick={onClose} className="text-violet-400 hover:text-violet-600 text-xs">Fechar</button>
        )}
      </div>
      
      {isLoading ? (
        <div className="flex items-center gap-2 text-violet-600 py-4">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">Consultando IA...</span>
        </div>
      ) : (
        <div className="prose prose-sm prose-violet max-w-none text-violet-900 text-sm whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
};

// --- Componente Principal ---

export default function VendingMachineApp() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard, machines, add-machine, details
  const [machines, setMachines] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // AI States
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  // --- Autenticação e Carregamento de Dados ---
  
  useEffect(() => {
    if (!auth) return; // Se a inicialização do Firebase falhou, pare aqui.

    const initAuth = async () => {
      // Prioriza o token de autenticação do ambiente (Canvas) se existir,
      // caso contrário, usa a autenticação anônima padrão para deploy real.
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Se não há usuário logado (i.e., falha ou ainda autenticando),
      // garantir que o loading termine para não travar a tela.
      if (!currentUser && !loading) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return; // Só carrega se houver DB e usuário autenticado

    // Carregar Máquinas
    const machinesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'machines');
    const unsubMachines = onSnapshot(machinesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMachines(data);
    }, (error) => console.error("Erro ao carregar máquinas:", error));

    // Carregar Transações (Filtraremos no cliente por simplicidade de indexação)
    const transactionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
    const unsubTrans = onSnapshot(transactionsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        // Garantir que createdAt seja um objeto Date, seja de Timestamp ou Date
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
  }, [user]);

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
      if ((m.currentStock / m.capacity) < 0.25) criticalStock++; // Alerta se estoque < 25%
      
      // Lógica simplificada de prejuízo baseada em receita média mensal estimada (mock)
      const machineRevenue = transactions
        .filter(t => t.machineId === m.id)
        .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      
      // Se a máquina faturou menos de 50 reais no total e tem transações, alerta de baixo rendimento
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

  const handleGlobalAnalysis = async () => {
    if (!apiKey && typeof process === 'undefined') {
      setAiResult("ERRO: A chave da API Gemini não foi configurada. Em deploy real, configure a variável REACT_APP_GEMINI_API_KEY.");
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
    if (!apiKey && typeof process === 'undefined') {
      setAiResult("ERRO: A chave da API Gemini não foi configurada. Em deploy real, configure a variável REACT_APP_GEMINI_API_KEY.");
      return;
    }
    setAiLoading(true);
    setAiResult(null);

    // Pegar últimas 5 transações desta máquina para contexto
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

  // --- Ações ---

  const handleAddMachine = async (e) => {
    e.preventDefault();
    if (!user || !db) return;
    const form = e.target;
    const newMachine = {
      name: form.name.value,
      location: form.location.value,
      type: form.type.value, // Pokemon, Bolinha, etc.
      pricePerPlay: parseFloat(form.price.value),
      costPerItem: parseFloat(form.cost.value),
      capacity: parseInt(form.capacity.value),
      currentStock: parseInt(form.capacity.value), // Começa cheia
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'machines'), newMachine);
      setView('machines');
    } catch (error) {
      // Usando console.error em vez de alert() conforme a regra
      console.error("Erro ao salvar máquina:", error);
      setAiResult("Erro ao salvar máquina. Verifique a conexão com o banco de dados.");
    }
  };

  const handleAddCollection = async (e) => {
    e.preventDefault();
    if (!user || !db) return;
    const form = e.target;
    const collectedAmount = parseFloat(form.amount.value);
    const restockedAmount = parseInt(form.restock.value) || 0;
    
    if (!selectedMachine) return;

    // Calcular custo da reposição
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
      // Estimativa de itens vendidos baseada no valor coletado e preço da jogada
      const itemsSoldEstimate = Math.floor(collectedAmount / selectedMachine.pricePerPlay);
      
      let newStock = selectedMachine.currentStock - itemsSoldEstimate + restockedAmount;
      if (newStock > selectedMachine.capacity) newStock = selectedMachine.capacity;
      if (newStock < 0) newStock = 0;

      const machineRef = doc(db, 'artifacts', appId, 'users', user.uid, 'machines', selectedMachine.id);
      await updateDoc(machineRef, {
        currentStock: newStock,
        lastCollection: serverTimestamp()
      });

      setView('details');
    } catch (error) {
      console.error("Erro ao adicionar coleta:", error);
      setAiResult("Erro ao registrar a coleta. Verifique o formulário e a conexão.");
    }
  };

  const handleDeleteMachine = async () => {
    if (!user || !db || !selectedMachine) return;
    
    // Substituindo window.confirm por um modal simples no console (no ambiente real, seria um modal UI)
    console.log("Confirmar exclusão de máquina. (Em um app real, use um modal UI)");
    
    // Como não podemos usar window.confirm(), assumimos que o clique acionou a intenção final.
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

  // --- Views ---

  if (loading) return <div className="flex h-screen items-center justify-center text-blue-600 animate-pulse">Carregando seus negócios...</div>;

  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans text-gray-800">
      {/* Header Mobile */}
      <header className="bg-blue-600 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex justify-between items-center max-w-4xl mx-auto">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <Coins size={20} />
            Vending Manager
          </h1>
          <div className="text-xs bg-blue-700 px-2 py-1 rounded-full">
            {stats.totalMachines} Máquinas
          </div>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto space-y-6">
        
        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* AI Assistant Button */}
            <Card className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-none p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Sparkles size={100} />
              </div>
              <div className="relative z-10">
                <h3 className="font-bold text-lg flex items-center gap-2 mb-1">
                  <Sparkles size={20} className="text-yellow-300" /> Consultor IA
                </h3>
                <p className="text-violet-100 text-sm mb-4">
                  Obtenha uma análise estratégica do seu faturamento e alertas de operação.
                </p>
                <Button 
                  onClick={handleGlobalAnalysis} 
                  disabled={aiLoading}
                  className="bg-white/20 hover:bg-white/30 text-white border-none w-full text-sm"
                >
                  {aiLoading ? "Analisando..." : "Gerar Relatório do Dia"}
                </Button>
              </div>
            </Card>

            {/* AI Result Box */}
            <AIAnalysisBox content={aiResult} isLoading={aiLoading} onClose={() => setAiResult(null)} />

            {/* Resumo Financeiro */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-white border-l-4 border-l-blue-600">
                <span className="text-gray-500 text-xs uppercase font-bold">Faturamento</span>
                <div className="text-2xl font-bold mt-1 text-gray-800">{formatCurrency(stats.totalRevenue)}</div>
              </Card>
              <Card className="bg-white border-l-4 border-l-emerald-500">
                <span className="text-gray-500 text-xs uppercase font-bold">Lucro Líquido</span>
                <div className="text-2xl font-bold mt-1 text-gray-800 flex items-center gap-1">
                  {formatCurrency(stats.netProfit)}
                </div>
              </Card>
            </div>

            {/* Alertas */}
            {(stats.criticalStock > 0 || stats.unprofitable > 0) && (
              <div className="space-y-3">
                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                  <AlertTriangle className="text-amber-500" size={18} /> Ações Necessárias
                </h3>
                {stats.criticalStock > 0 && (
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-lg text-sm text-amber-900 flex justify-between items-center">
                    <span><b>{stats.criticalStock} máquinas</b> precisam de reposição urgente.</span>
                    <Button variant="secondary" className="text-xs py-1 px-2 h-auto" onClick={() => setView('machines')}>Ver</Button>
                  </div>
                )}
                {stats.unprofitable > 0 && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-lg text-sm text-red-900 flex justify-between items-center">
                    <span><b>{stats.unprofitable} máquinas</b> com baixo rendimento. Considere mudar de local.</span>
                    <Button variant="secondary" className="text-xs py-1 px-2 h-auto" onClick={() => setView('machines')}>Ver</Button>
                  </div>
                )}
              </div>
            )}

            {/* Gráfico */}
            <Card>
              <h3 className="font-bold text-gray-700 mb-4">Fluxo de Caixa (Últimos Lançamentos)</h3>
              <div className="h-48 w-full -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[...transactions].reverse().slice(-10)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="date" tickFormatter={(date) => new Date(date).getDate() + '/' + (new Date(date).getMonth() + 1)} tick={{fontSize: 10}} />
                    <YAxis tick={{fontSize: 10}} />
                    <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                    <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* LISTA DE MÁQUINAS VIEW */}
        {view === 'machines' && (
          <div className="space-y-4 animate-in slide-in-from-right-10 duration-300">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-gray-700 text-lg">Suas Máquinas</h2>
              <Button onClick={() => setView('add-machine')} variant="primary" className="text-sm px-3">
                <Plus size={16} /> Nova
              </Button>
            </div>

            <div className="grid gap-3">
              {machines.map(machine => {
                const stockPercent = (machine.currentStock / machine.capacity) * 100;
                const isCritical = stockPercent < 25;
                const statusColor = isCritical ? 'bg-red-500' : (stockPercent < 50 ? 'bg-amber-500' : 'bg-emerald-500');

                return (
                  <Card key={machine.id} className="active:scale-[0.99] transition-transform cursor-pointer hover:shadow-md p-0 overflow-hidden">
                    <div onClick={() => { setSelectedMachine(machine); setView('details'); }} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-gray-800">{machine.name}</h3>
                          <div className="flex items-center text-xs text-gray-500 mt-1 gap-1">
                            <MapPin size={12} /> {machine.location}
                          </div>
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-bold text-white ${statusColor}`}>
                          {stockPercent.toFixed(0)}% Estoque
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-end mt-3">
                        <div className="text-xs text-gray-500">
                           {machine.type} • {formatCurrency(machine.pricePerPlay)}/play
                        </div>
                        <div className="text-blue-600 text-sm font-semibold flex items-center gap-1">
                          Gerenciar <ArrowUpRight size={14} />
                        </div>
                      </div>
                    </div>
                    {/* Progress Bar Visual */}
                    <div className="h-1 w-full bg-gray-100">
                      <div 
                        className={`h-full transition-all duration-500 ${statusColor}`} 
                        style={{ width: `${stockPercent}%` }}
                      />
                    </div>
                  </Card>
                );
              })}
              {machines.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  Nenhuma máquina cadastrada.
                </div>
              )}
            </div>
          </div>
        )}

        {/* DETALHES DA MÁQUINA VIEW */}
        {view === 'details' && selectedMachine && (
          <div className="space-y-5 animate-in slide-in-from-right-10 duration-300">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setView('machines')} className="text-gray-500 hover:text-gray-800">
                &larr; Voltar
              </button>
            </div>

            <Card className="border-t-4 border-t-blue-500">
              <div className="flex justify-between">
                <div>
                    <h2 className="text-xl font-bold">{selectedMachine.name}</h2>
                    <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin size={14}/> {selectedMachine.location}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Estoque Atual</div>
                  <div className={`text-xl font-bold ${selectedMachine.currentStock < selectedMachine.capacity * 0.25 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {selectedMachine.currentStock}/{selectedMachine.capacity}
                  </div>
                </div>
              </div>
              
              <div className="mt-6 grid grid-cols-2 gap-2">
                   <div className="bg-gray-50 p-3 rounded-lg text-center">
                     <span className="block text-xs text-gray-500">Preço Venda</span>
                     <strong className="text-gray-800">{formatCurrency(selectedMachine.pricePerPlay)}</strong>
                   </div>
                   <div className="bg-gray-50 p-3 rounded-lg text-center">
                     <span className="block text-xs text-gray-500">Custo Produto</span>
                     <strong className="text-gray-800">{formatCurrency(selectedMachine.costPerItem)}</strong>
                   </div>
              </div>

              {/* Botão AI Machine Analysis */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Button 
                  onClick={handleMachineAnalysis} 
                  disabled={aiLoading}
                  variant="ai"
                  className="w-full text-sm py-2"
                >
                  <Lightbulb size={16} className="text-yellow-200" /> 
                  {aiLoading ? "Analisando..." : "Auditar este Ponto com IA"}
                </Button>
                <AIAnalysisBox content={aiResult} isLoading={aiLoading} onClose={() => setAiResult(null)} />
              </div>
            </Card>

            {/* Formulário de Coleta Rápida */}
            <Card>
              <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                <TrendingUp className="text-blue-600" size={18} /> Nova Coleta / Visita
              </h3>
              <form onSubmit={handleAddCollection} className="space-y-4">
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
                />
                <Button variant="success" className="w-full py-3 text-lg">
                  Confirmar Coleta
                </Button>
              </form>
            </Card>

            {/* Histórico Recente da Máquina */}
            <div>
              <h3 className="font-bold text-gray-600 text-sm uppercase mb-3 ml-1">Histórico Recente</h3>
              <div className="space-y-2">
                {transactions
                  .filter(t => t.machineId === selectedMachine.id)
                  .slice(0, 5)
                  .map(t => (
                  <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 flex justify-between items-center text-sm shadow-sm">
                    <div>
                      <div className="font-semibold text-gray-700">Coleta</div>
                      <div className="text-xs text-gray-400">
                        {new Date(t.date).toLocaleDateString()} às {new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                    <div className="text-right">
                       <div className="text-emerald-600 font-bold">+ {formatCurrency(t.amount)}</div>
                       {t.restocked > 0 && <div className="text-xs text-blue-500">+{t.restocked} itens</div>}
                    </div>
                  </div>
                ))}
                {transactions.filter(t => t.machineId === selectedMachine.id).length === 0 && (
                   <p className="text-center text-sm text-gray-400 py-4">Nenhum registro ainda.</p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              {/* Em um app real, aqui você implementaria um modal de confirmação */}
              <Button variant="danger" onClick={handleDeleteMachine} className="w-full text-sm">
                  <Trash2 size={16} /> Remover Máquina
              </Button>
            </div>
          </div>
        )}

        {/* ADICIONAR MÁQUINA VIEW */}
        {view === 'add-machine' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setView('machines')} className="text-gray-500 hover:text-gray-800">
                &larr; Cancelar
              </button>
            </div>
            <h2 className="text-xl font-bold text-gray-800">Nova Máquina</h2>
            <Card>
              <form onSubmit={handleAddMachine} className="space-y-4">
                <Input label="Nome / Identificação" name="name" placeholder="Ex: Máquina 01 - Padaria" required />
                <Input label="Localização" name="location" placeholder="Ex: Rua das Flores, 123" required />
                <div className="grid grid-cols-2 gap-4">
                   <Input label="Tipo" name="type" placeholder="Ex: Bolinha, Pokemon" defaultValue="Bolinha" />
                   <Input label="Capacidade Total" name="capacity" type="number" defaultValue="200" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <Input label="Preço da Jogada (R$)" name="price" type="number" step="0.50" defaultValue="2.00" required />
                   <Input label="Custo Unitário do Item (R$)" name="cost" type="number" step="0.01" defaultValue="0.50" required />
                </div>
                <Button className="w-full mt-4 py-3">Cadastrar Máquina</Button>
              </form>
            </Card>
          </div>
        )}

      </main>

      {/* Navegação Inferior (App Style) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg pb-safe">
        <div className="flex justify-around items-center max-w-4xl mx-auto">
          <button 
            onClick={() => setView('dashboard')}
            className={`p-4 flex flex-col items-center gap-1 ${view === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <LayoutDashboard size={20} />
            <span className="text-[10px] font-medium">Início</span>
          </button>
          
          <div className="relative -top-5">
            <button 
              onClick={() => setView('add-machine')}
              className="bg-blue-600 text-white p-4 rounded-full shadow-lg shadow-blue-200 hover:scale-105 transition-transform"
            >
              <Plus size={24} />
            </button>
          </div>

          <button 
            onClick={() => setView('machines')}
            className={`p-4 flex flex-col items-center gap-1 ${view === 'machines' || view === 'details' || view === 'add-machine' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <Package size={20} />
            <span className="text-[10px] font-medium">Máquinas</span>
          </button>
        </div>
      </nav>
    </div>
  );
}