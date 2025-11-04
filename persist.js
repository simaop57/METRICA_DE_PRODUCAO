// Constantes de Comissão
const COMMISSION_RATE = 0.01; // R$ 0,01 por unidade acima da meta (chapa)

// --- Configuração das Máquinas (Com duplas fixas de operadores) ---
const machineConfig = {
    'SCM': {
        name: 'SCM (Seccionadora)',
        unit: 'Peças',
        rateLabel: 'Peças/H',
        defaultTarget: 500,
        isCommissionable: true,
        numOperators: 2,
        operators: ['Dionei', 'Alvaro'] // Dupla Fixa
    },
    'Giben': {
        name: 'Giben (Seccionadora)',
        unit: 'Peças',
        rateLabel: 'Peças/H',
        defaultTarget: 500,
        isCommissionable: true,
        numOperators: 2,
        operators: ['Davi', 'Iago'] // Dupla Fixa
    },
    'Romani': {
        name: 'Homag (Coladeira)',
        unit: 'Metros',
        rateLabel: 'Metros/H',
        defaultTarget: 2500,
        isCommissionable: true, // Homag/Romani é comissionável, com operador vazio (tratado no setupOperatorFields)
        numOperators: 2,
        operators: ['', ''] // Dupla VAZIA - O JS exibe como '-'
    },
};
const machineList = Object.keys(machineConfig);
let currentMachine = machineList[0];
let maxDailyTarget = 0; // Será carregado do localStorage ou default
let currentContentTab = 'dashboard';
let currentReportMonth = ''; // Variável para armazenar o mês selecionado para filtro

let productivityChart = null;
let allRecords = []; // Armazena todos os registros em memória

// Elementos do DOM
const machineTabsContainer = document.getElementById('machine-tabs');
const currentTargetDisplay = document.getElementById('current-target');
const targetForm = document.getElementById('target-form');
const targetInput = document.getElementById('target-input');
const productionForm = document.getElementById('production-form');
const recordsTableBody = document.getElementById('records-table-body');
const currentMachineTitle = document.getElementById('current-machine-title');
const commissionSummaryBody = document.getElementById('commission-summary-body');
const monthFilter = document.getElementById('month-filter'); // NOVO ELEMENTO

// Elementos de Abas
const contentDashboard = document.getElementById('content-dashboard');
const contentReport = document.getElementById('content-report');

// Elementos que mudam dinamicamente
const targetUnitDisplay = document.getElementById('target-unit-display');
const metersLabel = document.getElementById('meters-label');
const chartMainLabel = document.getElementById('chart-main-label');
const tableMainMetricHeader = document.getElementById('table-main-metric-header');

// Elementos dos Operadores (Display e Hidden Input)
const operator1Display = document.getElementById('operator1-display');
const operator2Display = document.getElementById('operator2-display');
const operator1Input = document.getElementById('operator1');
const operator2Input = document.getElementById('operator2');

// Elementos do Modal de Confirmação
const confirmationModal = document.getElementById('confirmation-modal');
const cancelDeleteButton = document.getElementById('cancel-delete');
const confirmDeleteButton = document.getElementById('confirm-delete');
let deleteCallback = null;

// Função de Alerta Customizada
const showAlert = (message, type = 'info') => {
    const container = document.getElementById('alert-container');
    const alertDiv = document.createElement('div');
    let bgColor = 'bg-blue-100';
    let textColor = 'text-blue-800';
    let icon = 'ℹ️';

    if (type === 'success') {
        bgColor = 'bg-green-100';
        textColor = 'text-green-800';
        icon = '✅';
    } else if (type === 'error') {
        bgColor = 'bg-red-100';
        textColor = 'text-red-800';
        icon = '❌';
    }

    alertDiv.className = `${bgColor} ${textColor} p-3 rounded-lg shadow-md max-w-sm transition-opacity duration-300 opacity-0`;
    alertDiv.innerHTML = `<div class="flex items-center"><span class="mr-2">${icon}</span><span>${message}</span></div>`;

    container.prepend(alertDiv);

    // Fade in
    setTimeout(() => alertDiv.style.opacity = '1', 10);

    // Fade out and remove
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        setTimeout(() => alertDiv.remove(), 300);
    }, 5000);
};

