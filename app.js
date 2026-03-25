/**
 * VLOZ TELECOM — SISTEMA DE ESTOQUE v3.0
 * Professional Architecture & Security Update
 */

 import {
  COLECOES,
  salvarDoc,
  excluirDoc,
  escutarColecao,
} from "./firebase.js";

const App = (() => {
  let state = {
      user: null, // Perfil logado: { nome, role: 'admin' | 'tecnico' }
      produtos: [],
      categorias: [],
      historico: [],
      paginaAtual: 'dashboard'
  };

  // Mapeamento de Prefixos Profissionais
  const PREFIXOS_CATEGORIA = {
      'Rede': 'RED',
      'Equipamentos': 'EQU',
      'Cabos': 'CAB',
      'Ferramentas': 'FER',
      'Escritório': 'ESC',
      'Infraestrutura': 'INF'
  };

  /**
   * Geração de SKU Inteligente
   * @param {string} categoriaId 
   */
  function gerarSKU(categoriaId) {
      const cat = state.categorias.find(c => c.id === categoriaId);
      const prefixo = PREFIXOS_CATEGORIA[cat?.nome] || 'GEN';
      
      const produtosDaCat = state.produtos.filter(p => p.categoriaId === categoriaId);
      const proximoNumero = (produtosDaCat.length + 1).toString().padStart(3, '0');
      
      return `${prefixo}-${proximoNumero}`;
  }

  /**
   * Controle de Acesso (RBAC)
   * Verifica se o usuário tem permissão de administrador
   */
  function isAdmin() {
      return state.user && state.user.role === 'admin';
  }

  /**
   * Renderização da Tabela com Trava de Segurança
   */
  function renderProdutos() {
      const tbody = document.getElementById('tabelaProdutosBody');
      if (!tbody) return;

      tbody.innerHTML = state.produtos.map(p => {
          const cat = state.categorias.find(c => c.id === p.categoriaId);
          
          // Lógica do botão de deletar: Apenas Admin vê/pode clicar
          const deleteBtn = isAdmin() 
              ? `<button class="btn-icon danger" onclick="App.deletarProduto('${p.id}')" title="Excluir">🗑</button>`
              : `<button class="btn-icon" style="opacity:0.3; cursor:not-allowed" title="Apenas administradores">🔒</button>`;

          return `
              <tr class="${p.qtd <= 0 ? 'row-zero' : (p.qtd <= p.qtdMin ? 'row-warn' : '')}">
                  <td><strong>${p.codigo}</strong></td>
                  <td>${p.nome}</td>
                  <td><span class="page-sub">${cat ? cat.nome : 'Sem Categoria'}</span></td>
                  <td><span class="ind-val">${p.qtd}</span> ${p.unidade}</td>
                  <td>${p.qtdMin}</td>
                  <td><span class="tag-status tag-${p.status}">${p.status}</span></td>
                  <td>
                      <div class="topbar-actions">
                          <button class="btn-icon" onclick="App.editarProduto('${p.id}')">✏️</button>
                          ${deleteBtn}
                      </div>
                  </td>
              </tr>
          `;
      }).join('');
  }

  /**
   * Registro de Saída com Justificativa Obrigatória
   */
  async function registrarSaida() {
      const prodId = document.getElementById('saidaProduto').value;
      const qtdSaida = Number(document.getElementById('saidaQtd').value);
      const motivo = document.getElementById('saidaMotivo').value;
      const obs = document.getElementById('saidaObs').value;

      if (!prodId || qtdSaida <= 0 || !motivo) {
          App.showToast('Preencha todos os campos obrigatórios!', 'error');
          return;
      }

      const produto = state.produtos.find(p => p.id === prodId);
      if (produto.qtd < qtdSaida) {
          App.showToast('Estoque insuficiente!', 'error');
          return;
      }

      const novaQtd = produto.qtd - qtdSaida;

      // Grava no histórico com o nome do usuário responsável
      const movimento = {
          id: 'mov_' + Date.now(),
          produtoId: prodId,
          produtoNome: produto.nome,
          tipo: 'saida',
          quantidade: qtdSaida,
          usuario: state.user.nome,
          motivo: motivo,
          justificativa: obs,
          data: new Date().toISOString()
      };

      try {
          await salvarDoc(COLECOES.produtos, { ...produto, qtd: novaQtd });
          await salvarDoc(COLECOES.historico, movimento);
          App.showToast('Baixa realizada com sucesso!');
          App.navigate('dashboard');
      } catch (e) {
          console.error(e);
          App.showToast('Erro ao processar saída', 'error');
      }
  }

  return {
      init: () => {
          // Mock de sessão para teste (isso virá do Firebase Auth no futuro)
          state.user = { nome: "Técnico Vloz", role: "tecnico" }; 
          
          escutarColecao(COLECOES.produtos, (docs) => {
              state.produtos = docs;
              renderProdutos();
          });
          escutarColecao(COLECOES.categorias, (docs) => {
              state.categorias = docs;
          });
      },
      deletarProduto: async (id) => {
          if (!isAdmin()) return App.showToast("Acesso Negado!", "error");
          if (confirm("Deseja realmente excluir este produto?")) {
              await excluirDoc(COLECOES.produtos, id);
              App.showToast("Removido.");
          }
      },
      // ... outras funções (navigate, showToast)
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