// Função para mostrar o modal de confirmação
const showConfirmationModal = (callback) => {
    deleteCallback = callback;
    confirmationModal.classList.remove('hidden');
    confirmationModal.classList.add('flex');
};

// Lógica de exclusão e modal
cancelDeleteButton.onclick = () => {
    confirmationModal.classList.add('hidden');
    confirmationModal.classList.remove('flex');
    deleteCallback = null;
};

confirmDeleteButton.onclick = () => {
    if (deleteCallback) {
        deleteCallback();
    }
    confirmationModal.classList.add('hidden');
    confirmationModal.classList.remove('flex');
    deleteCallback = null;
};

// --- Operações de Dados em Memória / LocalStorage ---

// Salvar/Atualizar a Meta de Produtividade (Persistência via LocalStorage)
const saveTargetProductivity = (newTarget) => {
    maxDailyTarget = newTarget;
    currentTargetDisplay.textContent = newTarget.toLocaleString('pt-BR');
    localStorage.setItem(`target_${currentMachine}`, newTarget);
    showAlert(`Meta de produtividade para ${currentMachine} atualizada para ${newTarget} ${machineConfig[currentMachine].unit}/dia.`, 'success');
    renderUI();
};

// Carregar a Meta de Produtividade (Persistência via LocalStorage)
const fetchCurrentTarget = () => {
    const config = machineConfig[currentMachine];
    const storedTarget = localStorage.getItem(`target_${currentMachine}`);

    // Tenta carregar do localStorage, senão usa a meta padrão
    const newTarget = storedTarget ? parseFloat(storedTarget) : config.defaultTarget;

    maxDailyTarget = newTarget;
    currentTargetDisplay.textContent = newTarget.toLocaleString('pt-BR');

    // Salva o valor padrão se não existir no localStorage
    if (!storedTarget) {
        localStorage.setItem(`target_${currentMachine}`, newTarget);
    }
};


// Função de SALVAMENTO: Exporta o array allRecords para um novo arquivo Excel
const saveDataAndExport = () => {
    if (typeof XLSX === 'undefined') {
        showAlert("Erro: Biblioteca SheetJS (xlsx.full.min.js) não carregada.", 'error');
        return;
    }
    
    // 1. Prepara os dados para exportação
    // Seleciona as colunas relevantes e formata para o Excel
    const dataForExport = allRecords.map(record => ({
        'ID (Sistema)': record.id,
        'Máquina': machineConfig[record.machine] ? machineConfig[record.machine].name : record.machine,
        'Data': record.date,
        'Operador 1': record.operator1,
        'Operador 2': record.operator2,
        'Horas Trabalhadas': record.hours,
        'Métrica Principal (Produzido)': record.meters,
        'Produtividade/H': record.productivity_m_h.toFixed(2),
        '% da Meta Diária': record.productivity_percent ? record.productivity_percent.toFixed(1) + '%' : '',
        'Unidades Comissionáveis': record.commissionUnits,
        'Comissão Total (R$)': record.totalCommission.toFixed(2),
    }));

    // 2. Cria a planilha (Worksheet) a partir dos objetos JSON
    const worksheet = XLSX.utils.json_to_sheet(dataForExport);
    
    // 3. Cria a pasta de trabalho (Workbook) e anexa a planilha
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Registros de Produção");

    // 4. Exporta o arquivo
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Producao_Atualizada_${dateStr}.xlsx`);
    
    showAlert("Dados exportados para Excel com sucesso! Use este arquivo como seu novo banco de dados.", 'success');
};
// Expor a função saveDataAndExport
window.saveDataAndExport = saveDataAndExport;


// Salvar um Novo Registro de Produção (Em memória)
const saveProductionRecord = (record) => {
    // Adiciona um ID único e timestamp
    const newRecord = {
        ...record,
        id: crypto.randomUUID(),
        timestamp: Date.now()
    };

    allRecords.push(newRecord);

    showAlert("Registro de produção salvo com sucesso. Baixando o novo arquivo Excel...", 'success');
    
    // Salva e exporta para o Excel, simulando a persistência
    saveDataAndExport();

    productionForm.reset();
    document.getElementById('date').valueAsDate = new Date();
    setupOperatorFields(currentMachine); 

    // Atualiza o filtro de mês caso um novo mês tenha sido adicionado
    setupMonthFilter();

    renderUI(); // Re-renderiza a UI com os novos dados
};

// Deletar um Registro (Em memória)
const deleteRecord = (recordId) => {
    showConfirmationModal(() => {
        const initialLength = allRecords.length;
        allRecords = allRecords.filter(r => r.id !== recordId);

        if (allRecords.length < initialLength) {
            showAlert("Registro deletado com sucesso. Baixando o novo arquivo Excel...", 'success');
            
            // Salva e exporta para o Excel, simulando a persistência
            saveDataAndExport();
            
            // Atualiza o filtro de mês caso o último registro de um mês tenha sido deletado
            setupMonthFilter();

            renderUI();
        } else {
            showAlert("Erro ao deletar: Registro não encontrado.", 'error');
        }
    });
};


// --- Lógica de Leitura do Excel ---

// Função que lê os dados binários do Excel e popula o allRecords
const readExcelData = (data) => {
    try {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Converte a planilha para um array de objetos JSON
        const jsonRecords = XLSX.utils.sheet_to_json(worksheet);

        // Mapeia e sanitiza os dados para o formato interno do app
        const newRecords = jsonRecords.map(item => {
            // Conversões de tipo e fallback
            const machineKey = Object.keys(machineConfig).find(key => machineConfig[key].name === item['Máquina']) || 'SCM';
            const meters = parseInt(item['Métrica Principal (Produzido)']) || 0;
            const hours = parseFloat(item['Horas Trabalhadas']) || 0;
            const commissionUnits = parseInt(item['Unidades Comissionáveis']) || 0;
            const totalCommission = parseFloat(item['Comissão Total (R$)']) || 0;
            
            // Calcula métricas que dependem dos dados lidos
            const productivity_m_h = hours > 0 ? (meters / hours) : 0;
            
            // maxDailyTarget não está disponível aqui, productivity_percent será calculado em renderUI

            return {
                id: item['ID (Sistema)'] || crypto.randomUUID(),
                machine: machineKey, 
                date: item['Data'],
                operator1: item['Operador 1'],
                operator2: item['Operador 2'],
                hours: hours,
                meters: meters,
                productivity_m_h: productivity_m_h,
                // productivity_percent (será preenchido no render)
                commissionUnits: commissionUnits,
                totalCommission: totalCommission,
                timestamp: Date.now(),
            };
        }).filter(r => r.date && r.machine); // Filtra registros que não têm data ou máquina válida

        allRecords = newRecords;
        showAlert(`Dados carregados com sucesso! ${allRecords.length} registros encontrados.`, 'success');
        setupMonthFilter(); // NOVO: Atualiza as opções do filtro de mês
        renderUI(); // Renderiza a UI com os dados carregados
    } catch (e) {
        console.error("Erro ao processar o arquivo Excel:", e);
        showAlert("Erro ao processar o arquivo Excel. Verifique se o formato das colunas está correto (use o arquivo mais recente exportado pelo app).", 'error');
    }
}

// Handler para o input de arquivo
const handleFileSelect = (evt) => {
    const file = evt.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = e.target.result;
        readExcelData(data);
    };
    reader.onerror = (e) => {
        showAlert("Erro ao ler o arquivo.", 'error');
    };
    reader.readAsBinaryString(file);
};


// --- Geração de Dados Fictícios Estáticos (MANTIDA MAS NÃO CHAMADA) ---

const generateDummyData = () => {
    // ... (função mantida mas não chamada, não alterada)
};


// --- Visualização de Dados e Atualização da UI ---

const setupOperatorFields = (machineName) => {
    const config = machineConfig[machineName];

    const op1 = config.operators[0] || '';
    const op2 = config.operators[1] || '';
    
    // Se o nome do operador for vazio, exibe '-'
    operator1Display.textContent = op1 || '-';
    operator2Display.textContent = op2 || '-';

    // O valor do input hidden deve ser o nome real (pode ser '') para o persist.js
    operator1Input.value = op1;
    operator2Input.value = op2;
};

const updateUIMetrics = (machineName) => {
    const config = machineConfig[machineName];

    targetUnitDisplay.textContent = `${config.unit}/dia`;
    targetInput.placeholder = `Nova Meta (${config.unit})`;

    metersLabel.textContent = `${config.unit} Produzidos (${config.unit.toLowerCase().charAt(0)})`;

    chartMainLabel.textContent = config.unit;

    tableMainMetricHeader.textContent = `${config.unit} (${config.unit.toLowerCase().charAt(0)})`;

    currentMachineTitle.textContent = config.name;

    setupOperatorFields(machineName);
};

// NOVO: Função para popular o filtro de mês
const setupMonthFilter = () => {
    if (!monthFilter) return;

    // 1. Extrai meses únicos (YYYY-MM) de todos os registros
    const availableMonths = new Set();
    allRecords.forEach(record => {
        if (record.date) {
            // Assume record.date is in YYYY-MM-DD format
            availableMonths.add(record.date.substring(0, 7)); 
        }
    });

    const sortedMonths = Array.from(availableMonths).sort().reverse();
    
    // 2. Limpa e adiciona a opção "Todos os Meses"
    monthFilter.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Todos os Meses (Acumulado)';
    monthFilter.appendChild(allOption);
    
    // 3. Adiciona os meses encontrados
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    sortedMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        
        // Formata para exibição (ex: "2024-05" -> "Maio/2024")
        const [year, monthNum] = month.split('-');
        option.textContent = `${monthNames[parseInt(monthNum, 10) - 1]}/${year}`;
        
        monthFilter.appendChild(option);
    });

    // 4. Mantém a seleção anterior ou define 'Todos' como padrão
    monthFilter.value = currentReportMonth;
    if (monthFilter.value !== currentReportMonth) {
         currentReportMonth = monthFilter.value;
    }
};


// Função para agregar dados por Máquina e Data para o gráfico
const aggregateDataForChart = (records, machine) => {
    const filteredRecords = records.filter(r => r.machine === machine);
    const config = machineConfig[machine];

    const aggregated = filteredRecords.reduce((acc, record) => {
        const key = record.date;

        if (!acc[key]) {
            acc[key] = {
                date: record.date,
                totalMeters: 0,
            };
        }

        acc[key].totalMeters += record.meters;

        return acc;
    }, {});

    const sortedData = Object.values(aggregated).sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = sortedData.map(item => item.date);
    const metersData = sortedData.map(item => item.totalMeters);

    return { labels, metersData, unit: config.unit };
};


// Função para renderizar o Gráfico de Linhas (Métrica Principal)
const renderChart = (data) => {
    if (productivityChart) {
        productivityChart.destroy();
    }

    const ctx = document.getElementById('productivityChart').getContext('2d');
    productivityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: `${data.unit} Produzidos`,
                    data: data.metersData,
                    borderColor: '#3b82f6', 
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: `${data.unit} Produzidos`
                    },
                    min: 0
                },
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: `Desempenho Diário da Máquina: ${currentMachine}`
                }
            }
        }
    });
};

// Renderiza o Relatório de Comissões (Divide por 2)
const renderCommissionReport = (records) => {
    // 1. Aplica o filtro da máquina
    let filteredRecords = records.filter(r => r.machine === currentMachine);
    const config = machineConfig[currentMachine];
    commissionSummaryBody.innerHTML = '';

    // 2. Aplica o filtro de mês (NOVO)
    const filterMonth = currentReportMonth; // Usa a variável global atualizada pelo listener
    
    if (filterMonth) {
        filteredRecords = filteredRecords.filter(record => 
            record.date && record.date.startsWith(filterMonth)
        );
    }
    // FIM NOVO FILTRO

    if (!config.isCommissionable) {
        commissionSummaryBody.innerHTML = `<tr><td colspan="2" class="px-6 py-4 text-center text-gray-500">A máquina ${currentMachine} não paga comissão por Unidade Bônus.</td></tr>`;
        return;
    }

    const operatorTotals = {};

    filteredRecords.forEach(record => {
        const commission = record.totalCommission || 0;
        const commissionPerOperator = commission / config.numOperators;

        // Se o nome do operador for vazio, usa um placeholder para garantir que é listado
        const op1 = record.operator1 || 'Operador 1 Não Nomeado';
        const op2 = record.operator2 || 'Operador 2 Não Nomeado';

        operatorTotals[op1] = (operatorTotals[op1] || 0) + commissionPerOperator;
        operatorTotals[op2] = (operatorTotals[op2] || 0) + commissionPerOperator;
    });

    const operators = Object.keys(operatorTotals)
        // Filtra para remover o placeholder de operador 'Operador 1 Não Nomeado' se ele não tiver comissão e o campo original for vazio
        .filter(op => op && op !== '-' && (operatorTotals[op] > 0 || filteredRecords.some(r => r.operator1 === op || r.operator2 === op)))
        .sort();

    if (operators.length === 0) {
        const monthLabel = filterMonth ? ` em ${monthFilter.options[monthFilter.selectedIndex].text}` : '';
        commissionSummaryBody.innerHTML = `<tr><td colspan="2" class="px-6 py-4 text-center text-gray-500">Nenhum registro comissionável encontrado para esta máquina${monthLabel}.</td></tr>`;
        return;
    }

    operators.forEach(operator => {
        const totalCommission = operatorTotals[operator] || 0;
        const operatorName = operator || '-'; // Exibe '-' se o nome do operador for vazio
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';

        row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${operatorName}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${totalCommission > 0 ? 'text-green-600' : 'text-gray-500'}">
                        ${totalCommission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                `;
        commissionSummaryBody.appendChild(row);
    });
};


// Função para renderizar os dados na tabela do Dashboard
const renderDashboardData = (records, maxTarget) => {
    const filteredRecords = records
        .filter(r => r.machine === currentMachine)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    recordsTableBody.innerHTML = '';

    if (filteredRecords.length === 0) {
        recordsTableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Nenhum registro encontrado para esta máquina.</td></tr>';
    }

    filteredRecords.forEach(record => {
        // Garante que o percentual é calculado se os dados vieram do Excel e faltava o campo
        const productivity_percent = ((record.meters / maxTarget) * 100).toFixed(1);
        record.productivity_percent = parseFloat(productivity_percent); // Atualiza o objeto em memória para exportação correta

        const commissionTotal = record.totalCommission || 0;
        const commissionUnits = record.commissionUnits || 0;
        const commissionColor = commissionTotal > 0 ? 'text-green-600 font-semibold' : 'text-gray-500';

        const op1Display = record.operator1 || '-';
        const op2Display = record.operator2 || '-';

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';

        row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${record.date}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${record.meters.toLocaleString('pt-BR')}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${op1Display} / ${op2Display}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium">${commissionUnits.toLocaleString('pt-BR')}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm ${commissionColor}">${commissionTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm ${productivity_percent >= 100 ? 'text-green-600' : 'text-red-500'} font-semibold">${productivity_percent}%</td>
                    
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button class="text-red-600 hover:text-red-900 transition duration-150" onclick="window.deleteRecord('${record.id}')">Deletar</button>
                    </td>
                `;
        recordsTableBody.appendChild(row);
    });

    const chartData = aggregateDataForChart(records, currentMachine);
    renderChart(chartData);

    updateUIMetrics(currentMachine);
};

// Função principal de renderização que controla as abas
const renderUI = () => {
    fetchCurrentTarget(); 

    if (currentContentTab === 'dashboard') {
        renderDashboardData(allRecords, maxDailyTarget);
    } else if (currentContentTab === 'report') {
        renderCommissionReport(allRecords);
    }
}

// --- Inicialização e Eventos ---

// Função para alternar a máquina selecionada
const switchMachine = (machineName) => {
    currentMachine = machineName;

    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.machine === machineName) {
            btn.classList.add('active');
        }
    });

    renderUI();
};

// Função para alternar a aba de conteúdo (Dashboard/Relatório)
const switchContentTab = (tabName) => {
    currentContentTab = tabName;

    document.querySelectorAll('.content-tab-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });

    contentDashboard.classList.add('hidden');
    contentReport.classList.add('hidden');

    if (tabName === 'dashboard') {
        contentDashboard.classList.remove('hidden');
    } else if (tabName === 'report') {
        contentReport.classList.remove('hidden');
    }

    renderUI(); 
};

window.switchContentTab = switchContentTab;

// Renderiza os botões das máquinas
const setupMachineTabs = () => {
    machineTabsContainer.innerHTML = '';
    machineList.forEach(machine => {
        const button = document.createElement('button');
        button.textContent = machineConfig[machine].name;
        button.dataset.machine = machine;
        button.className = `tab-button px-4 py-2 rounded-lg transition duration-150 text-gray-700 bg-gray-200 hover:bg-gray-300 font-medium shadow-sm`;
        if (machine === currentMachine) {
            button.classList.add('active');
        }
        button.onclick = () => switchMachine(machine);
        machineTabsContainer.appendChild(button);
    });
    updateUIMetrics(currentMachine);
};

// Lógica de submissão do formulário de Produção
productionForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const date = document.getElementById('date').value;
    const metersInput = document.getElementById('meters');
    const hoursInput = document.getElementById('hours');

    const operator1 = operator1Input.value;
    const operator2 = operator2Input.value;

    const meters = parseInt(metersInput.value);
    const hours = parseFloat(hoursInput.value);

    const config = machineConfig[currentMachine];

    if (!date || isNaN(meters) || isNaN(hours) || hours <= 0 || meters < 0) {
        showAlert("Por favor, insira valores válidos (Métrica Principal >= 0, Horas > 0).", 'error');
        return;
    }

    // --- CÁLCULO DA COMISSÃO (Regra: Apenas produção acima da meta) ---
    let commissionUnits = 0;
    let totalCommission = 0;
    if (config.isCommissionable) {
        commissionUnits = Math.max(0, meters - maxDailyTarget);
        totalCommission = commissionUnits * COMMISSION_RATE;
    }

    const productivity_m_h = meters / hours;
    const productivity_percent = (meters / maxDailyTarget) * 100;

    const newRecord = {
        machine: currentMachine,
        date: date,
        meters: meters,
        hours: hours,
        productivity_m_h: productivity_m_h,
        productivity_percent: productivity_percent,
        operator1: operator1,
        operator2: operator2,
        commissionUnits: commissionUnits,
        totalCommission: totalCommission,
    };

    saveProductionRecord(newRecord);
});

// Lógica de submissão do formulário da Meta
targetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newTarget = parseFloat(targetInput.value);
    const config = machineConfig[currentMachine];

    if (isNaN(newTarget) || newTarget < 10) {
        showAlert(`Por favor, insira uma meta válida (mínimo 10 ${config.unit}/Dia).`, 'error');
        return;
    }

    saveTargetProductivity(newTarget);
});

// Expor a função deleteRecord para uso no HTML onclick
window.deleteRecord = deleteRecord;

const initApp = async () => {
    // 1. Configura os botões de máquina
    setupMachineTabs();

    // 2. Configura os campos de operador com a dupla fixa inicial
    setupOperatorFields(currentMachine);

    // 3. Configura o filtro de mês (mesmo que não haja dados, para criar o 'Todos os Meses')
    setupMonthFilter();

    // 4. ADICIONA LISTENER PARA O ARQUIVO EXCEL
    const excelFileInput = document.getElementById('excel-file-input');
    if (excelFileInput) {
        excelFileInput.addEventListener('change', handleFileSelect, false);
    } else {
        showAlert("ATENÇÃO: Não foi encontrado um campo de upload de Excel (ID 'excel-file-input'). Por favor, adicione o HTML sugerido.", 'info');
    }
    
    // 5. ADICIONA LISTENER PARA O FILTRO DE MÊS
    if (monthFilter) {
        monthFilter.addEventListener('change', () => {
            currentReportMonth = monthFilter.value; // Atualiza a variável global
            // Só re-renderiza se estiver na aba de relatório, para evitar processamento desnecessário
            if (currentContentTab === 'report') {
                renderUI(); 
            }
        });
    }

    // 6. Carrega a meta da máquina inicial e renderiza a UI (Com dados vazios se o Excel não foi carregado)
    renderUI();

    // 7. Define a data padrão
    document.getElementById('date').valueAsDate = new Date();
};

// Inicia a aplicação no carregamento da janela
window.onload = initApp;